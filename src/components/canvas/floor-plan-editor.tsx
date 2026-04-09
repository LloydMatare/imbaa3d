"use client";

import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Circle,
  Group,
  Image as KonvaImage,
  Layer,
  Line,
  Rect,
  Stage,
  Transformer,
  Text,
} from "react-konva";
import Konva from "konva";
import { toast } from "sonner";
import { useFloorPlanStore } from "@/lib/store/use-floorplan-store";
import {
  type FloorPlanTool,
  upgradeFloorPlanDoc,
  upgradeFloorPlanDocWithReport,
  summarizeFloorPlanUpgradeReport,
  safeUpgradeFloorPlanDoc,
} from "@/lib/floorplan/types";
import {
  detectWallLoops,
  filterInteriorRooms,
  roomExists,
} from "@/lib/floorplan/room-detection";
import type { FloorPlanItemType, FloorPlanOpeningKind, FloorPlanItem } from "@/lib/floorplan/types";

const PREFS_STORAGE_KEY = "imbaa3d.floorplan.prefs.v1";
const TUTORIAL_STORAGE_KEY = "imbaa3d.tutorial.completed.v1";
const MAX_FLOORPLAN_JSON_BYTES = 900_000; // keep in sync with server guard

const FLOOR_PLAN_TEMPLATES: Record<string, { name: string; data: string }> = {
  "studio-apartment": {
    name: "Studio Apartment",
    data: JSON.stringify({
      version: 3,
      title: "Studio Apartment",
      pxPerMeter: 50,
      gridSize: 50,
      walls: [
        { id: "w1", x1: 150, y1: 150, x2: 550, y2: 150, thickness: 10 },
        { id: "w2", x1: 550, y1: 150, x2: 550, y2: 450, thickness: 10 },
        { id: "w3", x1: 550, y1: 450, x2: 150, y2: 450, thickness: 10 },
        { id: "w4", x1: 150, y1: 450, x2: 150, y2: 150, thickness: 10 },
        { id: "w5", x1: 300, y1: 150, x2: 300, y2: 300, thickness: 10 },
      ],
      openings: [
        { id: "d1", wallId: "w4", kind: "door", x: 200, w: 80, flip: false },
        { id: "w1", wallId: "w1", kind: "window", x: 250, w: 100, flip: false },
        { id: "w2", wallId: "w2", kind: "window", x: 250, w: 100, flip: false },
        { id: "w3", wallId: "w3", kind: "window", x: 250, w: 100, flip: false },
      ],
      items: [
        { id: "i1", type: "bed", x: 350, y: 350, w: 100, h: 150, rotation: 0 },
        { id: "i2", type: "sofa", x: 180, y: 180, w: 90, h: 50, rotation: 0 },
        { id: "i3", type: "table", x: 250, y: 220, w: 60, h: 40, rotation: 0 },
      ],
      rooms: [
        { id: "r1", name: "Living/Bedroom", points: [{ x: 150, y: 150 }, { x: 550, y: 150 }, { x: 550, y: 450 }, { x: 150, y: 450 }] },
      ],
      stage: { x: 0, y: 0, scale: 1 },
      meta: {},
    }),
  },
  "office-space": {
    name: "Office Space",
    data: JSON.stringify({
      version: 3,
      title: "Office Space",
      pxPerMeter: 50,
      gridSize: 50,
      walls: [
        { id: "w1", x1: 100, y1: 100, x2: 700, y2: 100, thickness: 10 },
        { id: "w2", x1: 700, y1: 100, x2: 700, y2: 500, thickness: 10 },
        { id: "w3", x1: 700, y1: 500, x2: 100, y2: 500, thickness: 10 },
        { id: "w4", x1: 100, y1: 500, x2: 100, y2: 100, thickness: 10 },
        { id: "w5", x1: 400, y1: 100, x2: 400, y2: 300, thickness: 10 },
        { id: "w6", x1: 400, y1: 300, x2: 550, y2: 300, thickness: 10 },
      ],
      openings: [
        { id: "d1", wallId: "w1", kind: "door", x: 200, w: 80, flip: false },
        { id: "w1", wallId: "w2", kind: "window", x: 200, w: 100, flip: false },
        { id: "w2", wallId: "w3", kind: "window", x: 200, w: 100, flip: false },
      ],
      items: [
        { id: "i1", type: "desk", x: 150, y: 150, w: 80, h: 40, rotation: 0 },
        { id: "i2", type: "chair", x: 200, y: 170, w: 40, h: 40, rotation: 0 },
        { id: "i3", type: "desk", x: 450, y: 150, w: 80, h: 40, rotation: 0 },
        { id: "i4", type: "chair", x: 500, y: 170, w: 40, h: 40, rotation: 0 },
        { id: "i5", type: "cabinet", x: 600, y: 200, w: 60, h: 100, rotation: 0 },
      ],
      rooms: [
        { id: "r1", name: "Main Office", points: [{ x: 100, y: 100 }, { x: 400, y: 100 }, { x: 400, y: 300 }, { x: 100, y: 300 }] },
        { id: "r2", name: "Meeting Room", points: [{ x: 400, y: 100 }, { x: 700, y: 100 }, { x: 700, y: 300 }, { x: 550, y: 300 }, { x: 400, y: 300 }] },
        { id: "r3", name: "Storage", points: [{ x: 100, y: 300 }, { x: 550, y: 300 }, { x: 550, y: 500 }, { x: 100, y: 500 }] },
      ],
      stage: { x: 0, y: 0, scale: 1 },
      meta: {},
    }),
  },
  "1-bedroom-apartment": {
    name: "1 Bedroom Apartment",
    data: JSON.stringify({
      version: 3,
      title: "1 Bedroom Apartment",
      pxPerMeter: 50,
      gridSize: 50,
      walls: [
        { id: "w1", x1: 200, y1: 200, x2: 600, y2: 200, thickness: 10 },
        { id: "w2", x1: 600, y1: 200, x2: 600, y2: 400, thickness: 10 },
        { id: "w3", x1: 600, y1: 400, x2: 300, y2: 400, thickness: 10 },
        { id: "w4", x1: 300, y1: 400, x2: 300, y2: 600, thickness: 10 },
        { id: "w5", x1: 300, y1: 600, x2: 200, y2: 600, thickness: 10 },
        { id: "w6", x1: 200, y1: 600, x2: 200, y2: 200, thickness: 10 },
        { id: "w7", x1: 400, y1: 400, x2: 400, y2: 600, thickness: 10 },
      ],
      openings: [
        { id: "d1", wallId: "w1", kind: "door", x: 350, w: 80, flip: false },
        { id: "w1", wallId: "w2", kind: "window", x: 250, w: 100, flip: false },
        { id: "w2", wallId: "w5", kind: "window", x: 250, w: 100, flip: false },
      ],
      items: [
        { id: "i1", type: "bed", x: 450, y: 500, w: 100, h: 150, rotation: 0 },
        { id: "i2", type: "desk", x: 220, y: 220, w: 80, h: 40, rotation: 0 },
        { id: "i3", type: "chair", x: 300, y: 240, w: 40, h: 40, rotation: 0 },
      ],
      rooms: [
        { id: "r1", name: "Living Room", points: [{ x: 200, y: 200 }, { x: 600, y: 200 }, { x: 600, y: 400 }, { x: 300, y: 400 }] },
        { id: "r2", name: "Bedroom", points: [{ x: 300, y: 400 }, { x: 600, y: 400 }, { x: 600, y: 600 }, { x: 300, y: 600 }] },
      ],
      stage: { x: 0, y: 0, scale: 1 },
      meta: {},
    }),
  },
  "2-bedroom-house": {
    name: "2 Bedroom House",
    data: JSON.stringify({
      version: 3,
      title: "2 Bedroom House",
      pxPerMeter: 50,
      gridSize: 50,
      walls: [
        { id: "w1", x1: 100, y1: 100, x2: 800, y2: 100, thickness: 15 },
        { id: "w2", x1: 800, y1: 100, x2: 800, y2: 600, thickness: 15 },
        { id: "w3", x1: 800, y1: 600, x2: 100, y2: 600, thickness: 15 },
        { id: "w4", x1: 100, y1: 600, x2: 100, y2: 100, thickness: 15 },
        { id: "w5", x1: 400, y1: 100, x2: 400, y2: 300, thickness: 10 },
        { id: "w6", x1: 400, y1: 300, x2: 600, y2: 300, thickness: 10 },
        { id: "w7", x1: 600, y1: 300, x2: 600, y2: 500, thickness: 10 },
      ],
      openings: [
        { id: "d1", wallId: "w1", kind: "door", x: 200, w: 80, flip: false },
        { id: "w1", wallId: "w1", kind: "window", x: 500, w: 100, flip: false },
        { id: "w2", wallId: "w2", kind: "window", x: 200, w: 100, flip: false },
        { id: "w3", wallId: "w3", kind: "window", x: 300, w: 100, flip: false },
      ],
      items: [
        { id: "i1", type: "sofa", x: 200, y: 200, w: 120, h: 60, rotation: 0 },
        { id: "i2", type: "table", x: 300, y: 250, w: 80, h: 50, rotation: 0 },
        { id: "i3", type: "bed", x: 500, y: 400, w: 100, h: 150, rotation: 0 },
        { id: "i4", type: "desk", x: 650, y: 350, w: 80, h: 40, rotation: 0 },
      ],
      rooms: [
        { id: "r1", name: "Living Room", points: [{ x: 100, y: 100 }, { x: 400, y: 100 }, { x: 400, y: 300 }, { x: 100, y: 300 }] },
        { id: "r2", name: "Kitchen", points: [{ x: 400, y: 100 }, { x: 800, y: 100 }, { x: 800, y: 300 }, { x: 600, y: 300 }, { x: 400, y: 300 }] },
        { id: "r3", name: "Bedroom 1", points: [{ x: 100, y: 300 }, { x: 600, y: 300 }, { x: 600, y: 600 }, { x: 100, y: 600 }] },
        { id: "r4", name: "Bedroom 2", points: [{ x: 600, y: 300 }, { x: 800, y: 300 }, { x: 800, y: 600 }, { x: 600, y: 600 }] },
      ],
      stage: { x: 0, y: 0, scale: 1 },
      meta: {},
    }),
  },
};

export type FloorPlanEditorHandle = {
  exportPng: () => void;
  exportPdf: () => void;
  suggestFurniture: () => void;
  placeFurnitureAtClientPoint: (
    type: FloorPlanItemType,
    clientX: number,
    clientY: number
  ) => void;
  loadDoc: (doc: unknown) => void;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function snap(n: number, grid: number) {
  return Math.round(n / grid) * grid;
}

function maybeSnap(n: number, grid: number, enabled: boolean) {
  return enabled ? snap(n, grid) : n;
}

function uuid() {
  return crypto.randomUUID();
}

function normRotationDeg(d: number) {
  const n = Number.isFinite(d) ? d : 0;
  const m = n % 360;
  return m < 0 ? m + 360 : m;
}

function deg(rad: number) {
  return (rad * 180) / Math.PI;
}

function uprightDeg(degIn: number) {
  // Keep text upright (avoid upside-down labels).
  if (degIn > 90) return degIn - 180;
  if (degIn < -90) return degIn + 180;
  return degIn;
}

function formatLength(args: { px: number; pxPerMeter: number; units: "m" | "ft" }) {
  const pxPerMeter = args.pxPerMeter > 0 ? args.pxPerMeter : 100;
  const meters = args.px / pxPerMeter;
  if (args.units === "ft") {
    const ft = meters * 3.28084;
    return `${ft.toFixed(ft >= 10 ? 1 : 2)} ft`;
  }
  return `${meters.toFixed(meters >= 10 ? 1 : 2)} m`;
}

function computeContentBounds(args: {
  walls: { x1: number; y1: number; x2: number; y2: number }[];
  items: { x: number; y: number; w: number; h: number }[];
  openings: { x: number; y: number; w: number; h?: number }[];
  rooms: { points: { x: number; y: number }[] }[];
}) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let hasContent = false;

  for (const w of args.walls) {
    minX = Math.min(minX, w.x1, w.x2);
    minY = Math.min(minY, w.y1, w.y2);
    maxX = Math.max(maxX, w.x1, w.x2);
    maxY = Math.max(maxY, w.y1, w.y2);
    hasContent = true;
  }
  for (const it of args.items) {
    minX = Math.min(minX, it.x);
    minY = Math.min(minY, it.y);
    maxX = Math.max(maxX, it.x + it.w);
    maxY = Math.max(maxY, it.y + it.h);
    hasContent = true;
  }
  for (const op of args.openings) {
    const h = typeof op.h === "number" ? op.h : 14;
    minX = Math.min(minX, op.x);
    minY = Math.min(minY, op.y);
    maxX = Math.max(maxX, op.x + op.w);
    maxY = Math.max(maxY, op.y + h);
    hasContent = true;
  }
  for (const r of args.rooms) {
    for (const p of r.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
      hasContent = true;
    }
  }

  return { minX, minY, maxX, maxY, hasContent };
}

function pickScaleBarMeters(args: { pxPerMeter: number; mmPerPx: number; maxMm: number }) {
  const candidates = [0.5, 1, 2, 5, 10];
  const minMm = 20;
  const targetMax = Math.max(minMm, args.maxMm * 0.6);
  let best = candidates[0]!;
  let bestScore = Infinity;

  for (const meters of candidates) {
    const mm = meters * args.pxPerMeter * args.mmPerPx;
    const tooSmall = mm < minMm;
    const tooLarge = mm > targetMax;
    const score = tooSmall ? minMm - mm : tooLarge ? mm - targetMax : 0;
    if (score < bestScore) {
      bestScore = score;
      best = meters;
    }
    if (score === 0) break;
  }

  return best;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

function polygonAreaPx2(points: { x: number; y: number }[]) {
  if (points.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const q = points[(i + 1) % points.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

function polygonCentroid(points: { x: number; y: number }[]) {
  if (points.length < 3) return { x: 0, y: 0 };
  let a2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const q = points[(i + 1) % points.length]!;
    const cross = p.x * q.y - q.x * p.y;
    a2 += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (Math.abs(a2) < 1e-6) {
    let sx = 0;
    let sy = 0;
    for (const p of points) {
      sx += p.x;
      sy += p.y;
    }
    return { x: sx / points.length, y: sy / points.length };
  }
  const a = a2 / 2;
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

function formatArea(args: { px2: number; pxPerMeter: number; units: "m" | "ft" }) {
  const ppm = args.pxPerMeter > 0 ? args.pxPerMeter : 100;
  const m2 = args.px2 / (ppm * ppm);
  if (args.units === "ft") {
    const ft2 = m2 * 10.7639104167;
    return `${ft2.toFixed(ft2 >= 100 ? 0 : 1)} ft^2`;
  }
  return `${m2.toFixed(m2 >= 10 ? 1 : 2)} m^2`;
}

function snapPointToWallEndpoints(args: {
  px: number;
  py: number;
  walls: { id: string; x1: number; y1: number; x2: number; y2: number }[];
  threshold: number;
}) {
  const { px, py, walls, threshold } = args;
  let best: { x: number; y: number; dist: number } | null = null;
  for (const w of walls) {
    const d1 = Math.hypot(px - w.x1, py - w.y1);
    if (d1 <= threshold && (!best || d1 < best.dist)) {
      best = { x: w.x1, y: w.y1, dist: d1 };
    }
    const d2 = Math.hypot(px - w.x2, py - w.y2);
    if (d2 <= threshold && (!best || d2 < best.dist)) {
      best = { x: w.x2, y: w.y2, dist: d2 };
    }
  }
  return best;
}

function isEditableTarget(t: EventTarget | null) {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const b = entries[0]?.contentRect;
      if (!b) return;
      setSize({ width: Math.round(b.width), height: Math.round(b.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, size };
}

function getWorldPointer(stage: Konva.Stage): { x: number; y: number } | null {
  const p = stage.getPointerPosition();
  if (!p) return null;
  const t = stage.getAbsoluteTransform().copy();
  t.invert();
  const pt = t.point(p);
  return { x: pt.x, y: pt.y };
}

function worldFromClientPoint(args: {
  stage: Konva.Stage;
  clientX: number;
  clientY: number;
}): { x: number; y: number } | null {
  const { stage, clientX, clientY } = args;
  const rect = stage.container().getBoundingClientRect();
  const p = { x: clientX - rect.left, y: clientY - rect.top };
  const t = stage.getAbsoluteTransform().copy();
  t.invert();
  const pt = t.point(p);
  return { x: pt.x, y: pt.y };
}

function projectPointToSegment(args: {
  px: number;
  py: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}) {
  const { px, py, x1, y1, x2, y2 } = args;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) {
    const dist = Math.hypot(px - x1, py - y1);
    return { x: x1, y: y1, t: 0, dist };
  }
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = clamp(t, 0, 1);
  const x = x1 + t * dx;
  const y = y1 + t * dy;
  const dist = Math.hypot(px - x, py - y);
  return { x, y, t, dist };
}

function snapPointToWalls(args: {
  px: number;
  py: number;
  walls: { id: string; x1: number; y1: number; x2: number; y2: number }[];
  threshold: number;
  gridSize: number;
}) {
  const { px, py, walls, threshold, gridSize } = args;
  let best:
    | {
        wallId: string;
        x: number;
        y: number;
        t: number;
        wallLen: number;
        rotation: number;
        dist: number;
      }
    | null = null;

  for (const w of walls) {
    const proj = projectPointToSegment({
      px,
      py,
      x1: w.x1,
      y1: w.y1,
      x2: w.x2,
      y2: w.y2,
    });
    if (proj.dist > threshold) continue;

    const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
    const snappedDist = len > 0 ? snap(proj.t * len, gridSize) : 0;
    const t2 = len > 0 ? clamp(snappedDist / len, 0, 1) : 0;
    const x = w.x1 + (w.x2 - w.x1) * t2;
    const y = w.y1 + (w.y2 - w.y1) * t2;
    const rotation = deg(Math.atan2(w.y2 - w.y1, w.x2 - w.x1));

    if (!best || proj.dist < best.dist) {
      best = { wallId: w.id, x, y, t: t2, wallLen: len, rotation, dist: proj.dist };
    }
  }

  return best;
}

function openingWallT(args: {
  wall: { x1: number; y1: number; x2: number; y2: number };
  x: number;
  y: number;
}) {
  const { wall, x, y } = args;
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return 0;
  const t = ((x - wall.x1) * dx + (y - wall.y1) * dy) / len2;
  return clamp(t, 0, 1);
}

function snapItemTopLeft(args: {
  x: number;
  y: number;
  w: number;
  h: number;
  gridSize: number;
  walls: { x1: number; y1: number; x2: number; y2: number }[];
  snapGrid: boolean;
  snapWall: boolean;
}) {
  const { x, y, w, h, gridSize, walls, snapGrid, snapWall } = args;
  const base = { x: maybeSnap(x, gridSize, snapGrid), y: maybeSnap(y, gridSize, snapGrid) };
  const cx = base.x + w / 2;
  const cy = base.y + h / 2;

  let best:
    | {
        x: number;
        y: number;
        nx: number;
        ny: number;
        dist: number;
      }
    | null = null;
  for (const wall of walls) {
    const proj = projectPointToSegment({
      px: cx,
      py: cy,
      x1: wall.x1,
      y1: wall.y1,
      x2: wall.x2,
      y2: wall.y2,
    });
    if (!best || proj.dist < best.dist) {
      const ang = Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1);
      best = {
        x: proj.x,
        y: proj.y,
        nx: -Math.sin(ang),
        ny: Math.cos(ang),
        dist: proj.dist,
      };
    }
  }

  if (!snapWall) return base;
  if (!best || best.dist > 18) return base;

  const vx = cx - best.x;
  const vy = cy - best.y;
  const side = vx * best.nx + vy * best.ny >= 0 ? 1 : -1;
  const offset = Math.min(w, h) / 2 + 6;
  const c2x = best.x + best.nx * side * offset;
  const c2y = best.y + best.ny * side * offset;
  return {
    x: maybeSnap(c2x - w / 2, gridSize, snapGrid),
    y: maybeSnap(c2y - h / 2, gridSize, snapGrid),
  };
}

function snapPointForWallTool(args: {
  px: number;
  py: number;
  walls: { id: string; x1: number; y1: number; x2: number; y2: number }[];
  gridSize: number;
  snapGrid: boolean;
  snapWall: boolean;
}) {
  const { px, py, walls, gridSize, snapGrid, snapWall } = args;
  if (snapWall) {
    const endpoint = snapPointToWallEndpoints({
      px,
      py,
      walls,
      threshold: 14,
    });
    if (endpoint) return { x: endpoint.x, y: endpoint.y };
  }
  return { x: maybeSnap(px, gridSize, snapGrid), y: maybeSnap(py, gridSize, snapGrid) };
}

function buildGridLines(args: {
  width: number;
  height: number;
  gridSize: number;
  stage: { x: number; y: number; scale: number };
}) {
  const { width, height, gridSize, stage } = args;
  if (!width || !height) return { v: [], h: [] };

  // Compute visible world bounds (with some padding).
  const scale = stage.scale || 1;
  const left = (-stage.x / scale) - gridSize * 2;
  const top = (-stage.y / scale) - gridSize * 2;
  const right = left + width / scale + gridSize * 4;
  const bottom = top + height / scale + gridSize * 4;

  const xStart = Math.floor(left / gridSize) * gridSize;
  const xEnd = Math.ceil(right / gridSize) * gridSize;
  const yStart = Math.floor(top / gridSize) * gridSize;
  const yEnd = Math.ceil(bottom / gridSize) * gridSize;

  const v: number[][] = [];
  const h: number[][] = [];

  for (let x = xStart; x <= xEnd; x += gridSize) {
    v.push([x, yStart, x, yEnd]);
  }
  for (let y = yStart; y <= yEnd; y += gridSize) {
    h.push([xStart, y, xEnd, y]);
  }

  return { v, h };
}

const isPointInPolygon = (point: { x: number; y: number }, polygon: { x: number; y: number }[]) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if (((yi > point.y) !== (yj > point.y)) && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
};

const randomPointInPolygon = (points: { x: number; y: number }[]) => {
  if (points.length < 3) return null;
  const minX = Math.min(...points.map(p => p.x));
  const maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y));
  const maxY = Math.max(...points.map(p => p.y));
  for (let i = 0; i < 100; i++) {
    const x = minX + Math.random() * (maxX - minX);
    const y = minY + Math.random() * (maxY - minY);
    if (isPointInPolygon({ x, y }, points)) return { x, y };
  }
  return points[0]; // fallback
};

function itemVisual(type: FloorPlanItemType) {
  const map: Record<
    FloorPlanItemType,
    { fg: string; fill: string; abbr: string; label: string }
  > = {
    sofa: {
      fg: "#34d399",
      fill: "rgba(16,185,129,0.12)",
      abbr: "SF",
      label: "Sofa",
    },
    bed: { fg: "#818cf8", fill: "rgba(99,102,241,0.12)", abbr: "BD", label: "Bed" },
    table: {
      fg: "#fbbf24",
      fill: "rgba(245,158,11,0.12)",
      abbr: "TB",
      label: "Table",
    },
    chair: { fg: "#22d3ee", fill: "rgba(34,211,238,0.10)", abbr: "CH", label: "Chair" },
    desk: { fg: "#38bdf8", fill: "rgba(56,189,248,0.10)", abbr: "DK", label: "Desk" },
    toilet: { fg: "#e5e7eb", fill: "rgba(229,231,235,0.08)", abbr: "WC", label: "Toilet" },
    sink: { fg: "#60a5fa", fill: "rgba(96,165,250,0.10)", abbr: "SK", label: "Sink" },
    bathtub: {
      fg: "#e879f9",
      fill: "rgba(232,121,249,0.10)",
      abbr: "BT",
      label: "Bathtub",
    },
    stove: { fg: "#fb7185", fill: "rgba(251,113,133,0.10)", abbr: "ST", label: "Stove" },
    fridge: {
      fg: "#a78bfa",
      fill: "rgba(167,139,250,0.10)",
      abbr: "FR",
      label: "Fridge",
    },
    wardrobe: {
      fg: "#fca5a5",
      fill: "rgba(252,165,165,0.10)",
      abbr: "WR",
      label: "Wardrobe",
    },
    bookshelf: {
      fg: "#fdba74",
      fill: "rgba(253,186,116,0.10)",
      abbr: "BS",
      label: "Bookshelf",
    },
    lamp: { fg: "#fcd34d", fill: "rgba(252,211,77,0.10)", abbr: "LM", label: "Lamp" },
    tv: { fg: "#94a3b8", fill: "rgba(148,163,184,0.10)", abbr: "TV", label: "TV" },
    mirror: { fg: "#a5b4fc", fill: "rgba(165,180,252,0.10)", abbr: "MR", label: "Mirror" },
    dishwasher: {
      fg: "#67e8f9",
      fill: "rgba(103,232,249,0.10)",
      abbr: "DW",
      label: "Dishwasher",
    },
    washer: { fg: "#86efac", fill: "rgba(134,239,172,0.10)", abbr: "WS", label: "Washer" },
    car: { fg: "#f87171", fill: "rgba(248,113,113,0.10)", abbr: "CR", label: "Car" },
    flowerpot: { fg: "#22c55e", fill: "rgba(34,197,94,0.10)", abbr: "FP", label: "Flower Pot" },
    cabinet: { fg: "#d97706", fill: "rgba(217,119,6,0.10)", abbr: "CB", label: "Cabinet" },
    shelf: { fg: "#f59e0b", fill: "rgba(245,158,11,0.10)", abbr: "SH", label: "Shelf" },
    plant: { fg: "#16a34a", fill: "rgba(22,163,74,0.10)", abbr: "PL", label: "Plant" },
    generic: { fg: "#9ca3af", fill: "rgba(156,163,175,0.10)", abbr: "GX", label: "Generic" },
  };
  return map[type];
}

function itemIconSrc(type: FloorPlanItemType) {
  const map: Record<FloorPlanItemType, string> = {
    sofa: "/assets/floorplan-icons/sofa.svg",
    bed: "/assets/floorplan-icons/bed.svg",
    table: "/assets/floorplan-icons/table.svg",
    chair: "/assets/floorplan-icons/chair.svg",
    desk: "/assets/floorplan-icons/desk.svg",
    toilet: "/assets/floorplan-icons/toilet.svg",
    sink: "/assets/floorplan-icons/sink.svg",
    bathtub: "/assets/floorplan-icons/bathtub.svg",
    stove: "/assets/floorplan-icons/stove.svg",
    fridge: "/assets/floorplan-icons/fridge.svg",
    wardrobe: "/assets/floorplan-icons/wardrobe.svg",
    bookshelf: "/assets/floorplan-icons/bookshelf.svg",
    lamp: "/assets/floorplan-icons/lamp.svg",
    tv: "/assets/floorplan-icons/tv.svg",
    mirror: "/assets/floorplan-icons/mirror.svg",
    dishwasher: "/assets/floorplan-icons/dishwasher.svg",
    washer: "/assets/floorplan-icons/washer.svg",
    car: "/assets/floorplan-icons/generic.svg", // placeholder
    flowerpot: "/assets/floorplan-icons/generic.svg", // placeholder
    cabinet: "/assets/floorplan-icons/generic.svg", // placeholder
    shelf: "/assets/floorplan-icons/generic.svg", // placeholder
    plant: "/assets/floorplan-icons/generic.svg", // placeholder
    generic: "/assets/floorplan-icons/generic.svg",
  };
  return map[type];
}

function openingIconSrc(kind: FloorPlanOpeningKind) {
  return kind === "door"
    ? "/assets/floorplan-icons/door.svg"
    : "/assets/floorplan-icons/window.svg";
}

function useIconImages() {
  const [images, setImages] = useState<Record<string, HTMLImageElement | null>>(
    {}
  );

  useEffect(() => {
    const itemTypes = [
      "sofa",
      "bed",
      "table",
      "chair",
      "desk",
      "toilet",
      "sink",
      "bathtub",
      "stove",
      "fridge",
      "wardrobe",
      "bookshelf",
      "lamp",
      "tv",
      "mirror",
      "dishwasher",
      "washer",
      "car",
      "flowerpot",
      "generic",
    ] as const satisfies readonly FloorPlanItemType[];

    const srcs = [
      ...itemTypes.map((t) => itemIconSrc(t)),
      openingIconSrc("door"),
      openingIconSrc("window"),
    ];
    const next: Record<string, HTMLImageElement | null> = {};
    let alive = true;

    for (const src of srcs) {
      if (images[src] !== undefined) continue;
      const img = new window.Image();
      img.onload = () => {
        if (!alive) return;
        setImages((prev) => ({ ...prev, [src]: img }));
      };
      img.onerror = () => {
        if (!alive) return;
        setImages((prev) => ({ ...prev, [src]: null }));
      };
      img.src = src;
      next[src] = null;
    }

    if (Object.keys(next).length > 0) {
      setImages((prev) => ({ ...prev, ...next }));
    }

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return images;
}

export const FloorPlanEditor = forwardRef<
  FloorPlanEditorHandle,
  { projectId: string; initialFloorPlanData: unknown; referenceImageUrl?: string | null }
>(function FloorPlanEditor({ projectId, initialFloorPlanData, referenceImageUrl }, ref) {
  const stageRef = useRef<Konva.Stage | null>(null);
  const trRef = useRef<Konva.Transformer | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);
  const clipboardRef = useRef<
    | {
        kind: "item";
        item: { type: FloorPlanItemType; w: number; h: number; rotation: number };
      }
    | {
        kind: "opening";
        opening: { kind: FloorPlanOpeningKind; w: number; rotation: number };
      }
    | { kind: "room"; room: { name: string; points: { x: number; y: number }[] } }
    | { kind: "wall"; wall: { dx: number; dy: number; thickness: number } }
    | {
        kind: "multi";
        entries: (
          | { kind: "item"; type: FloorPlanItemType; w: number; h: number; rotation: number; ox: number; oy: number }
          | { kind: "opening"; openingKind: FloorPlanOpeningKind; w: number; rotation: number; ox: number; oy: number }
          | { kind: "room"; name: string; points: { x: number; y: number }[]; ox: number; oy: number }
          | { kind: "wall"; dx: number; dy: number; thickness: number; ox: number; oy: number }
        )[];
      }
    | null
  >(null);

  const { ref: wrapRef, size } = useElementSize<HTMLDivElement>();

  const tool = useFloorPlanStore((s) => s.tool);
  const setTool = useFloorPlanStore((s) => s.setTool);
  const gridSize = useFloorPlanStore((s) => s.gridSize);
  const setGridSize = useFloorPlanStore((s) => s.setGridSize);
  const setUnits = useFloorPlanStore((s) => s.setUnits);
  const snapping = useFloorPlanStore((s) => s.snapping);
  const setSnapping = useFloorPlanStore((s) => s.setSnapping);
  const stage = useFloorPlanStore((s) => s.stage);
  const setStage = useFloorPlanStore((s) => s.setStage);
  const walls = useFloorPlanStore((s) => s.walls);
  const openings = useFloorPlanStore((s) => s.openings);
  const items = useFloorPlanStore((s) => s.items);
  const setItems = useFloorPlanStore((s) => s.setItems);
  const rooms = useFloorPlanStore((s) => s.rooms);
  const selected = useFloorPlanStore((s) => s.selected);
  const setSelected = useFloorPlanStore((s) => s.setSelected);
  const wallDraft = useFloorPlanStore((s) => s.wallDraft);
  const setWallDraft = useFloorPlanStore((s) => s.setWallDraft);
  const addWall = useFloorPlanStore((s) => s.addWall);
  const addOpening = useFloorPlanStore((s) => s.addOpening);
  const updateOpening = useFloorPlanStore((s) => s.updateOpening);
  const addItem = useFloorPlanStore((s) => s.addItem);
  const updateItem = useFloorPlanStore((s) => s.updateItem);
  const updateWall = useFloorPlanStore((s) => s.updateWall);
  const addRoom = useFloorPlanStore((s) => s.addRoom);
  const updateRoom = useFloorPlanStore((s) => s.updateRoom);
  const updateRoomWithHistory = useFloorPlanStore((s) => s.updateRoomWithHistory);
  const deleteSelected = useFloorPlanStore((s) => s.deleteSelected);
  const pushHistory = useFloorPlanStore((s) => s.pushHistory);
  const undo = useFloorPlanStore((s) => s.undo);
  const redo = useFloorPlanStore((s) => s.redo);
  const canUndo = useFloorPlanStore((s) => s.history.past.length > 0);
  const canRedo = useFloorPlanStore((s) => s.history.future.length > 0);
  const toDoc = useFloorPlanStore((s) => s.toDoc);
  const load = useFloorPlanStore((s) => s.load);
  const setDocMeta = useFloorPlanStore((s) => s.setDocMeta);
  const editSeq = useFloorPlanStore((s) => s.editSeq);
  const markDirty = useFloorPlanStore((s) => s.markDirty);
  const placementRotation = useFloorPlanStore((s) => s.placementRotation);
  const setPlacementRotation = useFloorPlanStore((s) => s.setPlacementRotation);
  const placementSizes = useFloorPlanStore((s) => s.placementSizes);
  const setPlacementSize = useFloorPlanStore((s) => s.setPlacementSize);

  const [saving, setSaving] = useState(false);
  const [savedSeq, setSavedSeq] = useState(0);
  const [autosaveBlockedSeq, setAutosaveBlockedSeq] = useState<number | null>(null);
  const [autosaveBlockedReason, setAutosaveBlockedReason] = useState<string | null>(
    null
  );
  const [spaceDown, setSpaceDown] = useState(false);
  const [middleDrag, setMiddleDrag] = useState(false);
  const [measureDraft, setMeasureDraft] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    locked: boolean;
  } | null>(null);
  const [placementPreview, setPlacementPreview] = useState<
    | null
    | {
        kind: "item";
        type: FloorPlanItemType;
        x: number;
        y: number;
        w: number;
        h: number;
        rotation: number;
      }
    | {
        kind: "opening";
        openingKind: FloorPlanOpeningKind;
        x: number;
        y: number;
        w: number;
        h: number;
        rotation: number;
      }
  >(null);
  const [roomDraft, setRoomDraft] = useState<{
    points: { x: number; y: number }[];
    hover: { x: number; y: number } | null;
  } | null>(null);
  const [wallDragPreview, setWallDragPreview] = useState<{
    id: string;
    x1: number; y1: number; x2: number; y2: number;
  } | null>(null);
  const [selectionRect, setSelectionRect] = useState<{
    x1: number; y1: number; x2: number; y2: number;
  } | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [tutorialStep, setTutorialStep] = useState<number | null>(null);
  const [renamingRoom, setRenamingRoom] = useState<{
    id: string;
    screenX: number;
    screenY: number;
    name: string;
  } | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [snapIndicator, setSnapIndicator] = useState<{
    x: number; y: number;
    type: "grid" | "endpoint" | "wall";
  } | null>(null);
  const editSeqRef = useRef(0);

  useEffect(() => {
    const tutorialCompleted = localStorage.getItem(TUTORIAL_STORAGE_KEY);
    if (!tutorialCompleted) {
      setTutorialStep(0);
    }
  }, []);
  useEffect(() => {
    editSeqRef.current = editSeq;
  }, [editSeq]);

  const isDirty = editSeq !== savedSeq;
  const furnitureType = useFloorPlanStore((s) => s.furnitureType);
  const setFurnitureType = useFloorPlanStore((s) => s.setFurnitureType);
  const pxPerMeter = useFloorPlanStore((s) => s.pxPerMeter);
  const units = useFloorPlanStore((s) => s.units);

  // Helper: check if an entity is selected (single or multi-select).
  const isSelected = useCallback(
    (kind: "wall" | "item" | "opening" | "room", id: string) => {
      if (!selected) return false;
      if (selected.kind === "multi") {
        return selected.ids.some((s) => s.kind === kind && s.id === id);
      }
      return selected.kind === kind && selected.id === id;
    },
    [selected]
  );

  const furnitureTemplates = useMemo(
    () =>
      ({
        generic: { w: 80, h: 60 },
        chair: { w: 40, h: 40 },
        table: { w: 90, h: 60 },
        bed: { w: 140, h: 90 },
        sofa: { w: 120, h: 60 },
        desk: { w: 110, h: 55 },
        toilet: { w: 45, h: 70 },
        sink: { w: 60, h: 45 },
        bathtub: { w: 150, h: 70 },
        stove: { w: 70, h: 60 },
        fridge: { w: 70, h: 70 },
        wardrobe: { w: 100, h: 50 },
        bookshelf: { w: 90, h: 35 },
        lamp: { w: 30, h: 30 },
        tv: { w: 120, h: 20 },
        mirror: { w: 60, h: 80 },
        dishwasher: { w: 60, h: 60 },
        washer: { w: 60, h: 60 },
        car: { w: 400, h: 180 },
        flowerpot: { w: 30, h: 40 },
        cabinet: { w: 80, h: 40 },
        shelf: { w: 100, h: 30 },
        plant: { w: 50, h: 100 },
      }) satisfies Record<FloorPlanItemType, { w: number; h: number }>,
    []
  );

  // Persist placement preferences to localStorage (UI preference, not saved into floorPlanData).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object") return;
      const o = parsed as Record<string, unknown>;
      if (typeof o.placementRotation === "number") {
        setPlacementRotation(normRotationDeg(o.placementRotation));
      }
      const sizes = o.placementSizes;
      if (!sizes || typeof sizes !== "object") return;
      const allowed = new Set<FloorPlanItemType>([
        "sofa",
        "bed",
        "table",
        "chair",
        "desk",
        "toilet",
        "sink",
        "bathtub",
        "stove",
        "fridge",
        "wardrobe",
        "bookshelf",
        "lamp",
        "tv",
        "mirror",
        "dishwasher",
        "washer",
        "generic",
      ]);
      for (const [k, v] of Object.entries(sizes as Record<string, unknown>)) {
        if (!allowed.has(k as FloorPlanItemType)) continue;
        if (!v || typeof v !== "object") continue;
        const s = v as Record<string, unknown>;
        const w = typeof s.w === "number" && Number.isFinite(s.w) ? s.w : null;
        const h = typeof s.h === "number" && Number.isFinite(s.h) ? s.h : null;
        if (w == null || h == null) continue;
        setPlacementSize(k as FloorPlanItemType, {
          w: Math.max(10, Math.min(10000, Math.round(w))),
          h: Math.max(10, Math.min(10000, Math.round(h))),
        });
      }
    } catch {
      // Ignore localStorage/JSON errors.
    }
  }, [setPlacementRotation, setPlacementSize]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          PREFS_STORAGE_KEY,
          JSON.stringify({
            placementRotation: normRotationDeg(placementRotation),
            placementSizes,
          })
        );
      } catch {
        // Ignore quota/security errors.
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [placementRotation, placementSizes]);

  const furnitureTemplateFor = useCallback(
    (t: FloorPlanItemType) => {
      const base = furnitureTemplates[t] ?? furnitureTemplates.generic;
      const override = placementSizes[t];
      if (!override) return base;
      return {
        w: Math.max(10, Math.min(10000, override.w)),
        h: Math.max(10, Math.min(10000, override.h)),
      };
    },
    [furnitureTemplates, placementSizes]
  );

  const [showAssets, setShowAssets] = useState(false);
  const [layerVisibility, setLayerVisibility] = useState({
    rooms: true,
    walls: true,
    openings: true,
    furniture: true,
    annotations: true,
  });
  const [showReference] = useState(true);
  const [referenceImage, setReferenceImage] = useState<HTMLImageElement | null>(null);
  const iconImages = useIconImages();

  // Load reference image
  useEffect(() => {
    if (!referenceImageUrl) {
      setReferenceImage(null);
      return;
    }
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setReferenceImage(img);
    img.onerror = () => setReferenceImage(null);
    img.src = referenceImageUrl;
  }, [referenceImageUrl]);

  const getPastePoint = useCallback(() => {
    const st = stageRef.current;
    if (!st) return null;
    const p = getWorldPointer(st);
    if (p) return p;
    const rect = st.container().getBoundingClientRect();
    return worldFromClientPoint({
      stage: st,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    });
  }, []);

  const openingTemplates = useMemo(
    () =>
      ({
        door: { w: 90, h: 14 },
        window: { w: 80, h: 10 },
      }) satisfies Record<FloorPlanOpeningKind, { w: number; h: number }>,
    []
  );

  const saveNow = useCallback(async (opts?: { source?: "auto" | "manual" }) => {
    if (saving) return;
    setSaving(true);
    const seqAtStart = editSeqRef.current;
    try {
      const floorPlanData = toDoc();
      // Pre-check size to avoid save retry loops and wasted requests.
      if (JSON.stringify(floorPlanData).length > MAX_FLOORPLAN_JSON_BYTES) {
        throw new Error("Floor plan is too large to save.");
      }
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ floorPlanData }),
      });
      if (!res.ok) {
        if (res.status === 413) {
          throw new Error("Floor plan is too large to save.");
        }
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Save failed (${res.status})`);
      }
      // Pull server-stamped meta forward without resetting local editor state/history.
      const saved = (await res.json().catch(() => null)) as
        | { floorPlanData?: unknown }
        | null;
      if (saved?.floorPlanData !== undefined) {
        const upgraded = upgradeFloorPlanDoc(saved.floorPlanData);
        setDocMeta(upgraded.meta);
      }
      setSavedSeq(seqAtStart);
      setAutosaveBlockedSeq(null);
      setAutosaveBlockedReason(null);
      if (opts?.source !== "auto") toast.success("Saved");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      toast.error(msg);
      if (opts?.source === "auto") {
        // Prevent an autosave retry loop (e.g. size limit). Autosave resumes on next edit.
        setAutosaveBlockedSeq(seqAtStart);
        setAutosaveBlockedReason(msg);
      }
    } finally {
      setSaving(false);
    }
  }, [projectId, saving, setDocMeta, toDoc]);

  const placeFurnitureAtClientPoint = useCallback(
    (type: FloorPlanItemType, clientX: number, clientY: number) => {
      const st = stageRef.current;
      if (!st) return;
      const world = worldFromClientPoint({ stage: st, clientX, clientY });
      if (!world) return;
      const tpl = furnitureTemplateFor(type);
      const p = snapItemTopLeft({
        x: world.x - tpl.w / 2,
        y: world.y - tpl.h / 2,
        w: tpl.w,
        h: tpl.h,
        gridSize,
        walls,
        snapGrid: snapping.grid,
        snapWall: snapping.wall,
      });
      addItem({
        id: uuid(),
        type,
        x: p.x,
        y: p.y,
        w: tpl.w,
        h: tpl.h,
        rotation: placementRotation,
      });
      markDirty();
      setTool("select");
    },
    [
      addItem,
      furnitureTemplateFor,
      gridSize,
      markDirty,
      placementRotation,
      setTool,
      snapping.grid,
      snapping.wall,
      walls,
    ]
  );

  const exportPng = useCallback(() => {
    const st = stageRef.current;
    if (!st) return;
    const uri = st.toDataURL({ pixelRatio: 2, mimeType: "image/png" });
    const a = document.createElement("a");
    a.href = uri;
    a.download = `floorplan-${projectId}.png`;
    a.click();
  }, [projectId]);

  const suggestFurniture = useCallback(() => {
    const newItems: FloorPlanItem[] = [];
    for (const room of rooms) {
      const name = room.name.toLowerCase();
      let types: FloorPlanItemType[] = [];
      if (name.includes('bedroom')) types = ['bed', 'wardrobe', 'lamp'];
      else if (name.includes('living') || name.includes('sitting')) types = ['sofa', 'table', 'tv'];
      else if (name.includes('kitchen')) types = ['stove', 'fridge', 'table'];
      else if (name.includes('bathroom') || name.includes('bath')) types = ['toilet', 'sink', 'bathtub'];
      else if (name.includes('dining')) types = ['table', 'chair'];
      for (const type of types) {
        const point = randomPointInPolygon(room.points);
        if (point) {
          const size = placementSizes[type]!;
          newItems.push({
            id: crypto.randomUUID(),
            type,
            x: point.x - size.w / 2, // center
            y: point.y - size.h / 2,
            w: size.w,
            h: size.h,
            rotation: 0,
          });
        }
      }
    }
    if (newItems.length > 0) {
      pushHistory();
      const currentItems = useFloorPlanStore.getState().items;
      setItems([...currentItems, ...newItems]);
      markDirty();
    }
  }, [rooms, placementSizes, pushHistory, setItems, markDirty]);

  const exportPdf = useCallback(async () => {
    const st = stageRef.current;
    if (!st) return;
    if (!layerVisibility.annotations) {
      toast.info("Dimensions are hidden. Enable the Dimensions layer for labels in the PDF.");
    }

    try {
      const { jsPDF } = await import("jspdf");
      const bounds = computeContentBounds({ walls, items, openings, rooms });
      const padding = 80;
      const crop =
        bounds.hasContent
          ? {
              x: bounds.minX - padding,
              y: bounds.minY - padding,
              width: bounds.maxX - bounds.minX + padding * 2,
              height: bounds.maxY - bounds.minY + padding * 2,
            }
          : {
              x: 0,
              y: 0,
              width: st.width(),
              height: st.height(),
            };

      const uri = st.toDataURL({
        ...crop,
        pixelRatio: 2,
        mimeType: "image/png",
      });
      const img = await loadImage(uri);
      const orientation = img.width >= img.height ? "landscape" : "portrait";
      const pdf = new jsPDF({
        orientation,
        unit: "mm",
        format: "a4",
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const footerHeight = 12;
      const maxW = pageWidth - margin * 2;
      const maxH = pageHeight - margin * 2 - footerHeight;
      const ratio = Math.min(maxW / img.width, maxH / img.height);
      const drawW = img.width * ratio;
      const drawH = img.height * ratio;
      const drawX = (pageWidth - drawW) / 2;
      const drawY = margin;

      pdf.addImage(uri, "PNG", drawX, drawY, drawW, drawH, undefined, "FAST");

      const mmPerPx = drawW / img.width;
      const scaleMeters = pickScaleBarMeters({
        pxPerMeter,
        mmPerPx,
        maxMm: drawW,
      });
      const barMm = scaleMeters * pxPerMeter * mmPerPx;
      const barX = drawX + 2;
      const barY = drawY + drawH + 6;

      pdf.setDrawColor(60);
      pdf.setLineWidth(0.5);
      pdf.line(barX, barY, barX + barMm, barY);
      pdf.line(barX, barY - 2, barX, barY + 2);
      pdf.line(barX + barMm, barY - 2, barX + barMm, barY + 2);
      pdf.setFontSize(8);
      pdf.setTextColor(80);
      const label = `Scale: ${formatLength({
        px: scaleMeters * pxPerMeter,
        pxPerMeter,
        units,
      })}`;
      pdf.text(label, barX, barY + 5);

      pdf.save(`floorplan-${projectId}.pdf`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Export failed";
      toast.error(msg);
    }
  }, [
    items,
    layerVisibility.annotations,
    openings,
    projectId,
    pxPerMeter,
    rooms,
    units,
    walls,
  ]);

  const exportJson = useCallback(() => {
    const doc = toDoc();
    const blob = new Blob([JSON.stringify(doc, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `floorplan-${projectId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [projectId, toDoc]);

  const onImportJson = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as unknown;
        const { doc, report } = upgradeFloorPlanDocWithReport(parsed);
        load(doc);
        // Mark as dirty so it gets saved explicitly / autosaved.
        markDirty();

        const summary = summarizeFloorPlanUpgradeReport(report);
        if (summary) {
          toast("Imported with warnings", { description: summary, duration: 8000 });
        } else {
          toast.success("Imported");
        }

        // If the imported doc is too large, pause autosave immediately so we don't get a 413 loop.
        if (JSON.stringify(doc).length > MAX_FLOORPLAN_JSON_BYTES) {
          const msg = "Floor plan is too large to save.";
          setAutosaveBlockedSeq(useFloorPlanStore.getState().editSeq);
          setAutosaveBlockedReason(msg);
          toast.error(msg, {
            description: "Reduce complexity (walls/items/rooms) before saving.",
            duration: 8000,
          });
        }
      } catch {
        toast.error("Import failed", { description: "Invalid JSON file." });
      }
    },
    [load, markDirty, setAutosaveBlockedReason, setAutosaveBlockedSeq]
  );

  // Initial load
  useEffect(() => {
    const { doc, wasCorrupt } = safeUpgradeFloorPlanDoc(initialFloorPlanData);
    load(doc);
    setSavedSeq(0);
    // If this project is stored in a legacy format (or malformed), trigger an autosave
    // so the DB converges to the canonical v3 shape.
    if (wasCorrupt) {
      markDirty();
    }
  }, [initialFloorPlanData, load, markDirty]);

  // Selection transformer hookup
  useEffect(() => {
    const tr = trRef.current;
    const stageNode = stageRef.current;
    if (!tr || !stageNode) return;
    if (!selected || (selected.kind !== "item" && selected.kind !== "opening")) {
      tr.nodes([]);
      tr.getLayer()?.batchDraw();
      return;
    }
    const node = stageNode.findOne(
      selected.kind === "item"
        ? `#item-${selected.id}`
        : `#opening-${selected.id}`
    );
    if (node) {
      tr.nodes([node as unknown as Konva.Node]);
      tr.getLayer()?.batchDraw();
    }
  }, [selected, items, openings]);

  // Leaving measure mode clears the measurement draft.
  useEffect(() => {
    if (tool !== "measure") setMeasureDraft(null);
  }, [tool]);

  // Clear wall drag preview on selection or tool change.
  useEffect(() => {
    setWallDragPreview(null);
  }, [selected, tool]);

  // Clear selection rect on tool change.
  useEffect(() => {
    if (tool !== "select") setSelectionRect(null);
    if (tool !== "wall" && tool !== "room") setSnapIndicator(null);
  }, [tool]);

  // Leaving placement tools clears the ghost preview.
  useEffect(() => {
    if (tool !== "furniture" && tool !== "door" && tool !== "window") {
      setPlacementPreview(null);
    }
  }, [tool]);

  // Leaving room mode clears the polygon draft.
  useEffect(() => {
    if (tool !== "room") setRoomDraft(null);
  }, [tool]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;

      // Tool hotkeys (no modifiers).
      if (!e.ctrlKey && !e.metaKey) {
        if (e.key === "1") {
          e.preventDefault();
          setTool("select");
          return;
        }
        if (e.key === "2") {
          e.preventDefault();
          setTool("wall");
          return;
        }
        if (e.key === "3") {
          e.preventDefault();
          setTool("room");
          return;
        }
        if (e.key === "4") {
          e.preventDefault();
          setTool("door");
          return;
        }
        if (e.key === "5") {
          e.preventDefault();
          setTool("window");
          return;
        }
        if (e.key === "6") {
          e.preventDefault();
          setTool("furniture");
          return;
        }
      }

      if (e.code === "Space") {
        e.preventDefault();
        setSpaceDown(true);
      }

      // Room draft editing.
      if (tool === "room" && roomDraft) {
        if (e.key === "Backspace") {
          e.preventDefault();
          if (roomDraft.points.length <= 1) {
            setRoomDraft(null);
          } else {
            setRoomDraft({ ...roomDraft, points: roomDraft.points.slice(0, -1) });
          }
          return;
        }
        if (e.key === "Enter") {
          if (roomDraft.points.length >= 3) {
            e.preventDefault();
            addRoom({
              id: uuid(),
              name: `Room ${rooms.length + 1}`,
              points: roomDraft.points,
            });
            setRoomDraft(null);
            markDirty();
            setTool("select");
          }
          return;
        }
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        deleteSelected();
        markDirty();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
        markDirty();
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))
      ) {
        e.preventDefault();
        redo();
        markDirty();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveNow({ source: "manual" });
      }
      if (!e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "r") {
        // Rotate selected (items/openings) by 90deg. Shift = -90deg.
        // If nothing is selected and we're in furniture placement, rotate the next placement.
        e.preventDefault();
        const d = e.shiftKey ? -90 : 90;
        if (!selected) {
          if (tool === "furniture") {
            const next = (placementRotation + d) % 360;
            setPlacementRotation(next < 0 ? next + 360 : next);
          }
          return;
        }
        pushHistory();
        if (selected.kind === "item") {
          const it = items.find((x) => x.id === selected.id);
          if (!it) return;
          updateItem(it.id, { rotation: it.rotation + d });
          markDirty();
        } else if (selected.kind === "opening") {
          const op = openings.find((x) => x.id === selected.id);
          if (!op) return;
          if (op.wallId) return;
          updateOpening(op.id, { rotation: op.rotation + d });
          markDirty();
        }
      }
      if (!e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "m") {
        // Toggle measure tool.
        e.preventDefault();
        setTool(tool === "measure" ? "select" : "measure");
      }
      if (!e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        pushHistory();
        setSnapping({ ...snapping, grid: !snapping.grid });
        markDirty();
      }
      if (!e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "w") {
        e.preventDefault();
        pushHistory();
        setSnapping({ ...snapping, wall: !snapping.wall });
        markDirty();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        if (!selected) return;
        if (selected.kind === "multi") {
          // Compute bounding box center for offset calculation
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const entry of selected.ids) {
            if (entry.kind === "item") {
              const it = items.find((x) => x.id === entry.id);
              if (it) { minX = Math.min(minX, it.x); minY = Math.min(minY, it.y); maxX = Math.max(maxX, it.x + it.w); maxY = Math.max(maxY, it.y + it.h); }
            } else if (entry.kind === "opening") {
              const op = openings.find((x) => x.id === entry.id);
              if (op) { minX = Math.min(minX, op.x); minY = Math.min(minY, op.y); maxX = Math.max(maxX, op.x + op.w); maxY = Math.max(maxY, op.y + 14); }
            } else if (entry.kind === "room") {
              const r = rooms.find((x) => x.id === entry.id);
              if (r) for (const pt of r.points) { minX = Math.min(minX, pt.x); minY = Math.min(minY, pt.y); maxX = Math.max(maxX, pt.x); maxY = Math.max(maxY, pt.y); }
            } else if (entry.kind === "wall") {
              const w = walls.find((x) => x.id === entry.id);
              if (w) { minX = Math.min(minX, w.x1, w.x2); minY = Math.min(minY, w.y1, w.y2); maxX = Math.max(maxX, w.x1, w.x2); maxY = Math.max(maxY, w.y1, w.y2); }
            }
          }
          if (!Number.isFinite(minX)) return;
          const cx = (minX + maxX) / 2;
          const cy = (minY + maxY) / 2;

          const entries: Extract<typeof clipboardRef.current, { kind: "multi" }>["entries"] = [];
          for (const entry of selected.ids) {
            if (entry.kind === "item") {
              const it = items.find((x) => x.id === entry.id);
              if (it) entries.push({ kind: "item", type: it.type, w: it.w, h: it.h, rotation: it.rotation, ox: it.x + it.w / 2 - cx, oy: it.y + it.h / 2 - cy });
            } else if (entry.kind === "opening") {
              const op = openings.find((x) => x.id === entry.id);
              if (op) entries.push({ kind: "opening", openingKind: op.kind, w: op.w, rotation: op.rotation, ox: op.x - cx, oy: op.y - cy });
            } else if (entry.kind === "room") {
              const r = rooms.find((x) => x.id === entry.id);
              if (r) {
                const rc = polygonCentroid(r.points);
                entries.push({ kind: "room", name: r.name, points: r.points.map((p) => ({ x: p.x, y: p.y })), ox: rc.x - cx, oy: rc.y - cy });
              }
            } else if (entry.kind === "wall") {
              const w = walls.find((x) => x.id === entry.id);
              if (w) entries.push({ kind: "wall", dx: w.x2 - w.x1, dy: w.y2 - w.y1, thickness: w.thickness, ox: (w.x1 + w.x2) / 2 - cx, oy: (w.y1 + w.y2) / 2 - cy });
            }
          }
          if (entries.length > 0) clipboardRef.current = { kind: "multi", entries };
        } else if (selected.kind === "item") {
          const it = items.find((x) => x.id === selected.id);
          if (!it) return;
          clipboardRef.current = {
            kind: "item",
            item: { type: it.type, w: it.w, h: it.h, rotation: it.rotation },
          };
        } else if (selected.kind === "opening") {
          const op = openings.find((x) => x.id === selected.id);
          if (!op) return;
          clipboardRef.current = {
            kind: "opening",
            opening: { kind: op.kind, w: op.w, rotation: op.rotation },
          };
        } else if (selected.kind === "room") {
          const r = rooms.find((x) => x.id === selected.id);
          if (!r) return;
          clipboardRef.current = {
            kind: "room",
            room: { name: r.name, points: r.points.map((p) => ({ x: p.x, y: p.y })) },
          };
        } else {
          const w = walls.find((x) => x.id === selected.id);
          if (!w) return;
          clipboardRef.current = {
            kind: "wall",
            wall: { dx: w.x2 - w.x1, dy: w.y2 - w.y1, thickness: w.thickness },
          };
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        const clip = clipboardRef.current;
        if (!clip) return;
        const p = getPastePoint();
        if (!p) return;
        e.preventDefault();

        if (clip.kind === "multi") {
          const tx = maybeSnap(p.x, gridSize, snapping.grid);
          const ty = maybeSnap(p.y, gridSize, snapping.grid);
          for (const entry of clip.entries) {
            const ex = tx + entry.ox;
            const ey = ty + entry.oy;
            if (entry.kind === "item") {
              const tl = snapItemTopLeft({
                x: ex - entry.w / 2, y: ey - entry.h / 2,
                w: entry.w, h: entry.h, gridSize, walls,
                snapGrid: snapping.grid, snapWall: snapping.wall,
              });
              addItem({ id: uuid(), type: entry.type, x: tl.x, y: tl.y, w: entry.w, h: entry.h, rotation: entry.rotation });
            } else if (entry.kind === "opening") {
              addOpening({ id: uuid(), kind: entry.openingKind, x: maybeSnap(ex, gridSize, snapping.grid), y: maybeSnap(ey, gridSize, snapping.grid), w: entry.w, rotation: entry.rotation, wallId: null, wallT: null });
            } else if (entry.kind === "room") {
              const c = polygonCentroid(entry.points);
              const rdx = tx + entry.ox - c.x;
              const rdy = ty + entry.oy - c.y;
              addRoom({ id: uuid(), name: `${entry.name} copy`.slice(0, 60), points: entry.points.map((pt) => ({ x: pt.x + rdx, y: pt.y + rdy })) });
            } else {
              addWall({ id: uuid(), x1: maybeSnap(ex - entry.dx / 2, gridSize, snapping.grid), y1: maybeSnap(ey - entry.dy / 2, gridSize, snapping.grid), x2: maybeSnap(ex + entry.dx / 2, gridSize, snapping.grid), y2: maybeSnap(ey + entry.dy / 2, gridSize, snapping.grid), thickness: entry.thickness });
            }
          }
        } else if (clip.kind === "item") {
          const { type, w, h, rotation } = clip.item;
          const tl = snapItemTopLeft({
            x: p.x - w / 2,
            y: p.y - h / 2,
            w,
            h,
            gridSize,
            walls,
            snapGrid: snapping.grid,
            snapWall: snapping.wall,
          });
          addItem({
            id: uuid(),
            type,
            x: tl.x,
            y: tl.y,
            w,
            h,
            rotation,
          });
        } else if (clip.kind === "opening") {
          const { kind, w, rotation } = clip.opening;
          addOpening({
            id: uuid(),
            kind,
            x: maybeSnap(p.x, gridSize, snapping.grid),
            y: maybeSnap(p.y, gridSize, snapping.grid),
            w,
            rotation,
            wallId: null,
            wallT: null,
          });
        } else if (clip.kind === "room") {
          const { name, points } = clip.room;
          const c = polygonCentroid(points);
          const tx = maybeSnap(p.x, gridSize, snapping.grid);
          const ty = maybeSnap(p.y, gridSize, snapping.grid);
          const dx = tx - c.x;
          const dy = ty - c.y;
          addRoom({
            id: uuid(),
            name: `${name} copy`.slice(0, 60),
            points: points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })),
          });
        } else if (clip.kind === "wall") {
          const { dx, dy, thickness } = clip.wall;
          addWall({
            id: uuid(),
            x1: maybeSnap(p.x - dx / 2, gridSize, snapping.grid),
            y1: maybeSnap(p.y - dy / 2, gridSize, snapping.grid),
            x2: maybeSnap(p.x + dx / 2, gridSize, snapping.grid),
            y2: maybeSnap(p.y + dy / 2, gridSize, snapping.grid),
            thickness,
          });
        }

        markDirty();
        setTool("select");
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        // Duplicate = copy + paste (does not touch system clipboard).
        if (!selected) return;
        e.preventDefault();

        if (selected.kind === "multi") {
          // For multi-select: copy to clipboard then paste (reusing Ctrl+C logic)
          // Compute bounding box center
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const entry of selected.ids) {
            if (entry.kind === "item") {
              const it = items.find((x) => x.id === entry.id);
              if (it) { minX = Math.min(minX, it.x); minY = Math.min(minY, it.y); maxX = Math.max(maxX, it.x + it.w); maxY = Math.max(maxY, it.y + it.h); }
            } else if (entry.kind === "opening") {
              const op = openings.find((x) => x.id === entry.id);
              if (op) { minX = Math.min(minX, op.x); minY = Math.min(minY, op.y); maxX = Math.max(maxX, op.x + op.w); maxY = Math.max(maxY, op.y + 14); }
            } else if (entry.kind === "room") {
              const r = rooms.find((x) => x.id === entry.id);
              if (r) for (const pt of r.points) { minX = Math.min(minX, pt.x); minY = Math.min(minY, pt.y); maxX = Math.max(maxX, pt.x); maxY = Math.max(maxY, pt.y); }
            } else if (entry.kind === "wall") {
              const w = walls.find((x) => x.id === entry.id);
              if (w) { minX = Math.min(minX, w.x1, w.x2); minY = Math.min(minY, w.y1, w.y2); maxX = Math.max(maxX, w.x1, w.x2); maxY = Math.max(maxY, w.y1, w.y2); }
            }
          }
          if (!Number.isFinite(minX)) return;
          const cx = (minX + maxX) / 2;
          const cy = (minY + maxY) / 2;

          const p = getPastePoint();
          if (!p) return;
          const tx = maybeSnap(p.x, gridSize, snapping.grid);
          const ty = maybeSnap(p.y, gridSize, snapping.grid);
          pushHistory();

          for (const entry of selected.ids) {
            const offX = tx - cx;
            const offY = ty - cy;
            if (entry.kind === "item") {
              const it = items.find((x) => x.id === entry.id);
              if (it) addItem({ id: uuid(), type: it.type, x: it.x + offX, y: it.y + offY, w: it.w, h: it.h, rotation: it.rotation });
            } else if (entry.kind === "opening") {
              const op = openings.find((x) => x.id === entry.id);
              if (op) addOpening({ id: uuid(), kind: op.kind, x: op.x + offX, y: op.y + offY, w: op.w, rotation: op.rotation, wallId: null, wallT: null });
            } else if (entry.kind === "room") {
              const r = rooms.find((x) => x.id === entry.id);
              if (r) addRoom({ id: uuid(), name: `${r.name} copy`.slice(0, 60), points: r.points.map((pt) => ({ x: pt.x + offX, y: pt.y + offY })) });
            } else if (entry.kind === "wall") {
              const w = walls.find((x) => x.id === entry.id);
              if (w) addWall({ id: uuid(), x1: w.x1 + offX, y1: w.y1 + offY, x2: w.x2 + offX, y2: w.y2 + offY, thickness: w.thickness });
            }
          }
          markDirty();
          setTool("select");
        } else {
        // Reuse the same logic by simulating within this handler.
        const k = selected.kind;
        if (k === "item") {
          const it = items.find((x) => x.id === selected.id);
          if (!it) return;
          clipboardRef.current = {
            kind: "item",
            item: { type: it.type, w: it.w, h: it.h, rotation: it.rotation },
          };
        } else if (k === "opening") {
          const op = openings.find((x) => x.id === selected.id);
          if (!op) return;
          clipboardRef.current = {
            kind: "opening",
            opening: { kind: op.kind, w: op.w, rotation: op.rotation },
          };
        } else if (k === "room") {
          const r = rooms.find((x) => x.id === selected.id);
          if (!r) return;
          clipboardRef.current = {
            kind: "room",
            room: { name: r.name, points: r.points.map((p) => ({ x: p.x, y: p.y })) },
          };
        } else {
          const w = walls.find((x) => x.id === selected.id);
          if (!w) return;
          clipboardRef.current = {
            kind: "wall",
            wall: { dx: w.x2 - w.x1, dy: w.y2 - w.y1, thickness: w.thickness },
          };
        }
        const clip = clipboardRef.current;
        const p = getPastePoint();
        if (!clip || !p) return;
        if (clip.kind === "item") {
          const { type, w, h, rotation } = clip.item;
          const tl = snapItemTopLeft({
            x: p.x - w / 2,
            y: p.y - h / 2,
            w,
            h,
            gridSize,
            walls,
            snapGrid: snapping.grid,
            snapWall: snapping.wall,
          });
          addItem({
            id: uuid(),
            type,
            x: tl.x,
            y: tl.y,
            w,
            h,
            rotation,
          });
        } else if (clip.kind === "opening") {
          const { kind, w, rotation } = clip.opening;
          addOpening({
            id: uuid(),
            kind,
            x: maybeSnap(p.x, gridSize, snapping.grid),
            y: maybeSnap(p.y, gridSize, snapping.grid),
            w,
            rotation,
            wallId: null,
            wallT: null,
          });
        } else if (clip.kind === "room") {
          const { name, points } = clip.room;
          const c = polygonCentroid(points);
          const tx = maybeSnap(p.x, gridSize, snapping.grid);
          const ty = maybeSnap(p.y, gridSize, snapping.grid);
          const dx = tx - c.x;
          const dy = ty - c.y;
          addRoom({
            id: uuid(),
            name: `${name} copy`.slice(0, 60),
            points: points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })),
          });
        } else {
          const { dx, dy, thickness } = clip.wall;
          addWall({
            id: uuid(),
            x1: maybeSnap(p.x - dx / 2, gridSize, snapping.grid),
            y1: maybeSnap(p.y - dy / 2, gridSize, snapping.grid),
            x2: maybeSnap(p.x + dx / 2, gridSize, snapping.grid),
            y2: maybeSnap(p.y + dy / 2, gridSize, snapping.grid),
            thickness,
          });
        }
        markDirty();
        setTool("select");
        } // close else (single-select duplicate)
      }
      if (
        e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight"
      ) {
        if (!selected) return;
        e.preventDefault();
        const base = gridSize;
        const mul = e.shiftKey ? 10 : e.altKey ? 0.5 : 1;
        const step = base * mul;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        pushHistory();
        if (selected.kind === "multi") {
          for (const entry of selected.ids) {
            if (entry.kind === "item") {
              const it = items.find((x) => x.id === entry.id);
              if (it) updateItem(it.id, { x: it.x + dx, y: it.y + dy });
            } else if (entry.kind === "opening") {
              const op = openings.find((x) => x.id === entry.id);
              if (op) updateOpening(op.id, { x: op.x + dx, y: op.y + dy, wallId: null, wallT: null });
            } else if (entry.kind === "room") {
              const r = rooms.find((x) => x.id === entry.id);
              if (r) updateRoom(r.id, { points: r.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) });
            } else {
              const w = walls.find((x) => x.id === entry.id);
              if (w) updateWall(w.id, { x1: w.x1 + dx, y1: w.y1 + dy, x2: w.x2 + dx, y2: w.y2 + dy });
            }
          }
        } else if (selected.kind === "item") {
          const it = items.find((x) => x.id === selected.id);
          if (!it) return;
          updateItem(it.id, { x: it.x + dx, y: it.y + dy });
        } else if (selected.kind === "opening") {
          const op = openings.find((x) => x.id === selected.id);
          if (!op) return;
          // Nudge detaches from wall snapping.
          updateOpening(op.id, {
            x: op.x + dx,
            y: op.y + dy,
            wallId: null,
            wallT: null,
          });
        } else if (selected.kind === "room") {
          const r = rooms.find((x) => x.id === selected.id);
          if (!r) return;
          updateRoom(r.id, {
            points: r.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
          });
        } else {
          const w = walls.find((x) => x.id === selected.id);
          if (!w) return;
          updateWall(w.id, {
            x1: w.x1 + dx,
            y1: w.y1 + dy,
            x2: w.x2 + dx,
            y2: w.y2 + dy,
          });
        }
        markDirty();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        pushHistory();
        setStage({ x: 0, y: 0, scale: 1 });
        markDirty();
      }
      if (e.key === "?") {
        e.preventDefault();
        setShowShortcuts((v) => !v);
        return;
      }
      if (e.key === "Escape") {
        if (showShortcuts) {
          setShowShortcuts(false);
          return;
        }
        setWallDraft(null);
        setMeasureDraft(null);
        setRoomDraft(null);
        setSelected(null);
        setTool("select");
      }
      // Tool shortcuts
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        switch (e.key.toLowerCase()) {
          case "s":
            e.preventDefault();
            selectTool("select");
            break;
          case "w":
            e.preventDefault();
            selectTool("wall");
            break;
          case "r":
            e.preventDefault();
            selectTool("room");
            break;
          case "d":
            e.preventDefault();
            selectTool("door");
            break;
          case "i":
            e.preventDefault();
            selectTool("window");
            break;
          case "m":
            e.preventDefault();
            selectTool("measure");
            break;
          case "f":
            e.preventDefault();
            selectTool("furniture");
            break;
          case "p":
            e.preventDefault();
            selectTool("pan");
            break;
        }
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "Space") setSpaceDown(false);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [
    addItem,
    addOpening,
    addRoom,
    addWall,
    deleteSelected,
    getPastePoint,
    gridSize,
    markDirty,
    items,
    openings,
    roomDraft,
    rooms,
    snapping.grid,
    snapping.wall,
    updateItem,
    updateOpening,
    updateRoom,
    updateWall,
    walls,
    pushHistory,
    redo,
    saveNow,
    setSelected,
    setStage,
    setTool,
    setWallDraft,
    setRoomDraft,
    selected,
    setSnapping,
    snapping,
    tool,
    undo,
    placementRotation,
    setPlacementRotation,
    showShortcuts,
  ]);

  const grid = useMemo(
    () =>
      buildGridLines({
        width: size.width,
        height: size.height,
        gridSize,
        stage,
      }),
    [gridSize, size.height, size.width, stage]
  );

  useImperativeHandle(
    ref,
    () => ({
      saveNow: () => saveNow({ source: "manual" }),
      exportPng,
      exportPdf,
      suggestFurniture,
      placeFurnitureAtClientPoint,
      loadDoc: (doc: unknown) => {
        const upgraded = safeUpgradeFloorPlanDoc(doc);
        load(upgraded.doc);
        setSavedSeq(0);
        setAutosaveBlockedSeq(null);
        setAutosaveBlockedReason(null);
        setStage(upgraded.doc.stage);
        if (upgraded.wasCorrupt) {
          markDirty();
        }
      },
    }),
    [
      placeFurnitureAtClientPoint,
      saveNow,
      load,
      markDirty,
      exportPng,
      exportPdf,
      setStage,
    ]
  );

  // Autosave (debounced)
  useEffect(() => {
    if (saving) return;
    if (!isDirty) return;
    if (autosaveBlockedSeq === editSeq) return;
    const t = window.setTimeout(() => {
      void saveNow({ source: "auto" });
    }, 1200);
    return () => window.clearTimeout(t);
  }, [autosaveBlockedSeq, editSeq, isDirty, saveNow, saving]);

  useEffect(() => {
    // If the user edits after an autosave pause, clear the banner/reason and allow autosave to resume.
    if (autosaveBlockedSeq !== editSeq) {
      setAutosaveBlockedReason(null);
    }
  }, [autosaveBlockedSeq, editSeq]);

  function onWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const st = stageRef.current;
    if (!st) return;

    const oldScale = stage.scale;
    const pointer = st.getPointerPosition();
    if (!pointer) return;

    const scaleBy = 1.05;
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newScale = clamp(
      direction > 0 ? oldScale * scaleBy : oldScale / scaleBy,
      0.2,
      4
    );

    // Zoom around cursor.
    const mousePointTo = {
      x: (pointer.x - stage.x) / oldScale,
      y: (pointer.y - stage.y) / oldScale,
    };

    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };

    setStage({ x: newPos.x, y: newPos.y, scale: newScale });
    markDirty();
  }

  function onStageMouseDown(e: Konva.KonvaEventObject<MouseEvent>) {
    const st = stageRef.current;
    if (!st) return;

    // Middle mouse button to pan
    if (e.evt.button === 1) {
      e.evt.preventDefault();
      setMiddleDrag(true);
      return;
    }

    // Hold Space to pan, without switching tools.
    if (spaceDown) return;

    const isEmpty = e.target === e.target.getStage();
    if (tool === "select") {
      if (isEmpty) {
        // Start selection rectangle
        const world = getWorldPointer(st);
        if (world) {
          setSelectionRect({ x1: world.x, y1: world.y, x2: world.x, y2: world.y });
          setSelected(null);
        }
      }
      return;
    }

    const world = getWorldPointer(st);
    if (!world) return;
    const x = world.x;
    const y = world.y;

    if (tool === "measure") {
      const p = snapPointForWallTool({
        px: x,
        py: y,
        walls,
        gridSize,
        snapGrid: snapping.grid,
        snapWall: snapping.wall,
      });
      const px = p.x;
      const py = p.y;
      if (!measureDraft) {
        setMeasureDraft({ x1: px, y1: py, x2: px, y2: py, locked: false });
      } else {
        if (!measureDraft.locked) {
          // Lock the measurement on the second click so it remains visible.
          setMeasureDraft({ ...measureDraft, x2: px, y2: py, locked: true });
        } else {
          // Start a new measurement on the next click.
          setMeasureDraft({ x1: px, y1: py, x2: px, y2: py, locked: false });
        }
      }
      return;
    }

    if (tool === "room") {
      let p = snapPointForWallTool({
        px: x,
        py: y,
        walls,
        gridSize,
        snapGrid: snapping.grid,
        snapWall: snapping.wall,
      });
      if (roomDraft && e.evt.shiftKey) {
        const last = roomDraft.points[roomDraft.points.length - 1]!;
        const dx = p.x - last.x;
        const dy = p.y - last.y;
        if (Math.abs(dx) >= Math.abs(dy)) {
          p = { x: p.x, y: last.y };
        } else {
          p = { x: last.x, y: p.y };
        }
        // Keep grid snapping consistent if axis-constraining changed one axis.
        p = { x: maybeSnap(p.x, gridSize, snapping.grid), y: maybeSnap(p.y, gridSize, snapping.grid) };
      }
      const px = p.x;
      const py = p.y;
      if (!roomDraft) {
        setRoomDraft({ points: [{ x: px, y: py }], hover: { x: px, y: py } });
        return;
      }

      const pts = roomDraft.points;
      const last = pts[pts.length - 1]!;
      if (Math.hypot(px - last.x, py - last.y) < 0.01) return;

      const first = pts[0]!;
      if (pts.length >= 3 && Math.hypot(px - first.x, py - first.y) <= 16) {
        addRoom({
          id: uuid(),
          name: `Room ${rooms.length + 1}`,
          points: pts,
        });
        setRoomDraft(null);
        markDirty();
        setTool("select");
        return;
      }

      setRoomDraft({
        points: [...pts, { x: px, y: py }],
        hover: { x: px, y: py },
      });
      return;
    }

    if (tool === "wall") {
      if (!wallDraft) {
        const p = snapPointForWallTool({
          px: x,
          py: y,
          walls,
          gridSize,
          snapGrid: snapping.grid,
          snapWall: snapping.wall,
        });
        setWallDraft({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
      } else {
        const p2 = snapPointForWallTool({
          px: x,
          py: y,
          walls,
          gridSize,
          snapGrid: snapping.grid,
          snapWall: snapping.wall,
        });
        addWall({
          id: uuid(),
          x1: wallDraft.x1,
          y1: wallDraft.y1,
          x2: p2.x,
          y2: p2.y,
          thickness: 6,
        });
        setWallDraft(null);
        markDirty();
      }
      return;
    }

    if (tool === "door" || tool === "window") {
      const kind: FloorPlanOpeningKind = tool;
      const tpl = openingTemplates[kind];
      const snapped = snapping.wall
        ? snapPointToWalls({
            px: x,
            py: y,
            walls,
            threshold: 24,
            gridSize,
          })
        : null;

      const cx = snapped ? snapped.x : maybeSnap(x, gridSize, snapping.grid);
      const cy = snapped ? snapped.y : maybeSnap(y, gridSize, snapping.grid);
      const wallId = snapped ? snapped.wallId : null;
      const wallT =
        snapped && wallId
          ? (() => {
              const wall = walls.find((w) => w.id === wallId);
              return wall ? openingWallT({ wall, x: cx, y: cy }) : null;
            })()
          : null;
      addOpening({
        id: uuid(),
        kind,
        x: cx,
        y: cy,
        w: tpl.w,
        rotation: snapped ? snapped.rotation : 0,
        wallId,
        wallT,
      });
      setPlacementPreview(null);
      markDirty();
      setTool("select");
      return;
    }

    if (tool === "furniture") {
      const tpl = furnitureTemplateFor(furnitureType);
      const p = snapItemTopLeft({
        x: x - tpl.w / 2,
        y: y - tpl.h / 2,
        w: tpl.w,
        h: tpl.h,
        gridSize,
        walls,
        snapGrid: snapping.grid,
        snapWall: snapping.wall,
      });
      addItem({
        id: uuid(),
        type: furnitureType,
        x: p.x,
        y: p.y,
        w: tpl.w,
        h: tpl.h,
        rotation: placementRotation,
      });
      setPlacementPreview(null);
      markDirty();
      setTool("select");
      return;
    }
  }

  function onStageMouseMove(e: Konva.KonvaEventObject<MouseEvent>) {
    const st = stageRef.current;
    if (!st) return;

    // Always update cursor position for the status bar
    const worldPt = getWorldPointer(st);
    if (worldPt) setCursorPos(worldPt);

    // Update selection rectangle
    if (selectionRect) {
      const world = getWorldPointer(st);
      if (world) {
        setSelectionRect((prev) => prev ? { ...prev, x2: world.x, y2: world.y } : null);
      }
      return;
    }

    if (tool === "measure" && measureDraft && !measureDraft.locked) {
      const world = getWorldPointer(st);
      if (!world) return;
      let p = snapPointForWallTool({
        px: world.x,
        py: world.y,
        walls,
        gridSize,
        snapGrid: snapping.grid,
        snapWall: snapping.wall,
      });
      if (e.evt.shiftKey) {
        const dx = p.x - measureDraft.x1;
        const dy = p.y - measureDraft.y1;
        if (Math.abs(dx) >= Math.abs(dy)) {
          p = { x: p.x, y: measureDraft.y1 };
        } else {
          p = { x: measureDraft.x1, y: p.y };
        }
        p = { x: maybeSnap(p.x, gridSize, snapping.grid), y: maybeSnap(p.y, gridSize, snapping.grid) };
      }
      setMeasureDraft({ ...measureDraft, x2: p.x, y2: p.y });
      return;
    }
    if (tool === "room" && roomDraft) {
      const world = getWorldPointer(st);
      if (!world) return;
      let p = snapPointForWallTool({
        px: world.x,
        py: world.y,
        walls,
        gridSize,
        snapGrid: snapping.grid,
        snapWall: snapping.wall,
      });

      // Detect snap type
      const distToRaw = Math.hypot(p.x - world.x, p.y - world.y);
      if (distToRaw > 0.5) {
        const endpoint = snapping.wall ? snapPointToWallEndpoints({ px: world.x, py: world.y, walls, threshold: 14 }) : null;
        setSnapIndicator({ x: p.x, y: p.y, type: endpoint ? "endpoint" : "grid" });
      } else {
        setSnapIndicator(null);
      }

      if (e.evt.shiftKey) {
        const last = roomDraft.points[roomDraft.points.length - 1]!;
        const dx = p.x - last.x;
        const dy = p.y - last.y;
        if (Math.abs(dx) >= Math.abs(dy)) {
          p = { x: p.x, y: last.y };
        } else {
          p = { x: last.x, y: p.y };
        }
        p = { x: maybeSnap(p.x, gridSize, snapping.grid), y: maybeSnap(p.y, gridSize, snapping.grid) };
      }

      // If we're close to the first point, "magnet" hover to it so closure is obvious.
      if (roomDraft.points.length >= 3) {
        const first = roomDraft.points[0]!;
        if (Math.hypot(p.x - first.x, p.y - first.y) <= 16) {
          p = { x: first.x, y: first.y };
        }
      }
      setRoomDraft({ ...roomDraft, hover: { x: p.x, y: p.y } });
      return;
    }
    if (tool === "wall") {
      if (!wallDraft) { setSnapIndicator(null); return; }
      const world = getWorldPointer(st);
      if (!world) return;
      let p = snapPointForWallTool({
        px: world.x,
        py: world.y,
        walls,
        gridSize,
        snapGrid: snapping.grid,
        snapWall: snapping.wall,
      });

      // Detect snap type
      const distToRaw = Math.hypot(p.x - world.x, p.y - world.y);
      if (distToRaw > 0.5) {
        // Check if it's an endpoint snap
        const endpoint = snapping.wall ? snapPointToWallEndpoints({ px: world.x, py: world.y, walls, threshold: 14 }) : null;
        setSnapIndicator({ x: p.x, y: p.y, type: endpoint ? "endpoint" : "grid" });
      } else {
        setSnapIndicator(null);
      }

      if (e.evt.shiftKey) {
        const dx = p.x - wallDraft.x1;
        const dy = p.y - wallDraft.y1;
        if (Math.abs(dx) >= Math.abs(dy)) {
          p = { x: p.x, y: wallDraft.y1 };
        } else {
          p = { x: wallDraft.x1, y: p.y };
        }
      }

      setWallDraft({ ...wallDraft, x2: p.x, y2: p.y });
      return;
    }

    // Placement previews (doors/windows/furniture).
    if (spaceDown) {
      setPlacementPreview(null);
      return;
    }
    if (tool === "furniture") {
      const world = getWorldPointer(st);
      if (!world) return;
      const tpl = furnitureTemplateFor(furnitureType);
      const p = snapItemTopLeft({
        x: world.x - tpl.w / 2,
        y: world.y - tpl.h / 2,
        w: tpl.w,
        h: tpl.h,
        gridSize,
        walls,
        snapGrid: snapping.grid,
        snapWall: snapping.wall,
      });
      setPlacementPreview({
        kind: "item",
        type: furnitureType,
        x: p.x,
        y: p.y,
        w: tpl.w,
        h: tpl.h,
        rotation: placementRotation,
      });
      return;
    }
    if (tool === "door" || tool === "window") {
      const world = getWorldPointer(st);
      if (!world) return;
      const openingKind: FloorPlanOpeningKind = tool;
      const tpl = openingTemplates[openingKind];
      const snapped = snapping.wall
        ? snapPointToWalls({
            px: world.x,
            py: world.y,
            walls,
            threshold: 24,
            gridSize,
          })
        : null;
      const cx = snapped ? snapped.x : maybeSnap(world.x, gridSize, snapping.grid);
      const cy = snapped ? snapped.y : maybeSnap(world.y, gridSize, snapping.grid);
      setPlacementPreview({
        kind: "opening",
        openingKind,
        x: cx,
        y: cy,
        w: tpl.w,
        h: tpl.h,
        rotation: snapped ? snapped.rotation : 0,
      });
      return;
    }

    setPlacementPreview(null);
  }

  function onStageMouseUp() {
    setMiddleDrag(false);
    if (!selectionRect) return;
    const rect = selectionRect;
    setSelectionRect(null);

    const minX = Math.min(rect.x1, rect.x2);
    const maxX = Math.max(rect.x1, rect.x2);
    const minY = Math.min(rect.y1, rect.y2);
    const maxY = Math.max(rect.y1, rect.y2);

    // Skip tiny rects (clicks)
    if (maxX - minX < 4 && maxY - minY < 4) return;

    const selectedList: { kind: "wall" | "item" | "opening" | "room"; id: string }[] = [];

    for (const it of items) {
      const cx = it.x + it.w / 2;
      const cy = it.y + it.h / 2;
      if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) {
        selectedList.push({ kind: "item", id: it.id });
      }
    }
    for (const op of openings) {
      if (op.x >= minX && op.x <= maxX && op.y >= minY && op.y <= maxY) {
        selectedList.push({ kind: "opening", id: op.id });
      }
    }
    for (const r of rooms) {
      // Select room if its centroid is inside the rect
      const pts = r.points;
      if (pts.length < 3) continue;
      let cx = 0;
      let cy = 0;
      for (const p of pts) {
        cx += p.x;
        cy += p.y;
      }
      cx /= pts.length;
      cy /= pts.length;
      if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) {
        selectedList.push({ kind: "room", id: r.id });
      }
    }
    for (const w of walls) {
      // Select wall if its midpoint is inside the rect
      const mx = (w.x1 + w.x2) / 2;
      const my = (w.y1 + w.y2) / 2;
      if (mx >= minX && mx <= maxX && my >= minY && my <= maxY) {
        selectedList.push({ kind: "wall", id: w.id });
      }
    }

    if (selectedList.length === 0) {
      setSelected(null);
    } else if (selectedList.length === 1) {
      setSelected(selectedList[0]);
    } else {
      setSelected({ kind: "multi", ids: selectedList });
    }
  }

  function onDragEndStage(e: Konva.KonvaEventObject<DragEvent>) {
    if (!(tool === "pan" || spaceDown || middleDrag)) return;
    setStage({ ...stage, x: e.target.x(), y: e.target.y() });
    markDirty();
    setMiddleDrag(false);
  }

  function selectTool(t: FloorPlanTool) {
    setTool(t);
    if (t !== "wall") setWallDraft(null);
    if (t !== "room") setRoomDraft(null);
  }

  function wallHandlesForSelected() {
    if (!selected || selected.kind !== "wall") return null;
    const w = walls.find((x) => x.id === selected.id);
    if (!w) return null;
    return w;
  }

  return (
    <div className="h-full w-full flex flex-col">
      <div className="h-20 shrink-0 border-b border-gray-800 bg-gray-950/60 backdrop-blur-sm flex flex-wrap items-center px-3 gap-2">
        <button
          type="button"
          onClick={() => setShowAssets((v) => !v)}
          className="px-2.5 py-1 rounded-md text-xs border border-gray-800 bg-gray-900 text-gray-300 hover:bg-gray-800 transition lg:hidden"
          aria-expanded={showAssets}
        >
          Assets
        </button>
        <ToolButton active={tool === "select"} onClick={() => selectTool("select")}>
          Select
        </ToolButton>
        <ToolButton active={tool === "wall"} onClick={() => selectTool("wall")}>
          Wall
        </ToolButton>
        <ToolButton active={tool === "room"} onClick={() => selectTool("room")}>
          Room
        </ToolButton>
        <ToolButton active={tool === "door"} onClick={() => selectTool("door")}>
          Door
        </ToolButton>
        <ToolButton active={tool === "window"} onClick={() => selectTool("window")}>
          Window
        </ToolButton>
        <ToolButton
          active={tool === "measure"}
          onClick={() => selectTool("measure")}
        >
          Measure
        </ToolButton>
        <ToolButton
          active={tool === "furniture"}
          onClick={() => selectTool("furniture")}
        >
          Furniture
        </ToolButton>
        <ToolButton active={tool === "pan"} onClick={() => selectTool("pan")}>
          Pan
        </ToolButton>
        <div className="flex items-center gap-1">
          <label className="text-xs text-gray-400">Grid:</label>
          <input
            type="number"
            value={gridSize}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              if (val >= 10 && val <= 200) {
                setGridSize(val);
                markDirty();
              }
            }}
            min={10}
            max={200}
            step={10}
            className="w-12 px-1 py-1 rounded text-xs border border-gray-800 bg-gray-900 text-gray-300"
            title="Grid size in pixels"
          />
        </div>
        <select
          value={units}
          onChange={(e) => {
            setUnits(e.target.value as "m" | "ft");
            markDirty();
          }}
          className="px-2 py-1 rounded text-xs border border-gray-800 bg-gray-900 text-gray-300"
          title="Measurement units"
        >
          <option value="m">Meters</option>
          <option value="ft">Feet</option>
        </select>
        <select
          value=""
          onChange={(e) => {
            const key = e.target.value;
            if (key && FLOOR_PLAN_TEMPLATES[key]) {
              const template = FLOOR_PLAN_TEMPLATES[key];
              try {
                const data = JSON.parse(template.data);
                load(data);
                toast.success(`Loaded template: ${template.name}`);
              } catch (err) {
                toast.error("Failed to load template");
              }
            }
            e.target.value = "";
          }}
          className="px-2 py-1 rounded-md text-xs border border-gray-800 bg-gray-900 text-gray-300 hover:bg-gray-800 transition"
          title="Load a floor plan template"
        >
          <option value="">Templates</option>
          {Object.entries(FLOOR_PLAN_TEMPLATES).map(([key, template]) => (
            <option key={key} value={key}>
              {template.name}
            </option>
          ))}
        </select>

          {tool === "furniture" && (
          <select
            value={furnitureType}
            onChange={(e) => setFurnitureType(e.target.value as FloorPlanItemType)}
            className="ml-2 bg-gray-900 border border-gray-800 text-gray-200 text-xs rounded-md px-2 py-1"
          >
            <option value="generic">generic</option>
            <option value="chair">chair</option>
            <option value="table">table</option>
            <option value="bed">bed</option>
            <option value="sofa">sofa</option>
            <option value="desk">desk</option>
            <option value="toilet">toilet</option>
            <option value="sink">sink</option>
            <option value="bathtub">bathtub</option>
            <option value="stove">stove</option>
            <option value="fridge">fridge</option>
            <option value="wardrobe">wardrobe</option>
            <option value="bookshelf">bookshelf</option>
            <option value="lamp">lamp</option>
            <option value="tv">tv</option>
            <option value="mirror">mirror</option>
            <option value="dishwasher">dishwasher</option>
            <option value="washer">washer</option>
          </select>
        )}

        <LayerToggle
          visibility={layerVisibility}
          onChange={(key) =>
            setLayerVisibility((prev) => ({ ...prev, [key]: !prev[key] }))
          }
        />

        <div className="flex-1" />
        <button
          type="button"
          disabled={!canUndo}
          onClick={() => {
            undo();
            markDirty();
          }}
          className={[
            "px-2.5 py-1 rounded-md text-xs border transition",
            canUndo
              ? "border-gray-800 bg-gray-900 text-gray-300 hover:bg-gray-800"
              : "border-gray-900 bg-gray-950 text-gray-600 cursor-not-allowed",
          ].join(" ")}
          title="Undo (Ctrl/Cmd+Z)"
        >
          Undo
        </button>
        <button
          type="button"
          disabled={!canRedo}
          onClick={() => {
            redo();
            markDirty();
          }}
          className={[
            "px-2.5 py-1 rounded-md text-xs border transition",
            canRedo
              ? "border-gray-800 bg-gray-900 text-gray-300 hover:bg-gray-800"
              : "border-gray-900 bg-gray-950 text-gray-600 cursor-not-allowed",
          ].join(" ")}
          title="Redo (Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z)"
        >
          Redo
        </button>
        <button
          type="button"
          onClick={() => {
            pushHistory();
            setStage({ x: 0, y: 0, scale: 1 });
            markDirty();
          }}
          className="px-2.5 py-1 rounded-md text-xs border border-gray-800 bg-gray-900 text-gray-300 hover:bg-gray-800 transition"
          title="Reset view (Ctrl/Cmd+0)"
        >
          Reset view
        </button>
        <button
          type="button"
          onClick={() => {
            // Compute bounding box of all elements
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            let hasContent = false;

            for (const w of walls) {
              minX = Math.min(minX, w.x1, w.x2);
              minY = Math.min(minY, w.y1, w.y2);
              maxX = Math.max(maxX, w.x1, w.x2);
              maxY = Math.max(maxY, w.y1, w.y2);
              hasContent = true;
            }
            for (const it of items) {
              minX = Math.min(minX, it.x);
              minY = Math.min(minY, it.y);
              maxX = Math.max(maxX, it.x + it.w);
              maxY = Math.max(maxY, it.y + it.h);
              hasContent = true;
            }
            for (const op of openings) {
              minX = Math.min(minX, op.x);
              minY = Math.min(minY, op.y);
              maxX = Math.max(maxX, op.x + op.w);
              maxY = Math.max(maxY, op.y + 14);
              hasContent = true;
            }
            for (const r of rooms) {
              for (const p of r.points) {
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x);
                maxY = Math.max(maxY, p.y);
                hasContent = true;
              }
            }

            if (!hasContent || !wrapRef.current) return;

            const padding = 60;
            const viewW = wrapRef.current.clientWidth;
            const viewH = wrapRef.current.clientHeight;
            const contentW = maxX - minX + padding * 2;
            const contentH = maxY - minY + padding * 2;
            const scaleX = viewW / contentW;
            const scaleY = viewH / contentH;
            const newScale = Math.min(scaleX, scaleY, 3);
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;

            pushHistory();
            setStage({
              x: viewW / 2 - centerX * newScale,
              y: viewH / 2 - centerY * newScale,
              scale: newScale,
            });
            markDirty();
          }}
          className="px-2.5 py-1 rounded-md text-xs border border-gray-800 bg-gray-900 text-gray-300 hover:bg-gray-800 transition"
          title="Fit all content in view"
        >
          Fit
        </button>
        <button
          type="button"
          onClick={exportPng}
          className="px-2.5 py-1 rounded-md text-xs border border-gray-800 bg-gray-900 text-gray-300 hover:bg-gray-800 transition"
        >
          Export PNG
        </button>
        <button
          type="button"
          onClick={() => void exportPdf()}
          className="px-2.5 py-1 rounded-md text-xs border border-gray-800 bg-gray-900 text-gray-300 hover:bg-gray-800 transition"
        >
          Export PDF
        </button>
        <button
          type="button"
          onClick={exportJson}
          className="px-2.5 py-1 rounded-md text-xs border border-gray-800 bg-gray-900 text-gray-300 hover:bg-gray-800 transition hidden sm:inline-flex"
        >
          Export JSON
        </button>
        <button
          type="button"
          onClick={() => importRef.current?.click()}
          className="px-2.5 py-1 rounded-md text-xs border border-gray-800 bg-gray-900 text-gray-300 hover:bg-gray-800 transition hidden sm:inline-flex"
        >
          Import JSON
        </button>
        <button
          type="button"
          onClick={() => {
            const loops = filterInteriorRooms(detectWallLoops(walls));
            const existing = rooms.map((r) => ({ points: r.points }));
            let added = 0;
            pushHistory();
            for (const pts of loops) {
              if (roomExists(existing, pts, 5)) continue;
              addRoom({
                id: uuid(),
                name: `Room ${rooms.length + added + 1}`,
                points: pts.map((p: { x: number; y: number }) => ({ x: p.x, y: p.y })),
              });
              added++;
            }
            if (added > 0) {
              markDirty();
              toast.success(`Detected ${added} room${added > 1 ? "s" : ""}`);
            } else {
              toast.info("No new rooms detected");
            }
          }}
          className="px-2.5 py-1 rounded-md text-xs border border-emerald-900/50 bg-emerald-950/40 text-emerald-200 hover:bg-emerald-950/70 transition hidden sm:inline-flex"
          title="Detect rooms from closed wall loops"
        >
          Detect Rooms
        </button>
        <input
          ref={importRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            // Allow importing the same file twice in a row.
            e.target.value = "";
            if (!f) return;
            void onImportJson(f).catch((err) => {
              const msg = err instanceof Error ? err.message : "Import failed";
              toast.error(msg);
            });
          }}
        />
        {cursorPos && (
          <div className="text-xs text-gray-600 font-mono tabular-nums">
            {Math.round(cursorPos.x)}, {Math.round(cursorPos.y)}
            {" "}&middot;{" "}
            {formatLength({ px: cursorPos.x, pxPerMeter, units })}, {formatLength({ px: cursorPos.y, pxPerMeter, units })}
          </div>
        )}
        <div className="text-xs text-gray-500">
          {saving
            ? "Saving..."
            : autosaveBlockedSeq === editSeq
              ? `Autosave paused${autosaveBlockedReason ? `: ${autosaveBlockedReason}` : ""}`
              : isDirty
                ? "Unsaved changes"
                : "Saved"}
        </div>
      </div>

      {showAssets && (
        <div className="lg:hidden border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm p-2">
          <div className="flex gap-2 flex-wrap">
            {(
              [
                { type: "sofa", label: "Sofa" },
                { type: "bed", label: "Bed" },
                { type: "table", label: "Table" },
                { type: "chair", label: "Chair" },
                { type: "desk", label: "Desk" },
                { type: "bookshelf", label: "Bookshelf" },
                    { type: "lamp", label: "Lamp" },
                    { type: "tv", label: "TV" },
                    { type: "mirror", label: "Mirror" },
                    { type: "toilet", label: "Toilet" },
                { type: "sink", label: "Sink" },
                { type: "stove", label: "Stove" },
                { type: "sink", label: "Sink" },
                { type: "fridge", label: "Fridge" },
                { type: "dishwasher", label: "Dishwasher" },
                { type: "wardrobe", label: "Wardrobe" },
                { type: "toilet", label: "Toilet" },
                { type: "bathtub", label: "Bathtub" },
                { type: "washer", label: "Washer" },
                { type: "generic", label: "Block" },
              ] as const
            ).map((a) => {
              const active = tool === "furniture" && furnitureType === a.type;
              return (
                <button
                  key={a.type}
                  type="button"
                  onClick={() => {
                    setFurnitureType(a.type);
                    setTool("furniture");
                  }}
                  className={[
                    "px-2.5 py-1 rounded-md text-xs border transition",
                    active
                      ? "bg-blue-600 text-white border-blue-500"
                      : "bg-gray-900 text-gray-300 border-gray-800 hover:bg-gray-800",
                  ].join(" ")}
                >
                  {a.label}
                </button>
              );
            })}
          </div>
          <div className="mt-2 text-[11px] text-gray-500">
            Tap an asset, then click on the canvas to place it.
          </div>
        </div>
      )}

      <div
        ref={wrapRef}
        className={[
          "flex-1 bg-gray-950 relative",
          tool === "pan" || spaceDown ? "cursor-grab" : "cursor-default",
        ].join(" ")}
      >
        {tool === "room" && (
          <div className="pointer-events-none absolute left-3 bottom-3 z-10 max-w-[420px] rounded-lg border border-emerald-900/40 bg-emerald-950/40 backdrop-blur-sm px-3 py-2 text-[11px] text-emerald-100/80">
            {!roomDraft ? (
              <div>
                <span className="font-semibold text-emerald-100/90">Room:</span>{" "}
                click to start. Click to add points.{" "}
                <span className="text-emerald-100/70">
                  Enter to finish, Esc to cancel.
                </span>
              </div>
            ) : (
              <div className="space-y-0.5">
                <div>
                  <span className="font-semibold text-emerald-100/90">Room:</span>{" "}
                  click to add points. Click near the first point to close.
                </div>
                <div className="text-emerald-100/70">
                  Shift constrain, Backspace undo, Enter finish, Esc cancel.
                </div>
                {roomDraft.points.length >= 2 && roomDraft.hover && (
                  <div className="text-emerald-100/80">
                    Draft area:{" "}
                    {formatArea({
                      px2: polygonAreaPx2([...roomDraft.points, roomDraft.hover]),
                      pxPerMeter,
                      units,
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          x={stage.x}
          y={stage.y}
          scaleX={stage.scale}
          scaleY={stage.scale}
          draggable={tool === "pan" || spaceDown || middleDrag}
          onDragStart={() => {
            if (!(tool === "pan" || spaceDown || middleDrag)) return;
            pushHistory();
            markDirty();
          }}
          onDragEnd={onDragEndStage}
          onWheel={onWheel}
          onMouseDown={onStageMouseDown}
          onMouseMove={onStageMouseMove}
          onMouseUp={onStageMouseUp}
          onMouseLeave={() => setCursorPos(null)}
        >
          <Layer listening={false} perfectDrawEnabled={false}>
            {/* Reference image */}
            {referenceImage && showReference && (
              <KonvaImage
                image={referenceImage}
                x={0}
                y={0}
                width={referenceImage.width}
                height={referenceImage.height}
                opacity={0.4}
              />
            )}
            {/* Grid */}
            {grid.v.map((pts, i) => (
              <Line
                key={`gv-${i}`}
                points={pts}
                stroke="#111827"
                strokeWidth={1}
              />
            ))}
            {grid.h.map((pts, i) => (
              <Line
                key={`gh-${i}`}
                points={pts}
                stroke="#111827"
                strokeWidth={1}
              />
            ))}
          </Layer>

          <Layer>
            <Group visible={layerVisibility.rooms}>
            {/* Rooms (underlay) */}
            {rooms.map((r) => {
              const isSel = isSelected("room", r.id);
              const pts = r.points.flatMap((p) => [p.x, p.y]);
              const areaPx2 = polygonAreaPx2(r.points);
              const c = polygonCentroid(r.points);
              return (
                <React.Fragment key={r.id}>
                  <Line
                    points={pts}
                    closed
                    fill={isSel ? "rgba(16,185,129,0.13)" : "rgba(16,185,129,0.08)"}
                    stroke={isSel ? "#34d399" : "rgba(16,185,129,0.35)"}
                    strokeWidth={isSel ? 2 : 1}
                    draggable={tool === "select" && isSel && !spaceDown}
                    onMouseDown={(e) => {
                      e.cancelBubble = true;
                      setSelected({ kind: "room", id: r.id });
                      setTool("select");
                    }}
                    onDblClick={(e) => {
                      e.cancelBubble = true;
                      const st = stageRef.current;
                      if (!st) return;
                      const absPos = st.getAbsoluteTransform().point(c);
                      const containerRect = st.container().getBoundingClientRect();
                      setRenamingRoom({
                        id: r.id,
                        screenX: containerRect.left + absPos.x,
                        screenY: containerRect.top + absPos.y,
                        name: r.name,
                      });
                    }}
                    onDragStart={() => {
                      pushHistory();
                      markDirty();
                    }}
                    onDragMove={(e) => {
                      const node = e.target;
                      node.position({
                        x: maybeSnap(node.x(), gridSize, snapping.grid),
                        y: maybeSnap(node.y(), gridSize, snapping.grid),
                      });
                    }}
                    onDragEnd={(e) => {
                      const node = e.target;
                      const dx = maybeSnap(node.x(), gridSize, snapping.grid);
                      const dy = maybeSnap(node.y(), gridSize, snapping.grid);
                      node.position({ x: 0, y: 0 });
                      updateRoom(r.id, {
                        points: r.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
                      });
                      markDirty();
                    }}
                  />
                  {stage.scale >= 0.35 && areaPx2 > 1 && (
                    <Text
                      x={c.x}
                      y={c.y}
                      width={140}
                      offsetX={70}
                      offsetY={12}
                      text={`${r.name}\n${formatArea({
                        px2: areaPx2,
                        pxPerMeter,
                        units,
                      })}`}
                      fontSize={10}
                      fill={isSel ? "rgba(167,243,208,0.95)" : "rgba(167,243,208,0.75)"}
                      align="center"
                      listening={false}
                    />
                  )}
                </React.Fragment>
              );
            })}

            {/* Draft room */}
            {roomDraft && (
              <>
                {(() => {
                  const first = roomDraft.points[0];
                  const hover = roomDraft.hover;
                  const canClose =
                    !!first &&
                    !!hover &&
                    roomDraft.points.length >= 3 &&
                    Math.hypot(hover.x - first.x, hover.y - first.y) <= 0.01;
                  if (!first) return null;
                  return (
                    <>
                      <Circle
                        x={first.x}
                        y={first.y}
                        radius={canClose ? 8 : 6}
                        fill={canClose ? "rgba(16,185,129,0.95)" : "rgba(52,211,153,0.9)"}
                        stroke={canClose ? "#052e21" : "#06281a"}
                        strokeWidth={2}
                        listening={false}
                      />
                      {canClose && (
                        <Text
                          x={first.x + 10}
                          y={first.y - 18}
                          text="Click to close"
                          fontSize={10}
                          fill="rgba(167,243,208,0.95)"
                          listening={false}
                        />
                      )}
                    </>
                  );
                })()}
                <Line
                  points={[
                    ...roomDraft.points.flatMap((p) => [p.x, p.y]),
                    ...(roomDraft.hover ? [roomDraft.hover.x, roomDraft.hover.y] : []),
                  ]}
                  stroke="#34d399"
                  dash={[8, 6]}
                  strokeWidth={2}
                  lineCap="round"
                  lineJoin="round"
                  listening={false}
                />
              </>
            )}
            </Group>

            <Group visible={layerVisibility.walls}>
            {/* Walls layer */}
            {walls.map((w) => {
              const isSel = isSelected("wall", w.id);
              return (
                <React.Fragment key={w.id}>
                  <Line
                    points={[w.x1, w.y1, w.x2, w.y2]}
                    stroke={isSel ? "#60a5fa" : "#9ca3af"}
                    strokeWidth={w.thickness}
                    lineCap="round"
                    draggable={tool === "select" && isSel && !spaceDown}
                    onMouseDown={(e) => {
                      e.cancelBubble = true;
                      setSelected({ kind: "wall", id: w.id });
                      setTool("select");
                    }}
                    onDragStart={() => {
                      pushHistory();
                      markDirty();
                    }}
                    onDragMove={(e) => {
                      const node = e.target;
                      node.position({
                        x: maybeSnap(node.x(), gridSize, snapping.grid),
                        y: maybeSnap(node.y(), gridSize, snapping.grid),
                      });
                    }}
                    onDragEnd={(e) => {
                      const node = e.target;
                      const dx = maybeSnap(node.x(), gridSize, snapping.grid);
                      const dy = maybeSnap(node.y(), gridSize, snapping.grid);
                      node.position({ x: 0, y: 0 });
                      updateWall(w.id, {
                        x1: w.x1 + dx,
                        y1: w.y1 + dy,
                        x2: w.x2 + dx,
                        y2: w.y2 + dy,
                      });
                      markDirty();
                    }}
                  />
                </React.Fragment>
              );
            })}

            {/* Draft wall */}
            {wallDraft && (
              <>
                <Line
                  points={[wallDraft.x1, wallDraft.y1, wallDraft.x2, wallDraft.y2]}
                  stroke="#3b82f6"
                  dash={[8, 6]}
                  strokeWidth={4}
                  lineCap="round"
                  listening={false}
                />
                {(() => {
                  if (stage.scale < 0.35) return null;
                  const lenPx = Math.hypot(
                    wallDraft.x2 - wallDraft.x1,
                    wallDraft.y2 - wallDraft.y1
                  );
                  if (lenPx < gridSize * 1.2) return null;
                  const mx = (wallDraft.x1 + wallDraft.x2) / 2;
                  const my = (wallDraft.y1 + wallDraft.y2) / 2;
                  const ang = Math.atan2(
                    wallDraft.y2 - wallDraft.y1,
                    wallDraft.x2 - wallDraft.x1
                  );
                  const rot = uprightDeg(deg(ang));
                  const nx = -Math.sin(ang);
                  const ny = Math.cos(ang);
                  return (
                    <Text
                      x={mx + nx * 18}
                      y={my + ny * 18}
                      rotation={rot}
                      text={formatLength({ px: lenPx, pxPerMeter, units })}
                      fontSize={11}
                      width={120}
                      offsetX={60}
                      offsetY={7}
                      align="center"
                      fill="rgba(229,231,235,0.9)"
                      stroke="rgba(3,7,18,0.8)"
                      strokeWidth={4}
                      listening={false}
                    />
                  );
                })()}
              </>
            )}
            </Group>

            <Group visible={layerVisibility.openings}>
            {/* Openings layer */}
            {openings.map((op) => {
              const isSel = isSelected("opening", op.id);
              const tpl = openingTemplates[op.kind];
              const fill =
                op.kind === "door"
                  ? isSel
                    ? "rgba(34,197,94,0.25)"
                    : "rgba(34,197,94,0.18)"
                  : isSel
                    ? "rgba(59,130,246,0.25)"
                    : "rgba(59,130,246,0.15)";
              const src = openingIconSrc(op.kind);
              const icon = iconImages[src] ?? null;
              const iconSize = Math.max(10, Math.min(26, Math.min(op.w, tpl.h) * 2.0));
              return (
                <React.Fragment key={op.id}>
                  <Rect
                    id={`opening-${op.id}`}
                    x={op.x}
                    y={op.y}
                    width={op.w}
                    height={tpl.h}
                    offsetX={op.w / 2}
                    offsetY={tpl.h / 2}
                    rotation={op.rotation}
                    fill={fill}
                    stroke={isSel ? "#e5e7eb" : "rgba(229,231,235,0.35)"}
                    strokeWidth={1}
                    draggable={tool === "select"}
                    onMouseDown={(e) => {
                      e.cancelBubble = true;
                      setSelected({ kind: "opening", id: op.id });
                      setTool("select");
                    }}
                    onDragStart={() => {
                      pushHistory();
                      setSelected({ kind: "opening", id: op.id });
                      markDirty();
                    }}
                  onDragMove={(e) => {
                    const node = e.target;
                    const snapped = snapping.wall
                      ? snapPointToWalls({
                          px: node.x(),
                          py: node.y(),
                          walls,
                          threshold: 24,
                          gridSize,
                        })
                      : null;
                    if (snapped) {
                      const half = op.w / 2;
                      const margin = Math.max(half + 2, half);
                      const minT =
                          snapped.wallLen > 0
                            ? clamp(margin / snapped.wallLen, 0, 0.5)
                            : 0;
                        const maxT =
                          snapped.wallLen > 0
                            ? clamp(1 - margin / snapped.wallLen, 0.5, 1)
                            : 1;
                        const t = clamp(snapped.t, minT, maxT);
                        const wall = walls.find((w) => w.id === snapped.wallId);
                        if (wall) {
                          const x = wall.x1 + (wall.x2 - wall.x1) * t;
                          const y = wall.y1 + (wall.y2 - wall.y1) * t;
                          node.position({ x, y });
                        } else {
                          node.position({ x: snapped.x, y: snapped.y });
                        }
                      node.rotation(snapped.rotation);
                    } else {
                      node.position({
                        x: maybeSnap(node.x(), gridSize, snapping.grid),
                        y: maybeSnap(node.y(), gridSize, snapping.grid),
                      });
                    }
                  }}
                  onDragEnd={(e) => {
                    const node = e.target as Konva.Rect;
                    const snapped = snapping.wall
                      ? snapPointToWalls({
                          px: node.x(),
                          py: node.y(),
                          walls,
                          threshold: 24,
                          gridSize,
                        })
                      : null;
                    let x = node.x();
                    let y = node.y();
                    let rotation = node.rotation();
                    let wallId: string | null = null;
                    let wallT: number | null = null;
                      updateOpening(op.id, {
                        ...(snapped
                          ? (() => {
                              const half = op.w / 2;
                              const margin = Math.max(half + 2, half);
                              const minT =
                                snapped.wallLen > 0
                                  ? clamp(margin / snapped.wallLen, 0, 0.5)
                                  : 0;
                              const maxT =
                                snapped.wallLen > 0
                                  ? clamp(1 - margin / snapped.wallLen, 0.5, 1)
                                  : 1;
                              const t = clamp(snapped.t, minT, maxT);
                              const wall = walls.find((w) => w.id === snapped.wallId);
                              if (wall) {
                                x = wall.x1 + (wall.x2 - wall.x1) * t;
                                y = wall.y1 + (wall.y2 - wall.y1) * t;
                                wallT = t;
                              } else {
                                x = snapped.x;
                                y = snapped.y;
                              }
                              rotation = snapped.rotation;
                              wallId = snapped.wallId;
                              return { x, y, rotation, wallId, wallT };
                            })()
                          : { x, y, rotation, wallId, wallT }),
                      });
                      markDirty();
                    }}
                    onTransformStart={() => {
                      pushHistory();
                      markDirty();
                    }}
                    onTransformEnd={(e) => {
                      const node = e.target as Konva.Rect;
                      const scaleX = node.scaleX();
                      node.scaleY(1);
                      node.scaleX(1);
                      const wRaw = Math.max(20, node.width() * scaleX);
                      const wSnapped = snap(wRaw, gridSize);
                      let wClamped = wSnapped;
                      if (op.wallId) {
                        const wall = walls.find((x) => x.id === op.wallId);
                        if (wall) {
                          const len = Math.hypot(
                            wall.x2 - wall.x1,
                            wall.y2 - wall.y1
                          );
                          wClamped = Math.min(wSnapped, Math.max(20, len - 6));
                        }
                      }
                      updateOpening(op.id, { w: wClamped });
                      markDirty();
                    }}
                  />
                  {stage.scale >= 0.6 && icon && (
                    <KonvaImage
                      x={op.x}
                      y={op.y}
                      offsetX={iconSize / 2}
                      offsetY={iconSize / 2}
                      width={iconSize}
                      height={iconSize}
                      rotation={op.rotation}
                      image={icon}
                      opacity={isSel ? 0.9 : 0.75}
                      listening={false}
                    />
                  )}
                  {stage.scale >= 0.6 && !icon && (
                    <Text
                      x={op.x}
                      y={op.y}
                      offsetX={6}
                      offsetY={4}
                      rotation={op.rotation}
                      text={op.kind === "door" ? "DR" : "WN"}
                      fontSize={9}
                      fill="rgba(229,231,235,0.75)"
                      listening={false}
                      align="center"
                    />
                  )}
                  {/* Door swing arc */}
                  {op.kind === "door" && stage.scale >= 0.25 && (() => {
                    const rad = (op.rotation * Math.PI) / 180;
                    const cosR = Math.cos(rad);
                    const sinR = Math.sin(rad);
                    // Hinge at left edge of door in local coords, rotated to world
                    const localHx = -op.w / 2;
                    const localHy = 0;
                    const hingeWorldX = op.x + localHx * cosR - localHy * sinR;
                    const hingeWorldY = op.y + localHx * sinR + localHy * cosR;

                    // The door leaf is perpendicular to the wall, starting at hinge
                    // The arc sweeps from 0 to 90 degrees (in the door's local frame)
                    const arcRadius = op.w;
                    const steps = 12;
                    const arcPoints: number[] = [];
                    const leafEndRad = Math.PI / 2; // 90 degrees

                    for (let i = 0; i <= steps; i++) {
                      const angle = (i / steps) * leafEndRad;
                      // In door-local frame: arc from hinge, perpendicular to wall
                      const localArcX = localHx + arcRadius * Math.sin(angle);
                      const localArcY = localHy - arcRadius * (1 - Math.cos(angle));
                      // Rotate to world
                      const wx = op.x + localArcX * cosR - localArcY * sinR;
                      const wy = op.y + localArcX * sinR + localArcY * cosR;
                      arcPoints.push(wx, wy);
                    }

                    // Door leaf endpoint (at 90 degrees from wall)
                    const leafLocalX = localHx + arcRadius * Math.sin(leafEndRad);
                    const leafLocalY = localHy - arcRadius * (1 - Math.cos(leafEndRad));
                    const leafWorldX = op.x + leafLocalX * cosR - leafLocalY * sinR;
                    const leafWorldY = op.y + leafLocalX * sinR + leafLocalY * cosR;

                    return (
                      <>
                        <Line
                          points={arcPoints}
                          stroke={isSel ? "rgba(34,197,94,0.7)" : "rgba(34,197,94,0.4)"}
                          strokeWidth={1}
                          dash={[4, 3]}
                          lineCap="round"
                          lineJoin="round"
                          listening={false}
                        />
                        <Line
                          points={[hingeWorldX, hingeWorldY, leafWorldX, leafWorldY]}
                          stroke={isSel ? "rgba(34,197,94,0.7)" : "rgba(34,197,94,0.45)"}
                          strokeWidth={1}
                          listening={false}
                        />
                      </>
                    );
                  })()}
                  {/* Window glass lines */}
                  {op.kind === "window" && stage.scale >= 0.35 && (() => {
                    const rad = (op.rotation * Math.PI) / 180;
                    const cosR = Math.cos(rad);
                    const sinR = Math.sin(rad);
                    const inset = tpl.h * 0.3;
                    const halfW = op.w / 2;
                    // Two parallel lines inside the window rect (glass panes)
                    const pts1 = [
                      { lx: -halfW, ly: -inset },
                      { lx: halfW, ly: -inset },
                    ];
                    const pts2 = [
                      { lx: -halfW, ly: inset },
                      { lx: halfW, ly: inset },
                    ];
                    const toWorld = (lx: number, ly: number) => ({
                      x: op.x + lx * cosR - ly * sinR,
                      y: op.y + lx * sinR + ly * cosR,
                    });
                    const w1a = toWorld(pts1[0].lx, pts1[0].ly);
                    const w1b = toWorld(pts1[1].lx, pts1[1].ly);
                    const w2a = toWorld(pts2[0].lx, pts2[0].ly);
                    const w2b = toWorld(pts2[1].lx, pts2[1].ly);
                    return (
                      <>
                        <Line
                          points={[w1a.x, w1a.y, w1b.x, w1b.y]}
                          stroke={isSel ? "rgba(59,130,246,0.5)" : "rgba(59,130,246,0.3)"}
                          strokeWidth={1}
                          dash={[6, 4]}
                          listening={false}
                        />
                        <Line
                          points={[w2a.x, w2a.y, w2b.x, w2b.y]}
                          stroke={isSel ? "rgba(59,130,246,0.5)" : "rgba(59,130,246,0.3)"}
                          strokeWidth={1}
                          dash={[6, 4]}
                          listening={false}
                        />
                        {/* Center divider */}
                        <Line
                          points={[
                            op.x + (-halfW) * cosR - 0 * sinR,
                            op.y + (-halfW) * sinR + 0 * cosR,
                            op.x + halfW * cosR - 0 * sinR,
                            op.y + halfW * sinR + 0 * cosR,
                          ]}
                          stroke={isSel ? "rgba(59,130,246,0.4)" : "rgba(59,130,246,0.2)"}
                          strokeWidth={1}
                          listening={false}
                        />
                      </>
                    );
                  })()}
                </React.Fragment>
              );
            })}
            </Group>

            <Group listening={false}>
            {/* Placement ghost preview */}
            {placementPreview?.kind === "item" &&
              (() => {
                const it = placementPreview;
                const vis = itemVisual(it.type);
                const src = itemIconSrc(it.type);
                const icon = iconImages[src] ?? null;
                const iconSize = Math.max(10, Math.min(26, Math.min(it.w, it.h) * 0.35));
                return (
                  <>
                    <Rect
                      x={it.x}
                      y={it.y}
                      width={it.w}
                      height={it.h}
                      rotation={it.rotation}
                      fill="rgba(148,163,184,0.06)"
                      stroke={vis.fg}
                      strokeWidth={1}
                      dash={[8, 6]}
                    />
                    {stage.scale >= 0.6 && icon && (
                      <KonvaImage
                        x={it.x + it.w / 2}
                        y={it.y + it.h / 2}
                        offsetX={iconSize / 2}
                        offsetY={iconSize / 2}
                        width={iconSize}
                        height={iconSize}
                        rotation={0}
                        image={icon}
                        opacity={0.35}
                      />
                    )}
                    {/* Distance to nearest wall */}
                    {stage.scale >= 0.35 && walls.length > 0 && (() => {
                      // Compute distance from item center to nearest wall segment
                      const cx = it.x + it.w / 2;
                      const cy = it.y + it.h / 2;
                      let minDist = Infinity;
                      let nearX = cx;
                      let nearY = cy;
                      for (const w of walls) {
                        const dx = w.x2 - w.x1;
                        const dy = w.y2 - w.y1;
                        const len2 = dx * dx + dy * dy;
                        if (len2 < 0.001) continue;
                        let t = ((cx - w.x1) * dx + (cy - w.y1) * dy) / len2;
                        t = Math.max(0, Math.min(1, t));
                        const px = w.x1 + t * dx;
                        const py = w.y1 + t * dy;
                        const d = Math.hypot(cx - px, cy - py);
                        if (d < minDist) {
                          minDist = d;
                          nearX = px;
                          nearY = py;
                        }
                      }
                      if (minDist < 20 || minDist > 800) return null;
                      return (
                        <>
                          <Line
                            points={[cx, cy, nearX, nearY]}
                            stroke="rgba(251,191,36,0.5)"
                            strokeWidth={1}
                            dash={[4, 3]}
                          />
                          <Text
                            x={(cx + nearX) / 2}
                            y={(cy + nearY) / 2}
                            text={formatLength({ px: minDist, pxPerMeter, units })}
                            fontSize={9}
                            width={80}
                            offsetX={40}
                            offsetY={5}
                            align="center"
                            fill="rgba(251,191,36,0.85)"
                            stroke="rgba(3,7,18,0.7)"
                            strokeWidth={3}
                          />
                        </>
                      );
                    })()}
                  </>
                );
              })()}
            {placementPreview?.kind === "opening" &&
              (() => {
                const op = placementPreview;
                const fill =
                  op.openingKind === "door"
                    ? "rgba(34,197,94,0.10)"
                    : "rgba(59,130,246,0.10)";
                return (
                  <Rect
                    x={op.x}
                    y={op.y}
                    width={op.w}
                    height={op.h}
                    offsetX={op.w / 2}
                    offsetY={op.h / 2}
                    rotation={op.rotation}
                    fill={fill}
                    stroke="rgba(229,231,235,0.65)"
                    strokeWidth={1}
                    dash={[8, 6]}
                  />
                );
              })()}
            </Group>

            {/* Selection rectangle */}
            {selectionRect && (
              <Group listening={false}>
                <Rect
                  x={Math.min(selectionRect.x1, selectionRect.x2)}
                  y={Math.min(selectionRect.y1, selectionRect.y2)}
                  width={Math.abs(selectionRect.x2 - selectionRect.x1)}
                  height={Math.abs(selectionRect.y2 - selectionRect.y1)}
                  fill="rgba(59,130,246,0.08)"
                  stroke="rgba(59,130,246,0.5)"
                  strokeWidth={1}
                  dash={[6, 4]}
                />
              </Group>
            )}

            <Group visible={layerVisibility.furniture}>
            {/* Furniture */}
            {items.map((it) => {
              const isSel = isSelected("item", it.id);
              const vis = itemVisual(it.type);
              const fill = isSel ? "rgba(59,130,246,0.25)" : vis.fill;
              const stroke = isSel ? "#60a5fa" : vis.fg;
              const src = itemIconSrc(it.type);
              const icon = iconImages[src] ?? null;
              const iconSize = Math.max(14, Math.min(48, Math.min(it.w, it.h) * 0.55));
              return (
                <React.Fragment key={it.id}>
                  <Rect
                    id={`item-${it.id}`}
                    x={it.x}
                    y={it.y}
                    width={it.w}
                    height={it.h}
                    rotation={it.rotation}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={1}
                    draggable={tool === "select"}
                    onMouseDown={(e) => {
                      e.cancelBubble = true;
                      setSelected({ kind: "item", id: it.id });
                      setTool("select");
                    }}
                    onDragStart={() => {
                      pushHistory();
                      setSelected({ kind: "item", id: it.id });
                      markDirty();
                    }}
                    onDragMove={(e) => {
                      const node = e.target;
                      const w = it.w;
                      const h = it.h;
                      const p = snapItemTopLeft({
                        x: node.x(),
                        y: node.y(),
                        w,
                        h,
                        gridSize,
                        walls,
                        snapGrid: snapping.grid,
                        snapWall: snapping.wall,
                      });
                      node.position({ x: p.x, y: p.y });
                    }}
                    onDragEnd={(e) => {
                      const node = e.target;
                      updateItem(it.id, { x: node.x(), y: node.y() });
                      markDirty();
                    }}
                    onTransformStart={() => {
                      pushHistory();
                      markDirty();
                    }}
                    onTransformEnd={(e) => {
                      const node = e.target as Konva.Rect;
                      const scaleX = node.scaleX();
                      const scaleY = node.scaleY();
                      node.scaleX(1);
                      node.scaleY(1);
                      const w = Math.max(10, node.width() * scaleX);
                      const h = Math.max(10, node.height() * scaleY);
                      updateItem(it.id, {
                        x: node.x(),
                        y: node.y(),
                        w: snap(w, gridSize),
                        h: snap(h, gridSize),
                        rotation: node.rotation(),
                      });
                      markDirty();
                    }}
                  />
                  {stage.scale >= 0.6 && icon && (
                    <KonvaImage
                      x={it.x + it.w / 2}
                      y={it.y + it.h / 2}
                      offsetX={iconSize / 2}
                      offsetY={iconSize / 2}
                      width={iconSize}
                      height={iconSize}
                      rotation={0}
                      image={icon}
                      opacity={isSel ? 0.9 : 0.7}
                      listening={false}
                    />
                  )}
                  {stage.scale >= 0.6 && !icon && (
                    <Text
                      x={it.x + it.w / 2}
                      y={it.y + it.h / 2}
                      offsetX={10}
                      offsetY={5}
                      rotation={it.rotation}
                      text={vis.abbr}
                      fontSize={10}
                      fill={isSel ? "rgba(229,231,235,0.92)" : "rgba(229,231,235,0.75)"}
                      listening={false}
                    />
                  )}
                </React.Fragment>
              );
            })}
            </Group>

            <Group listening={false} visible={layerVisibility.annotations}>
            {/* Annotation layer */}
            {walls.map((w) => {
              if (stage.scale < 0.4) return null;
              const mx = (w.x1 + w.x2) / 2;
              const my = (w.y1 + w.y2) / 2;
              const lenPx = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
              // Scale-aware minimum: show labels for shorter walls when zoomed in
              const minLenPx = gridSize * Math.max(1, 2 / stage.scale);
              if (lenPx < minLenPx) return null;
              const ang = Math.atan2(w.y2 - w.y1, w.x2 - w.x1);
              const rot = uprightDeg(deg(ang));
              const nx = -Math.sin(ang);
              const ny = Math.cos(ang);
              const isSel = isSelected("wall", w.id);

              let offset = Math.max(14, w.thickness / 2 + 10);
              // If an opening is near the label anchor point (midpoint), push the label out further.
              for (const op of openings) {
                if (op.wallId !== w.id) continue;
                const d = Math.hypot(op.x - mx, op.y - my);
                if (d < 36) {
                  offset = Math.max(offset, 28);
                  break;
                }
              }

              // Tick mark size at wall endpoints
              const tickLen = 6;

              return (
                <React.Fragment key={`dim-${w.id}`}>
                  {/* Dimension line along wall */}
                  <Line
                    points={[
                      w.x1 + nx * offset,
                      w.y1 + ny * offset,
                      w.x2 + nx * offset,
                      w.y2 + ny * offset,
                    ]}
                    stroke={isSel ? "rgba(96,165,250,0.7)" : "rgba(107,114,128,0.35)"}
                    strokeWidth={1}
                    dash={[4, 3]}
                    listening={false}
                  />
                  {/* Tick mark at endpoint 1 */}
                  <Line
                    points={[
                      w.x1 + nx * (offset - tickLen),
                      w.y1 + ny * (offset - tickLen),
                      w.x1 + nx * (offset + tickLen),
                      w.y1 + ny * (offset + tickLen),
                    ]}
                    stroke={isSel ? "rgba(96,165,250,0.7)" : "rgba(107,114,128,0.4)"}
                    strokeWidth={1}
                    listening={false}
                  />
                  {/* Tick mark at endpoint 2 */}
                  <Line
                    points={[
                      w.x2 + nx * (offset - tickLen),
                      w.y2 + ny * (offset - tickLen),
                      w.x2 + nx * (offset + tickLen),
                      w.y2 + ny * (offset + tickLen),
                    ]}
                    stroke={isSel ? "rgba(96,165,250,0.7)" : "rgba(107,114,128,0.4)"}
                    strokeWidth={1}
                    listening={false}
                  />
                  {/* Dimension label */}
                  <Text
                    x={mx + nx * offset}
                    y={my + ny * offset}
                    rotation={rot}
                    text={formatLength({ px: lenPx, pxPerMeter, units })}
                    fontSize={10}
                    width={96}
                    offsetX={48}
                    offsetY={6}
                    align="center"
                    fill={isSel ? "rgba(147,197,253,0.95)" : "rgba(107,114,128,0.9)"}
                    stroke="rgba(3,7,18,0.7)"
                    strokeWidth={isSel ? 4 : 3}
                    listening={false}
                  />
                </React.Fragment>
              );
            })}
            </Group>
          </Layer>

          <Layer>
            {/* UI overlay layer */}
            {(() => {
              const w = wallHandlesForSelected();
              if (!w) return null;

              // Exclude the selected wall to avoid snapping to itself.
              const otherWalls = walls.filter((x) => x.id !== w.id);
                  const snapHandle = (px: number, py: number) => {
                if (snapping.wall) {
                  const endpoint = snapPointToWallEndpoints({
                    px,
                    py,
                    walls: otherWalls,
                    threshold: 14,
                  });
                  if (endpoint) return { x: endpoint.x, y: endpoint.y };
                }
                return {
                  x: maybeSnap(px, gridSize, snapping.grid),
                  y: maybeSnap(py, gridSize, snapping.grid),
                };
              };

              const common = {
                radius: 7,
                fill: "rgba(96,165,250,0.9)",
                stroke: "#0b1220",
                strokeWidth: 2,
                draggable: tool === "select",
              } as const;

              return (
                <>
                  <Circle
                    {...common}
                    x={w.x1}
                    y={w.y1}
                    onDragStart={() => {
                      pushHistory();
                      markDirty();
                    }}
                    onDragMove={(e) => {
                      const p = snapHandle(e.target.x(), e.target.y());
                      e.target.position(p);
                      setWallDragPreview({
                        id: w.id,
                        x1: p.x,
                        y1: p.y,
                        x2: w.x2,
                        y2: w.y2,
                      });
                    }}
                    onDragEnd={(e) => {
                      const p = snapHandle(e.target.x(), e.target.y());
                      updateWall(w.id, { x1: p.x, y1: p.y });
                      setWallDragPreview(null);
                      markDirty();
                    }}
                  />
                  <Circle
                    {...common}
                    x={w.x2}
                    y={w.y2}
                    onDragStart={() => {
                      pushHistory();
                      markDirty();
                    }}
                    onDragMove={(e) => {
                      const p = snapHandle(e.target.x(), e.target.y());
                      e.target.position(p);
                      setWallDragPreview({
                        id: w.id,
                        x1: w.x1,
                        y1: w.y1,
                        x2: p.x,
                        y2: p.y,
                      });
                    }}
                    onDragEnd={(e) => {
                      const p = snapHandle(e.target.x(), e.target.y());
                      updateWall(w.id, { x2: p.x, y2: p.y });
                      setWallDragPreview(null);
                      markDirty();
                    }}
                  />
                </>
              );
            })()}

            {/* Snap indicator */}
            {snapIndicator && (
              <React.Fragment key="snap-ind">
                <Circle
                  x={snapIndicator.x}
                  y={snapIndicator.y}
                  radius={snapIndicator.type === "endpoint" ? 5 : 3}
                  fill={snapIndicator.type === "endpoint" ? "rgba(96,165,250,0.9)" : "rgba(250,204,21,0.8)"}
                  stroke={snapIndicator.type === "endpoint" ? "#1e3a5f" : "#422006"}
                  strokeWidth={1.5}
                  listening={false}
                />
                {snapIndicator.type === "endpoint" && (
                  <Line
                    points={[
                      snapIndicator.x - 8, snapIndicator.y,
                      snapIndicator.x + 8, snapIndicator.y,
                    ]}
                    stroke="rgba(96,165,250,0.6)"
                    strokeWidth={1}
                    listening={false}
                  />
                )}
                {snapIndicator.type === "endpoint" && (
                  <Line
                    points={[
                      snapIndicator.x, snapIndicator.y - 8,
                      snapIndicator.x, snapIndicator.y + 8,
                    ]}
                    stroke="rgba(96,165,250,0.6)"
                    strokeWidth={1}
                    listening={false}
                  />
                )}
              </React.Fragment>
            )}

            {/* Live dimension label while dragging wall endpoints */}
            {wallDragPreview && (() => {
              const dp = wallDragPreview;
              const lenPx = Math.hypot(dp.x2 - dp.x1, dp.y2 - dp.y1);
              if (lenPx < gridSize) return null;
              const mx = (dp.x1 + dp.x2) / 2;
              const my = (dp.y1 + dp.y2) / 2;
              const ang = Math.atan2(dp.y2 - dp.y1, dp.x2 - dp.x1);
              const rot = uprightDeg(deg(ang));
              const nx = -Math.sin(ang);
              const ny = Math.cos(ang);
              const offset = 20;
              return (
                <React.Fragment key={`wall-drag-dim-${dp.id}`}>
                  <Line
                    points={[
                      dp.x1 + nx * offset,
                      dp.y1 + ny * offset,
                      dp.x2 + nx * offset,
                      dp.y2 + ny * offset,
                    ]}
                    stroke="rgba(96,165,250,0.5)"
                    strokeWidth={1}
                    dash={[4, 3]}
                    listening={false}
                  />
                  <Text
                    x={mx + nx * offset}
                    y={my + ny * offset}
                    rotation={rot}
                    text={formatLength({ px: lenPx, pxPerMeter, units })}
                    fontSize={12}
                    width={100}
                    offsetX={50}
                    offsetY={7}
                    align="center"
                    fill="rgba(147,197,253,1)"
                    stroke="rgba(3,7,18,0.8)"
                    strokeWidth={4}
                    listening={false}
                  />
                </React.Fragment>
              );
            })()}

            {(() => {
              if (!selected || selected.kind !== "room") return null;
              const r = rooms.find((x) => x.id === selected.id);
              if (!r) return null;
              const common = {
                radius: 6,
                fill: "rgba(52,211,153,0.95)",
                stroke: "#052e21",
                strokeWidth: 2,
                draggable: tool === "select",
              } as const;
              const snapHandle = (px: number, py: number) => ({
                x: maybeSnap(px, gridSize, snapping.grid),
                y: maybeSnap(py, gridSize, snapping.grid),
              });
              return (
                <>
                  {r.points.map((p, i) => (
                    <Circle
                      key={`room-h-${r.id}-${i}`}
                      {...common}
                      x={p.x}
                      y={p.y}
                      onMouseDown={(e) => {
                        e.cancelBubble = true;
                      }}
                      onDragStart={() => {
                        pushHistory();
                        markDirty();
                      }}
                      onDragMove={(e) => {
                        const pos = snapHandle(e.target.x(), e.target.y());
                        e.target.position(pos);
                      }}
                      onDragEnd={(e) => {
                        const pos = snapHandle(e.target.x(), e.target.y());
                        updateRoom(r.id, {
                          points: r.points.map((pp, j) =>
                            j === i ? { x: pos.x, y: pos.y } : pp
                          ),
                        });
                        markDirty();
                      }}
                    />
                  ))}
                </>
              );
            })()}

            <Transformer
              ref={trRef}
              rotateEnabled
              enabledAnchors={[
                "top-left",
                "top-right",
                "bottom-left",
                "bottom-right",
              ]}
              boundBoxFunc={(_, next) => {
                // Prevent the element from being too small.
                if (next.width < 10 || next.height < 10) return _;
                return next;
              }}
            />
          </Layer>

          <Layer listening={false}>
            {/* Measurement overlay */}
            {measureDraft && (
              <>
                <Line
                  points={[
                    measureDraft.x1,
                    measureDraft.y1,
                    measureDraft.x2,
                    measureDraft.y2,
                  ]}
                  stroke={
                    measureDraft.locked
                      ? "rgba(229,231,235,0.85)"
                      : "rgba(229,231,235,0.65)"
                  }
                  dash={measureDraft.locked ? [] : [6, 6]}
                  strokeWidth={2}
                />
                <Circle
                  x={measureDraft.x1}
                  y={measureDraft.y1}
                  radius={4}
                  fill="rgba(229,231,235,0.9)"
                  stroke="rgba(3,7,18,0.9)"
                  strokeWidth={2}
                />
                <Circle
                  x={measureDraft.x2}
                  y={measureDraft.y2}
                  radius={4}
                  fill="rgba(229,231,235,0.9)"
                  stroke="rgba(3,7,18,0.9)"
                  strokeWidth={2}
                />
                {(() => {
                  const mx = (measureDraft.x1 + measureDraft.x2) / 2;
                  const my = (measureDraft.y1 + measureDraft.y2) / 2;
                  const ang = Math.atan2(
                    measureDraft.y2 - measureDraft.y1,
                    measureDraft.x2 - measureDraft.x1
                  );
                  const nx = -Math.sin(ang);
                  const ny = Math.cos(ang);
                  const rot = uprightDeg(deg(ang));
                  return (
                <Text
                  x={mx + nx * 16}
                  y={my + ny * 16}
                  text={formatLength({
                    px: Math.hypot(
                      measureDraft.x2 - measureDraft.x1,
                      measureDraft.y2 - measureDraft.y1
                    ),
                    pxPerMeter,
                    units,
                  })}
                  rotation={rot}
                  fontSize={11}
                  width={120}
                  offsetX={60}
                  offsetY={7}
                  align="center"
                  fill="rgba(229,231,235,0.88)"
                  stroke="rgba(3,7,18,0.75)"
                  strokeWidth={4}
                />
                  );
                })()}
              </>
            )}
          </Layer>
        </Stage>

        {showShortcuts && <ShortcutsOverlay onClose={() => setShowShortcuts(false)} />}
        {tutorialStep !== null && (
          <TutorialOverlay step={tutorialStep} onNext={() => setTutorialStep((s) => s === 4 ? null : s! + 1)} onSkip={() => {
            setTutorialStep(null);
            localStorage.setItem(TUTORIAL_STORAGE_KEY, "true");
          }} />
        )}
        {renamingRoom && (() => {
          const st = stageRef.current;
          if (!st) return null;
          const containerRect = st.container().getBoundingClientRect();
          const localX = renamingRoom.screenX - containerRect.left;
          const localY = renamingRoom.screenY - containerRect.top;
          return (
            <input
              autoFocus
              type="text"
              value={renamingRoom.name}
              onChange={(e) => setRenamingRoom((prev) => prev ? { ...prev, name: e.target.value } : null)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const r = renamingRoom;
                  setRenamingRoom(null);
                  if (r.name.trim()) {
                    pushHistory();
                    updateRoomWithHistory(r.id, { name: r.name.trim().slice(0, 60) });
                    markDirty();
                  }
                } else if (e.key === "Escape") {
                  setRenamingRoom(null);
                }
              }}
              onBlur={() => {
                const r = renamingRoom;
                setRenamingRoom(null);
                if (r.name.trim()) {
                  pushHistory();
                  updateRoomWithHistory(r.id, { name: r.name.trim().slice(0, 60) });
                  markDirty();
                }
              }}
              maxLength={60}
              style={{
                position: "absolute",
                left: localX,
                top: localY - 12,
                transform: "translate(-50%, -50%)",
                zIndex: 50,
                background: "rgba(3,7,18,0.95)",
                border: "1px solid rgba(52,211,153,0.6)",
                borderRadius: "6px",
                color: "#a7f3d0",
                fontSize: "12px",
                padding: "3px 8px",
                width: "120px",
                textAlign: "center",
                outline: "none",
              }}
            />
          );
        })()}
      </div>
    </div>
  );
});

function TutorialOverlay({ step, onNext, onSkip }: { step: number; onNext: () => void; onSkip: () => void }) {
  const steps = [
    {
      title: "Welcome to Imbaa3D!",
      content: "This is the floor plan editor. Let's take a quick tour.",
      target: null,
    },
    {
      title: "Drawing Tools",
      content: "Use these tools to draw walls, doors, windows, and add furniture. Try selecting the Wall tool.",
      target: ".tool-wall",
    },
    {
      title: "Canvas Navigation",
      content: "Zoom with mouse wheel, pan by dragging empty space or holding space. Use the Pan tool for precise control.",
      target: ".tool-pan",
    },
    {
      title: "Generation",
      content: "When ready, click 'Generate 3D' to convert your floor plan into a 3D model.",
      target: null,
    },
    {
      title: "Help & Shortcuts",
      content: "Press ? for keyboard shortcuts. Have fun creating!",
      target: null,
    },
  ];

  const current = steps[step];
  if (!current) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-md mx-4 text-center">
        <h3 className="text-lg font-semibold text-white mb-2">{current.title}</h3>
        <p className="text-gray-300 mb-4">{current.content}</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={onSkip}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white"
          >
            Skip Tutorial
          </button>
          <button
            onClick={onNext}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {step === steps.length - 1 ? "Finish" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  const shortcuts = [
    { section: "Tools", items: [
      { keys: "S", desc: "Select tool" },
      { keys: "W", desc: "Wall tool" },
      { keys: "R", desc: "Room tool" },
      { keys: "D", desc: "Door tool" },
      { keys: "I", desc: "Window tool" },
      { keys: "F", desc: "Furniture tool" },
      { keys: "M", desc: "Measure tool" },
      { keys: "P", desc: "Pan tool" },
      { keys: "Space", desc: "Hold to pan" },
      { keys: "Middle click", desc: "Pan canvas" },
      { keys: "Esc", desc: "Cancel / deselect" },
    ]},
    { section: "Editing", items: [
      { keys: "R / Shift+R", desc: "Rotate selection (90\u00B0 / -90\u00B0)" },
      { keys: "G", desc: "Toggle grid snap" },
      { keys: "W", desc: "Toggle wall snap" },
      { keys: "Del / Backspace", desc: "Delete selected" },
      { keys: "Arrow keys", desc: "Nudge selected (Shift=10x, Alt=0.5x)" },
    ]},
    { section: "Clipboard", items: [
      { keys: "Ctrl+C", desc: "Copy" },
      { keys: "Ctrl+V", desc: "Paste at cursor" },
      { keys: "Ctrl+D", desc: "Duplicate" },
    ]},
    { section: "History", items: [
      { keys: "Ctrl+Z", desc: "Undo" },
      { keys: "Ctrl+Y / Ctrl+Shift+Z", desc: "Redo" },
      { keys: "Ctrl+S", desc: "Save now" },
      { keys: "Ctrl+0", desc: "Reset view" },
    ]},
    { section: "General", items: [
      { keys: "?", desc: "Toggle this cheatsheet" },
    ]},
  ];

  return (
    <div
      className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-gray-950/95 border border-gray-800 rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">Keyboard Shortcuts</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-white text-xs px-2 py-1 rounded border border-gray-800 hover:bg-gray-800 transition"
          >
            Close (Esc)
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {shortcuts.map((s) => (
            <div key={s.section}>
              <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                {s.section}
              </div>
              <div className="space-y-1.5">
                {s.items.map((item) => (
                  <div key={item.keys} className="flex items-center gap-3">
                    <kbd className="shrink-0 min-w-[80px] text-right text-[11px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700 font-mono">
                      {item.keys}
                    </kbd>
                    <span className="text-xs text-gray-400">{item.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ToolButton(props: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={props.onClick}
      className={[
        "px-2.5 py-1 rounded-md text-xs border transition",
        props.active
          ? "bg-blue-600 text-white border-blue-500"
          : "bg-gray-900 text-gray-300 border-gray-800 hover:bg-gray-800",
      ].join(" ")}
      type="button"
    >
      {props.children}
    </button>
  );
}

type LayerKey = "rooms" | "walls" | "openings" | "furniture" | "annotations";

function LayerToggle(props: {
  visibility: Record<LayerKey, boolean>;
  onChange: (key: LayerKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const layers: { key: LayerKey; label: string }[] = [
    { key: "rooms", label: "Rooms" },
    { key: "walls", label: "Walls" },
    { key: "openings", label: "Openings" },
    { key: "furniture", label: "Furniture" },
    { key: "annotations", label: "Dimensions" },
  ];

  const hiddenCount = layers.filter((l) => !props.visibility[l.key]).length;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          "px-2.5 py-1 rounded-md text-xs border transition",
          hiddenCount > 0
            ? "bg-amber-900/30 text-amber-200 border-amber-800/60"
            : "bg-gray-900 text-gray-300 border-gray-800 hover:bg-gray-800",
        ].join(" ")}
        title="Toggle layers"
      >
        Layers{hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ""}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 w-40 rounded-lg border border-gray-800 bg-gray-950/95 backdrop-blur-sm shadow-xl p-2">
          {layers.map((l) => (
            <label
              key={l.key}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-gray-300 hover:bg-gray-800/60 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={props.visibility[l.key]}
                onChange={() => props.onChange(l.key)}
                className="rounded border-gray-700"
              />
              {l.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
