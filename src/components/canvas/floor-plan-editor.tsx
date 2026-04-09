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
} from "@/lib/floorplan/types";
import type { FloorPlanItemType, FloorPlanOpeningKind } from "@/lib/floorplan/types";

export type FloorPlanEditorHandle = {
  saveNow: () => Promise<void>;
  placeFurnitureAtClientPoint: (
    type: FloorPlanItemType,
    clientX: number,
    clientY: number
  ) => void;
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

function deg(rad: number) {
  return (rad * 180) / Math.PI;
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
  { projectId: string; initialFloorPlanData: unknown }
>(function FloorPlanEditor({ projectId, initialFloorPlanData }, ref) {
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
    | null
  >(null);

  const { ref: wrapRef, size } = useElementSize<HTMLDivElement>();

  const tool = useFloorPlanStore((s) => s.tool);
  const setTool = useFloorPlanStore((s) => s.setTool);
  const gridSize = useFloorPlanStore((s) => s.gridSize);
  const snapping = useFloorPlanStore((s) => s.snapping);
  const setSnapping = useFloorPlanStore((s) => s.setSnapping);
  const stage = useFloorPlanStore((s) => s.stage);
  const setStage = useFloorPlanStore((s) => s.setStage);
  const walls = useFloorPlanStore((s) => s.walls);
  const openings = useFloorPlanStore((s) => s.openings);
  const items = useFloorPlanStore((s) => s.items);
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
  const deleteSelected = useFloorPlanStore((s) => s.deleteSelected);
  const pushHistory = useFloorPlanStore((s) => s.pushHistory);
  const undo = useFloorPlanStore((s) => s.undo);
  const redo = useFloorPlanStore((s) => s.redo);
  const canUndo = useFloorPlanStore((s) => s.history.past.length > 0);
  const canRedo = useFloorPlanStore((s) => s.history.future.length > 0);
  const toDoc = useFloorPlanStore((s) => s.toDoc);
  const load = useFloorPlanStore((s) => s.load);
  const editSeq = useFloorPlanStore((s) => s.editSeq);
  const markDirty = useFloorPlanStore((s) => s.markDirty);

  const [saving, setSaving] = useState(false);
  const [savedSeq, setSavedSeq] = useState(0);
  const [spaceDown, setSpaceDown] = useState(false);
  const [measureDraft, setMeasureDraft] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  const [roomDraft, setRoomDraft] = useState<{
    points: { x: number; y: number }[];
    hover: { x: number; y: number } | null;
  } | null>(null);
  const editSeqRef = useRef(0);
  useEffect(() => {
    editSeqRef.current = editSeq;
  }, [editSeq]);

  const isDirty = editSeq !== savedSeq;
  const furnitureType = useFloorPlanStore((s) => s.furnitureType);
  const setFurnitureType = useFloorPlanStore((s) => s.setFurnitureType);
  const pxPerMeter = useFloorPlanStore((s) => s.pxPerMeter);
  const units = useFloorPlanStore((s) => s.units);

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
      }) satisfies Record<FloorPlanItemType, { w: number; h: number }>,
    []
  );

  const [showAssets, setShowAssets] = useState(false);
  const iconImages = useIconImages();

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

  const saveNow = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    const seqAtStart = editSeqRef.current;
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ floorPlanData: toDoc() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Save failed (${res.status})`);
      }
      setSavedSeq(seqAtStart);
      toast.success("Saved");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }, [projectId, saving, toDoc]);

  const placeFurnitureAtClientPoint = useCallback(
    (type: FloorPlanItemType, clientX: number, clientY: number) => {
      const st = stageRef.current;
      if (!st) return;
      const world = worldFromClientPoint({ stage: st, clientX, clientY });
      if (!world) return;
      const tpl = furnitureTemplates[type] ?? furnitureTemplates.generic;
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
        rotation: 0,
      });
      markDirty();
      setTool("select");
    },
    [addItem, furnitureTemplates, gridSize, markDirty, setTool, snapping.grid, snapping.wall, walls]
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
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const doc = upgradeFloorPlanDoc(parsed);
      load(doc);
      // Mark as dirty so it gets saved explicitly / autosaved.
      markDirty();
      toast.success("Imported");
    },
    [load, markDirty]
  );

  // Initial load
  useEffect(() => {
    load(upgradeFloorPlanDoc(initialFloorPlanData));
    setSavedSeq(0);
  }, [initialFloorPlanData, load]);

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
        void saveNow();
      }
      if (!e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "r") {
        // Rotate selected (items/openings) by 90deg. Shift = -90deg.
        if (!selected) return;
        e.preventDefault();
        const d = e.shiftKey ? -90 : 90;
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
        if (selected.kind === "item") {
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
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        // Duplicate = copy + paste (does not touch system clipboard).
        if (!selected) return;
        e.preventDefault();
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
        if (selected.kind === "item") {
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
      if (e.key === "Escape") {
        setWallDraft(null);
        setMeasureDraft(null);
        setRoomDraft(null);
        setSelected(null);
        setTool("select");
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
    () => ({ saveNow, placeFurnitureAtClientPoint }),
    [placeFurnitureAtClientPoint, saveNow]
  );

  // Autosave (debounced)
  useEffect(() => {
    if (saving) return;
    if (!isDirty) return;
    const t = window.setTimeout(() => {
      void saveNow();
    }, 1200);
    return () => window.clearTimeout(t);
  }, [isDirty, saveNow, saving]);

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

    // Hold Space to pan, without switching tools.
    if (spaceDown) return;

    const isEmpty = e.target === e.target.getStage();
    if (tool === "select") {
      if (isEmpty) setSelected(null);
      return;
    }

    const world = getWorldPointer(st);
    if (!world) return;
    const x = world.x;
    const y = world.y;

    if (tool === "measure") {
      const px = maybeSnap(x, gridSize, snapping.grid);
      const py = maybeSnap(y, gridSize, snapping.grid);
      if (!measureDraft) {
        setMeasureDraft({ x1: px, y1: py, x2: px, y2: py });
      } else {
        setMeasureDraft(null);
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
      markDirty();
      setTool("select");
      return;
    }

    if (tool === "furniture") {
      const tpl = furnitureTemplates[furnitureType];
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
        rotation: 0,
      });
      markDirty();
      setTool("select");
      return;
    }
  }

  function onStageMouseMove(e: Konva.KonvaEventObject<MouseEvent>) {
    const st = stageRef.current;
    if (!st) return;
    if (tool === "measure" && measureDraft) {
      const world = getWorldPointer(st);
      if (!world) return;
      const px = maybeSnap(world.x, gridSize, snapping.grid);
      const py = maybeSnap(world.y, gridSize, snapping.grid);
      setMeasureDraft({ ...measureDraft, x2: px, y2: py });
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
    if (tool !== "wall") return;
    if (!wallDraft) return;
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
      const dx = p.x - wallDraft.x1;
      const dy = p.y - wallDraft.y1;
      if (Math.abs(dx) >= Math.abs(dy)) {
        p = { x: p.x, y: wallDraft.y1 };
      } else {
        p = { x: wallDraft.x1, y: p.y };
      }
    }

    setWallDraft({ ...wallDraft, x2: p.x, y2: p.y });
  }

  function onDragEndStage(e: Konva.KonvaEventObject<DragEvent>) {
    if (!(tool === "pan" || spaceDown)) return;
    setStage({ ...stage, x: e.target.x(), y: e.target.y() });
    markDirty();
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
      <div className="h-10 shrink-0 border-b border-gray-800 bg-gray-950/60 backdrop-blur-sm flex items-center px-3 gap-2">
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
          </select>
        )}

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
          onClick={exportPng}
          className="px-2.5 py-1 rounded-md text-xs border border-gray-800 bg-gray-900 text-gray-300 hover:bg-gray-800 transition"
        >
          Export PNG
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
        <div className="text-xs text-gray-500">
          {saving ? "Saving..." : isDirty ? "Unsaved changes" : "Saved"}
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
                { type: "toilet", label: "Toilet" },
                { type: "sink", label: "Sink" },
                { type: "stove", label: "Stove" },
                { type: "fridge", label: "Fridge" },
                { type: "wardrobe", label: "Wardrobe" },
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
          draggable={tool === "pan" || spaceDown}
          onDragStart={() => {
            if (!(tool === "pan" || spaceDown)) return;
            pushHistory();
            markDirty();
          }}
          onDragEnd={onDragEndStage}
          onWheel={onWheel}
          onMouseDown={onStageMouseDown}
          onMouseMove={onStageMouseMove}
        >
          <Layer listening={false} perfectDrawEnabled={false}>
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
            {/* Rooms (underlay) */}
            {rooms.map((r) => {
              const isSel = selected?.kind === "room" && selected.id === r.id;
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
          </Layer>

          <Layer>
            {/* Walls layer */}
            {walls.map((w) => {
              const isSel = selected?.kind === "wall" && selected.id === w.id;
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
              <Line
                points={[wallDraft.x1, wallDraft.y1, wallDraft.x2, wallDraft.y2]}
                stroke="#3b82f6"
                dash={[8, 6]}
                strokeWidth={4}
                lineCap="round"
                listening={false}
              />
            )}
          </Layer>

          <Layer>
            {/* Openings layer */}
            {openings.map((op) => {
              const isSel = selected?.kind === "opening" && selected.id === op.id;
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
                </React.Fragment>
              );
            })}
          </Layer>

          <Layer>
            {/* Furniture */}
            {items.map((it) => {
              const isSel = selected?.kind === "item" && selected.id === it.id;
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
                      rotation={it.rotation}
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
          </Layer>

          <Layer listening={false}>
            {/* Annotation layer */}
            {walls.map((w) => {
              if (stage.scale < 0.4) return null;
              const mx = (w.x1 + w.x2) / 2;
              const my = (w.y1 + w.y2) / 2;
              const lenPx = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
              if (lenPx < gridSize * 2) return null;
              const ang = Math.atan2(w.y2 - w.y1, w.x2 - w.x1);
              const rot = deg(ang);
              const nx = -Math.sin(ang);
              const ny = Math.cos(ang);

              let offset = 14;
              // If an opening is near the label anchor point (midpoint), push the label out further.
              for (const op of openings) {
                if (op.wallId !== w.id) continue;
                const d = Math.hypot(op.x - mx, op.y - my);
                if (d < 36) {
                  offset = 28;
                  break;
                }
              }
              return (
                <Text
                  key={`dim-${w.id}`}
                  x={mx + nx * offset}
                  y={my + ny * offset}
                  rotation={rot}
                  text={formatLength({ px: lenPx, pxPerMeter, units })}
                  fontSize={10}
                  fill="#6b7280"
                  listening={false}
                />
              );
            })}
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
                    }}
                    onDragEnd={(e) => {
                      const p = snapHandle(e.target.x(), e.target.y());
                      updateWall(w.id, { x1: p.x, y1: p.y });
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
                    }}
                    onDragEnd={(e) => {
                      const p = snapHandle(e.target.x(), e.target.y());
                      updateWall(w.id, { x2: p.x, y2: p.y });
                      markDirty();
                    }}
                  />
                </>
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
                  stroke="rgba(229,231,235,0.65)"
                  dash={[6, 6]}
                  strokeWidth={2}
                />
                <Text
                  x={(measureDraft.x1 + measureDraft.x2) / 2 + 10}
                  y={(measureDraft.y1 + measureDraft.y2) / 2 + 10}
                  text={formatLength({
                    px: Math.hypot(
                      measureDraft.x2 - measureDraft.x1,
                      measureDraft.y2 - measureDraft.y1
                    ),
                    pxPerMeter,
                    units,
                  })}
                  fontSize={11}
                  fill="rgba(229,231,235,0.85)"
                />
              </>
            )}
          </Layer>
        </Stage>
      </div>
    </div>
  );
});

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
