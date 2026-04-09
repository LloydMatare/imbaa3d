"use client";

import { Html } from "@react-three/drei";
import type { FloorPlanDocV3 } from "@/lib/floorplan/types";

interface DimensionLabelsProps {
  doc: FloorPlanDocV3;
  show?: boolean;
}

function pxToMeters(px: number, pxPerMeter: number): number {
  return px / pxPerMeter;
}

function wallLength(wall: { x1: number; y1: number; x2: number; y2: number }): number {
  return Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
}

function wallCenter(wall: { x1: number; y1: number; x2: number; y2: number }) {
  return {
    cx: (wall.x1 + wall.x2) / 2,
    cy: (wall.y1 + wall.y2) / 2,
  };
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

export function DimensionLabels({ doc, show = true }: DimensionLabelsProps) {
  if (!show) return null;

  const ppm = doc.pxPerMeter;

  return (
    <group>
      {/* Wall dimension labels */}
      {doc.walls.map((wall) => {
        const { cx, cy } = wallCenter(wall);
        const len = wallLength(wall);
        const meters = pxToMeters(len, ppm);
        if (meters < 0.1) return null;

        return (
          <Html
            key={wall.id}
            position={[pxToMeters(cx, ppm), 0.1, -pxToMeters(cy, ppm)]}
            center
            distanceFactor={8}
          >
            <div className="bg-gray-950/80 border border-gray-700 text-gray-200 text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap pointer-events-none">
              {meters.toFixed(2)} m
            </div>
          </Html>
        );
      })}

      {/* Room area labels */}
      {doc.rooms.map((room) => {
        if (room.points.length < 3) return null;
        const xs = room.points.map((p) => p.x);
        const ys = room.points.map((p) => p.y);
        const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
        const cy = ys.reduce((a, b) => a + b, 0) / ys.length;
        const areaPx = polygonAreaPx2(room.points);
        const areaM2 = areaPx / (ppm * ppm);
        if (areaM2 < 0.01) return null;

        return (
          <Html
            key={room.id}
            position={[pxToMeters(cx, ppm), 0.05, -pxToMeters(cy, ppm)]}
            center
            distanceFactor={8}
          >
            <div className="bg-gray-950/80 border border-blue-700/60 text-blue-200 text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap pointer-events-none">
              {room.name || "Room"}: {areaM2.toFixed(1)} m²
            </div>
          </Html>
        );
      })}
    </group>
  );
}

// Toggle button
export function DimensionToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={[
        "px-2.5 py-1 rounded-md text-[11px] border transition",
        enabled
          ? "border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700"
          : "border-gray-800 bg-gray-950/80 text-gray-500 hover:text-gray-300 hover:bg-gray-800",
      ].join(" ")}
      title={enabled ? "Hide dimensions" : "Show dimensions"}
    >
      Dims
    </button>
  );
}
