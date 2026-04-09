"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFloorPlanStore } from "@/lib/store/use-floorplan-store";
import type { FloorPlanItemType } from "@/lib/floorplan/types";
import { toast } from "sonner";
import { UploadPanel } from "@/components/ui/upload-panel";
import { ConversionJobsPanel } from "@/components/ui/conversion-jobs-panel";

function num(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function formatLen(px: number, pxPerMeter: number, units: "m" | "ft") {
  const ppm = pxPerMeter > 0 ? pxPerMeter : 100;
  const meters = px / ppm;
  if (units === "ft") return `${(meters * 3.28084).toFixed(meters >= 3 ? 1 : 2)} ft`;
  return `${meters.toFixed(meters >= 3 ? 1 : 2)} m`;
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

function formatArea(px2: number, pxPerMeter: number, units: "m" | "ft") {
  const ppm = pxPerMeter > 0 ? pxPerMeter : 100;
  const m2 = px2 / (ppm * ppm);
  if (units === "ft") {
    const ft2 = m2 * 10.7639104167;
    return `${ft2.toFixed(ft2 >= 100 ? 0 : 1)} ft^2`;
  }
  return `${m2.toFixed(m2 >= 10 ? 1 : 2)} m^2`;
}

function toMeters(v: number, units: "m" | "ft") {
  return units === "ft" ? v / 3.28084 : v;
}

export function PropertiesPanel({ projectId, onImageUpload }: { projectId: string; onImageUpload?: (url: string) => void }) {
  const selected = useFloorPlanStore((s) => s.selected);
  const setSelected = useFloorPlanStore((s) => s.setSelected);
  const tool = useFloorPlanStore((s) => s.tool);
  const setTool = useFloorPlanStore((s) => s.setTool);
  const placementRotation = useFloorPlanStore((s) => s.placementRotation);
  const setPlacementRotation = useFloorPlanStore((s) => s.setPlacementRotation);
  const furnitureType = useFloorPlanStore((s) => s.furnitureType);
  const placementSizes = useFloorPlanStore((s) => s.placementSizes);
  const setPlacementSize = useFloorPlanStore((s) => s.setPlacementSize);
  const resetPlacementSize = useFloorPlanStore((s) => s.resetPlacementSize);

  const gridSize = useFloorPlanStore((s) => s.gridSize);
  const setGridSize = useFloorPlanStore((s) => s.setGridSize);
  const pxPerMeter = useFloorPlanStore((s) => s.pxPerMeter);
  const setPxPerMeter = useFloorPlanStore((s) => s.setPxPerMeter);
  const units = useFloorPlanStore((s) => s.units);
  const setUnits = useFloorPlanStore((s) => s.setUnits);
  const markDirty = useFloorPlanStore((s) => s.markDirty);
  const [calibLen, setCalibLen] = useState<string>("");
  const snapping = useFloorPlanStore((s) => s.snapping);
  const setSnapping = useFloorPlanStore((s) => s.setSnapping);

  const walls = useFloorPlanStore((s) => s.walls);
  const openings = useFloorPlanStore((s) => s.openings);
  const items = useFloorPlanStore((s) => s.items);
  const rooms = useFloorPlanStore((s) => s.rooms);

  const deleteSelected = useFloorPlanStore((s) => s.deleteSelected);
  const pushHistory = useFloorPlanStore((s) => s.pushHistory);
  const updateWallWithHistory = useFloorPlanStore((s) => s.updateWallWithHistory);
  const updateOpeningWithHistory = useFloorPlanStore(
    (s) => s.updateOpeningWithHistory
  );
  const updateItemWithHistory = useFloorPlanStore((s) => s.updateItemWithHistory);
  const updateRoomWithHistory = useFloorPlanStore((s) => s.updateRoomWithHistory);
  const updateItem = useFloorPlanStore((s) => s.updateItem);
  const updateWall = useFloorPlanStore((s) => s.updateWall);
  const updateRoom = useFloorPlanStore((s) => s.updateRoom);
  const updateOpening = useFloorPlanStore((s) => s.updateOpening);
  const [wallLenInput, setWallLenInput] = useState<string>("");
  const placeWRef = useRef<HTMLInputElement | null>(null);
  const placeHRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const s = placementSizes[furnitureType];
    const w = s ? String(s.w) : "";
    const h = s ? String(s.h) : "";
    if (placeWRef.current) placeWRef.current.value = w;
    if (placeHRef.current) placeHRef.current.value = h;
  }, [furnitureType, placementSizes]);

  const sel = useMemo(() => {
    if (!selected || selected.kind === "multi") return null;
    if (selected.kind === "wall") {
      const w = walls.find((x) => x.id === selected.id);
      return w ? { kind: "wall" as const, w } : null;
    }
    if (selected.kind === "opening") {
      const op = openings.find((x) => x.id === selected.id);
      return op ? { kind: "opening" as const, op } : null;
    }
    if (selected.kind === "room") {
      const r = rooms.find((x) => x.id === selected.id);
      return r ? { kind: "room" as const, r } : null;
    }
    const it = items.find((x) => x.id === selected.id);
    return it ? { kind: "item" as const, it } : null;
  }, [items, openings, rooms, selected, walls]);

  return (
    <div className="w-72 border-l border-gray-800 bg-gray-950/70 backdrop-blur-sm shrink-0 hidden lg:flex flex-col overflow-hidden">
      <div className="p-4 border-b border-gray-800 shrink-0">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Properties
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="col-span-1">
            <div className="text-[11px] text-gray-500 mb-1">Grid</div>
            <input
              value={gridSize}
              onChange={(e) => {
                const n = num(e.target.value);
                if (n == null) return;
                setGridSize(clampInt(n, 5, 100));
                markDirty();
              }}
              className="w-full bg-gray-900 border border-gray-800 text-gray-200 text-xs rounded-md px-2.5 py-2 outline-none focus:border-blue-600"
              inputMode="numeric"
            />
            <div className="flex gap-1 mt-1.5">
              {[10, 25, 50].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    pushHistory();
                    setGridSize(v);
                    markDirty();
                  }}
                  className={[
                    "flex-1 px-1.5 py-1 rounded text-[10px] border transition",
                    gridSize === v
                      ? "bg-blue-600/30 text-blue-200 border-blue-700/60"
                      : "bg-gray-900 text-gray-400 border-gray-800 hover:bg-gray-800",
                  ].join(" ")}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div className="col-span-1">
            <div className="text-[11px] text-gray-500 mb-1">Tool</div>
            <select
              value={tool}
              onChange={(e) => setTool(e.target.value as typeof tool)}
              className="w-full bg-gray-900 border border-gray-800 text-gray-200 text-xs rounded-md px-2.5 py-2 outline-none focus:border-blue-600"
            >
              <option value="select">select</option>
              <option value="wall">wall</option>
              <option value="room">room</option>
              <option value="door">door</option>
              <option value="window">window</option>
              <option value="measure">measure</option>
              <option value="furniture">furniture</option>
              <option value="pan">pan</option>
            </select>
          </div>
        </div>

        {tool === "furniture" && (
          <div className="mt-3">
            <div className="text-[11px] text-gray-500 mb-1">Place Rotation</div>
            <div className="flex gap-2">
              <select
                value={placementRotation}
                onChange={(e) => setPlacementRotation(Number(e.target.value) || 0)}
                className="flex-1 bg-gray-900 border border-gray-800 text-gray-200 text-xs rounded-md px-2.5 py-2 outline-none focus:border-blue-600"
              >
                {[0, 90, 180, 270].map((d) => (
                  <option key={d} value={d}>
                    {d}°
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setPlacementRotation((placementRotation + 90) % 360)}
                className="px-3 py-2 rounded-md text-xs border border-gray-800 bg-gray-900 text-gray-200 hover:bg-gray-800 transition"
                title="Rotate next placement (R)"
              >
                Rotate
              </button>
            </div>
            <div className="mt-3">
              <div className="text-[11px] text-gray-500 mb-1">Place Size (px)</div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  ref={placeWRef}
                  placeholder="W"
                  className="bg-gray-900 border border-gray-800 text-gray-200 text-xs rounded-md px-2.5 py-2 outline-none focus:border-blue-600"
                  inputMode="numeric"
                />
                <input
                  ref={placeHRef}
                  placeholder="H"
                  className="bg-gray-900 border border-gray-800 text-gray-200 text-xs rounded-md px-2.5 py-2 outline-none focus:border-blue-600"
                  inputMode="numeric"
                />
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const w = num(placeWRef.current?.value ?? "");
                    const h = num(placeHRef.current?.value ?? "");
                    if (w == null || h == null) return;
                    setPlacementSize(furnitureType, {
                      w: clampInt(w, 10, 10000),
                      h: clampInt(h, 10, 10000),
                    });
                  }}
                  className="flex-1 px-3 py-2 rounded-md text-xs border border-gray-800 bg-gray-900 text-gray-200 hover:bg-gray-800 transition"
                  title="Apply size for new placements"
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={() => {
                    resetPlacementSize(furnitureType);
                    if (placeWRef.current) placeWRef.current.value = "";
                    if (placeHRef.current) placeHRef.current.value = "";
                  }}
                  className="px-3 py-2 rounded-md text-xs border border-gray-800 bg-gray-900 text-gray-200 hover:bg-gray-800 transition"
                  title="Reset to defaults"
                >
                  Reset
                </button>
              </div>
            </div>
            <div className="mt-2 text-[11px] text-gray-500">
              Tip: press <span className="text-gray-300">R</span> to rotate before placing.
            </div>
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="col-span-1">
            <div className="text-[11px] text-gray-500 mb-1">Units</div>
            <select
              value={units}
              onChange={(e) => {
                setUnits(e.target.value as "m" | "ft");
                markDirty();
              }}
              className="w-full bg-gray-900 border border-gray-800 text-gray-200 text-xs rounded-md px-2.5 py-2 outline-none focus:border-blue-600"
            >
              <option value="m">meters</option>
              <option value="ft">feet</option>
            </select>
          </div>
          <div className="col-span-1">
            <div className="text-[11px] text-gray-500 mb-1">px per meter</div>
            <input
              value={pxPerMeter}
              onChange={(e) => {
                const n = num(e.target.value);
                if (n == null) return;
                setPxPerMeter(clampInt(n, 10, 1000));
                markDirty();
              }}
              className="w-full bg-gray-900 border border-gray-800 text-gray-200 text-xs rounded-md px-2.5 py-2 outline-none focus:border-blue-600"
              inputMode="numeric"
            />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2 text-xs text-gray-300">
            <input
              type="checkbox"
              checked={snapping.grid}
              onChange={(e) => {
                pushHistory();
                setSnapping({ ...snapping, grid: e.target.checked });
                markDirty();
              }}
            />
            Grid snap
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300">
            <input
              type="checkbox"
              checked={snapping.wall}
              onChange={(e) => {
                pushHistory();
                setSnapping({ ...snapping, wall: e.target.checked });
                markDirty();
              }}
            />
            Wall snap
          </label>
        </div>
      </div>

      <div className="p-4 overflow-auto flex-1 min-h-0">
        {!sel ? (
          <div className="space-y-3">
            {selected?.kind === "multi" ? (
              <div className="space-y-3">
                <div className="text-xs text-gray-400">
                  {selected.ids.length} objects selected. Use arrow keys to nudge, Delete to remove.
                </div>
                <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-3">
                  <div className="text-[11px] text-gray-500 mb-2">Align</div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(["left", "centerH", "right", "top", "centerV", "bottom"] as const).map((mode) => {
                      const labels: Record<string, string> = {
                        left: "\u2190 Left",
                        centerH: "\u2194 Center",
                        right: "\u2192 Right",
                        top: "\u2191 Top",
                        centerV: "\u2195 Center",
                        bottom: "\u2193 Bottom",
                      };
                      return (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => {
                            const entries = selected.ids;
                            if (entries.length < 2) return;

                            // Compute bounding boxes for each selected entity
                            type BBox = { x: number; y: number; x2: number; y2: number; entry: typeof entries[number] };
                            const bboxes: BBox[] = [];
                            for (const entry of entries) {
                              if (entry.kind === "item") {
                                const it = items.find((x) => x.id === entry.id);
                                if (it) bboxes.push({ x: it.x, y: it.y, x2: it.x + it.w, y2: it.y + it.h, entry });
                              } else if (entry.kind === "opening") {
                                const op = openings.find((x) => x.id === entry.id);
                                if (op) bboxes.push({ x: op.x, y: op.y, x2: op.x + op.w, y2: op.y + 14, entry });
                              } else if (entry.kind === "room") {
                                const r = rooms.find((x) => x.id === entry.id);
                                if (r && r.points.length >= 3) {
                                  const xs = r.points.map((p) => p.x);
                                  const ys = r.points.map((p) => p.y);
                                  bboxes.push({
                                    x: Math.min(...xs), y: Math.min(...ys),
                                    x2: Math.max(...xs), y2: Math.max(...ys),
                                    entry,
                                  });
                                }
                              } else if (entry.kind === "wall") {
                                const w = walls.find((x) => x.id === entry.id);
                                if (w) bboxes.push({
                                  x: Math.min(w.x1, w.x2), y: Math.min(w.y1, w.y2),
                                  x2: Math.max(w.x1, w.x2), y2: Math.max(w.y1, w.y2),
                                  entry,
                                });
                              }
                            }
                            if (bboxes.length < 2) return;

                            pushHistory();

                            // Compute the target alignment value
                            const allX = bboxes.flatMap((b) => [b.x, b.x2]);
                            const allY = bboxes.flatMap((b) => [b.y, b.y2]);
                            let target: number;
                            if (mode === "left") target = Math.min(...allX);
                            else if (mode === "right") target = Math.max(...allX);
                            else if (mode === "centerH") target = (Math.min(...allX) + Math.max(...allX)) / 2;
                            else if (mode === "top") target = Math.min(...allY);
                            else if (mode === "bottom") target = Math.max(...allY);
                            else target = (Math.min(...allY) + Math.max(...allY)) / 2;

                            for (const b of bboxes) {
                              const entry = b.entry;
                              let dx = 0;
                              let dy = 0;
                              if (mode === "left") dx = target - b.x;
                              else if (mode === "right") dx = target - b.x2;
                              else if (mode === "centerH") dx = target - (b.x + b.x2) / 2;
                              else if (mode === "top") dy = target - b.y;
                              else if (mode === "bottom") dy = target - b.y2;
                              else dy = target - (b.y + b.y2) / 2;

                              if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) continue;

                              if (entry.kind === "item") {
                                const it = items.find((x) => x.id === entry.id);
                                if (it) updateItem(it.id, { x: it.x + dx, y: it.y + dy });
                              } else if (entry.kind === "opening") {
                                const op = openings.find((x) => x.id === entry.id);
                                if (op) updateOpening(op.id, { x: op.x + dx, y: op.y + dy, wallId: null, wallT: null });
                              } else if (entry.kind === "room") {
                                const r = rooms.find((x) => x.id === entry.id);
                                if (r) updateRoom(r.id, { points: r.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) });
                              } else if (entry.kind === "wall") {
                                const w = walls.find((x) => x.id === entry.id);
                                if (w) updateWall(w.id, { x1: w.x1 + dx, y1: w.y1 + dy, x2: w.x2 + dx, y2: w.y2 + dy });
                              }
                            }
                            markDirty();
                          }}
                          className="px-2 py-1.5 rounded text-[11px] border border-gray-800 bg-gray-900 text-gray-300 hover:bg-gray-800 transition"
                        >
                          {labels[mode]}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {/* Wall merge: available when exactly 2 walls are selected */}
                {selected.kind === "multi" &&
                  selected.ids.length === 2 &&
                  selected.ids.every((e) => e.kind === "wall") && (
                  <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-3">
                    <div className="text-[11px] text-gray-500 mb-2">Wall Operations</div>
                    <button
                      type="button"
                      onClick={() => {
                        const w1 = walls.find((x) => x.id === selected.ids[0]!.id);
                        const w2 = walls.find((x) => x.id === selected.ids[1]!.id);
                        if (!w1 || !w2) return;

                        // Check collinearity: project w2 endpoints onto w1's line
                        const dx = w1.x2 - w1.x1;
                        const dy = w1.y2 - w1.y1;
                        const len2 = dx * dx + dy * dy;
                        if (len2 < 1) return;

                        // Project w2 endpoints onto w1's infinite line
                        const proj = (px: number, py: number) => {
                          const t = ((px - w1.x1) * dx + (py - w1.y1) * dy) / len2;
                          return t;
                        };

                        const t1 = proj(w2.x1, w2.y1);
                        const t2 = proj(w2.x2, w2.y2);

                        // Check perpendicular distance
                        const perpDist = (px: number, py: number, t: number) => {
                          const lx = w1.x1 + t * dx;
                          const ly = w1.y1 + t * dy;
                          return Math.hypot(px - lx, py - ly);
                        };

                        const tolerance = Math.max(w1.thickness, w2.thickness) * 2;
                        if (perpDist(w2.x1, w2.y1, t1) > tolerance) {
                          toast.error("Walls are not collinear");
                          return;
                        }
                        if (perpDist(w2.x2, w2.y2, t2) > tolerance) {
                          toast.error("Walls are not collinear");
                          return;
                        }

                        // Find the merged segment: collect all 4 parameter values
                        const t1a = proj(w1.x1, w1.y1); // should be 0
                        const t1b = proj(w1.x2, w1.y2); // should be 1
                        const minT = Math.min(t1a, t1b, t1, t2);
                        const maxT = Math.max(t1a, t1b, t1, t2);

                        const newThickness = Math.max(w1.thickness, w2.thickness);

                        pushHistory();
                        // Update w1 to the merged segment
                        updateWallWithHistory(w1.id, {
                          x1: w1.x1 + dx * minT,
                          y1: w1.y1 + dy * minT,
                          x2: w1.x1 + dx * maxT,
                          y2: w1.y1 + dy * maxT,
                          thickness: newThickness,
                        });
                        // Re-attach w2's openings to w1
                        for (const op of openings) {
                          if (op.wallId === w2.id) {
                            updateOpeningWithHistory(op.id, { wallId: w1.id });
                          }
                        }
                        // Delete w2 by selecting it then calling deleteSelected
                        setSelected({ kind: "wall", id: w2.id });
                        deleteSelected();
                        setSelected(null);

                        markDirty();
                        toast.success("Walls merged");
                      }}
                      className="w-full px-3 py-2 rounded-md text-xs border border-blue-900/50 bg-blue-950/40 text-blue-200 hover:bg-blue-950/70 transition"
                    >
                      Merge Collinear Walls
                    </button>
                    <div className="mt-1.5 text-[10px] text-gray-600">
                      Extends one wall to cover both. Attachments follow.
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-gray-600">Select an object to edit.</div>
            )}
            {rooms.length > 0 && (
              <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-3">
                <div className="text-[11px] text-gray-500 mb-2">Rooms</div>
                <div className="space-y-1">
                  {rooms.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setSelected({ kind: "room", id: r.id });
                        setTool("select");
                      }}
                      className="w-full text-left px-2.5 py-2 rounded-md border border-gray-800 bg-gray-900 text-gray-200 hover:bg-gray-800 transition"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-medium truncate">{r.name}</div>
                        <div className="text-[11px] text-gray-500 shrink-0">
                          {formatArea(polygonAreaPx2(r.points), pxPerMeter, units)}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                {rooms.length > 1 && (
                  <div className="mt-2 pt-2 border-t border-gray-800/60 flex items-center justify-between">
                    <div className="text-[11px] text-gray-500">Total area</div>
                    <div className="text-[11px] text-gray-300 font-medium">
                      {formatArea(
                        rooms.reduce((sum, r) => sum + polygonAreaPx2(r.points), 0),
                        pxPerMeter,
                        units
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            <UploadPanel projectId={projectId} onUploadComplete={onImageUpload} />
            <div className="mt-3">
              <ConversionJobsPanel projectId={projectId} />
            </div>
          </div>
        ) : sel.kind === "wall" ? (
          <div className="space-y-3">
            <div className="text-xs text-gray-300 font-medium">Wall</div>
            <div className="text-xs text-gray-500">
              Length:{" "}
              <span className="text-gray-200">
                {formatLen(
                  Math.hypot(sel.w.x2 - sel.w.x1, sel.w.y2 - sel.w.y1),
                  pxPerMeter,
                  units
                )}
              </span>
            </div>
            <div className="text-xs text-gray-500">
              Angle:{" "}
              <span className="text-gray-200">
                {(() => {
                  const ang = Math.atan2(sel.w.y2 - sel.w.y1, sel.w.x2 - sel.w.x1);
                  const deg = ((ang * 180) / Math.PI + 360) % 360;
                  return `${deg.toFixed(1)}\u00B0`;
                })()}
              </span>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-3">
              <div className="text-[11px] text-gray-500 mb-2">Snap angle</div>
              <div className="flex gap-1.5 flex-wrap">
                {[0, 15, 30, 45, 60, 75, 90, 120, 135, 150].map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => {
                      const len = Math.hypot(sel.w.x2 - sel.w.x1, sel.w.y2 - sel.w.y1);
                      if (len <= 0.001) return;
                      const rad = (a * Math.PI) / 180;
                      updateWallWithHistory(sel.w.id, {
                        x2: sel.w.x1 + Math.cos(rad) * len,
                        y2: sel.w.y1 + Math.sin(rad) * len,
                      });
                      markDirty();
                    }}
                    className="px-2 py-1 rounded text-[11px] border border-gray-800 bg-gray-900 text-gray-300 hover:bg-gray-800 transition"
                  >
                    {a}\u00B0
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-3">
              <div className="text-[11px] text-gray-500 mb-2">Set wall length</div>
              <div className="flex gap-2">
                <input
                  value={wallLenInput}
                  onChange={(e) => setWallLenInput(e.target.value)}
                  placeholder={`Length (${units})`}
                  className="flex-1 bg-gray-900 border border-gray-800 text-gray-200 text-xs rounded-md px-2.5 py-2 outline-none focus:border-blue-600"
                  inputMode="decimal"
                />
                <button
                  type="button"
                  onClick={() => {
                    const v = num(wallLenInput);
                    if (v == null || v <= 0) return;
                    const meters = toMeters(v, units);
                    if (meters <= 0) return;
                    const lenPx = meters * (pxPerMeter > 0 ? pxPerMeter : 100);
                    const dx = sel.w.x2 - sel.w.x1;
                    const dy = sel.w.y2 - sel.w.y1;
                    const cur = Math.hypot(dx, dy);
                    if (cur <= 0.0001) return;
                    const ux = dx / cur;
                    const uy = dy / cur;
                    updateWallWithHistory(sel.w.id, {
                      x2: sel.w.x1 + ux * lenPx,
                      y2: sel.w.y1 + uy * lenPx,
                    });
                    markDirty();
                  }}
                  className="px-3 py-2 rounded-md text-xs border border-gray-800 bg-gray-900 text-gray-200 hover:bg-gray-800 transition"
                  title="Resize keeping the start point fixed"
                >
                  Apply
                </button>
              </div>
              <div className="mt-2 text-[11px] text-gray-500">
                Keeps X1/Y1 fixed and moves X2/Y2 along the current wall direction.
              </div>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-3">
              <div className="text-[11px] text-gray-500 mb-2">
                Calibrate scale (sets px per meter)
              </div>
              <div className="flex gap-2">
                <input
                  value={calibLen}
                  onChange={(e) => setCalibLen(e.target.value)}
                  placeholder={`Length (${units})`}
                  className="flex-1 bg-gray-900 border border-gray-800 text-gray-200 text-xs rounded-md px-2.5 py-2 outline-none focus:border-blue-600"
                  inputMode="decimal"
                />
                <button
                  type="button"
                  onClick={() => {
                    const v = num(calibLen);
                    if (v == null || v <= 0) return;
                    const lenPx = Math.hypot(sel.w.x2 - sel.w.x1, sel.w.y2 - sel.w.y1);
                    const meters = toMeters(v, units);
                    if (meters <= 0) return;
                    const ppm = Math.round(lenPx / meters);
                    setPxPerMeter(clampInt(ppm, 10, 1000));
                    markDirty();
                  }}
                  className="px-3 py-2 rounded-md text-xs border border-gray-800 bg-gray-900 text-gray-200 hover:bg-gray-800 transition"
                  title="Compute px/m based on this wall"
                >
                  Apply
                </button>
              </div>
              <div className="mt-2 text-[11px] text-gray-500">
                Tip: draw/select a known wall (e.g. 10 ft) and apply to make all labels accurate.
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="X1" value={sel.w.x1} readOnly />
              <Field label="Y1" value={sel.w.y1} readOnly />
              <Field label="X2" value={sel.w.x2} readOnly />
              <Field label="Y2" value={sel.w.y2} readOnly />
            </div>
            <div className="grid grid-cols-1 gap-2">
              <Field
                label="Thickness"
                value={sel.w.thickness}
                onChange={(v) => {
                  const n = num(v);
                  if (n == null) return;
                  updateWallWithHistory(sel.w.id, { thickness: clampInt(n, 2, 30) });
                  markDirty();
                }}
              />
            </div>
            <DangerButton
              onClick={() => {
                deleteSelected();
                setSelected(null);
                markDirty();
              }}
            >
              Delete wall
            </DangerButton>
          </div>
        ) : sel.kind === "opening" ? (
          <div className="space-y-3">
            <div className="text-xs text-gray-300 font-medium">
              {sel.op.kind === "door" ? "Door" : "Window"}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="X" value={sel.op.x} readOnly />
              <Field label="Y" value={sel.op.y} readOnly />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field
                label="Width"
                value={sel.op.w}
                onChange={(v) => {
                  const n = num(v);
                  if (n == null) return;
                  updateOpeningWithHistory(sel.op.id, { w: clampInt(n, 20, 500) });
                  markDirty();
                }}
              />
              <Field
                label="Rotation"
                value={sel.op.rotation}
                onChange={(v) => {
                  const n = num(v);
                  if (n == null) return;
                  updateOpeningWithHistory(sel.op.id, { rotation: n });
                  markDirty();
                }}
              />
            </div>
            <DangerButton
              onClick={() => {
                deleteSelected();
                setSelected(null);
                markDirty();
              }}
            >
              Delete
            </DangerButton>
          </div>
        ) : sel.kind === "room" ? (
          <div className="space-y-3">
            <div className="text-xs text-gray-300 font-medium">Room</div>
            <TextField
              label="Name"
              value={sel.r.name}
              onChange={(v) => {
                updateRoomWithHistory(sel.r.id, { name: v.slice(0, 60) });
                markDirty();
              }}
            />
            <div className="text-xs text-gray-500">
              Area:{" "}
              <span className="text-gray-200">
                {formatArea(polygonAreaPx2(sel.r.points), pxPerMeter, units)}
              </span>
            </div>
            <DangerButton
              onClick={() => {
                deleteSelected();
                setSelected(null);
                markDirty();
              }}
            >
              Delete
            </DangerButton>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-xs text-gray-300 font-medium">Furniture</div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="X" value={sel.it.x} readOnly />
              <Field label="Y" value={sel.it.y} readOnly />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field
                label="Width"
                value={sel.it.w}
                onChange={(v) => {
                  const n = num(v);
                  if (n == null) return;
                  updateItemWithHistory(sel.it.id, { w: clampInt(n, 10, 2000) });
                  markDirty();
                }}
              />
              <Field
                label="Height"
                value={sel.it.h}
                onChange={(v) => {
                  const n = num(v);
                  if (n == null) return;
                  updateItemWithHistory(sel.it.id, { h: clampInt(n, 10, 2000) });
                  markDirty();
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[11px] text-gray-500 mb-1">Type</div>
                <select
                  value={sel.it.type}
                  onChange={(e) => {
                    updateItemWithHistory(sel.it.id, {
                      type: e.target.value as FloorPlanItemType,
                    });
                    markDirty();
                  }}
                  className="w-full bg-gray-900 border border-gray-800 text-gray-200 text-xs rounded-md px-2.5 py-2 outline-none focus:border-blue-600"
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
              </div>
              <Field
                label="Rotation"
                value={sel.it.rotation}
                onChange={(v) => {
                  const n = num(v);
                  if (n == null) return;
                  updateItemWithHistory(sel.it.id, { rotation: n });
                  markDirty();
                }}
              />
            </div>
            <DangerButton
              onClick={() => {
                deleteSelected();
                setSelected(null);
                markDirty();
              }}
            >
              Delete
            </DangerButton>
          </div>
        )}
      </div>
    </div>
  );
}

function Field(props: {
  label: string;
  value: number;
  onChange?: (v: string) => void;
  readOnly?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] text-gray-500 mb-1">{props.label}</div>
      <input
        value={String(Math.round(props.value * 100) / 100)}
        onChange={(e) => props.onChange?.(e.target.value)}
        readOnly={props.readOnly}
        className={[
          "w-full bg-gray-900 border text-gray-200 text-xs rounded-md px-2.5 py-2 outline-none",
          props.readOnly
            ? "border-gray-900 text-gray-500 cursor-not-allowed"
            : "border-gray-800 focus:border-blue-600",
        ].join(" ")}
        inputMode="numeric"
      />
    </div>
  );
}

function TextField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="text-[11px] text-gray-500 mb-1">{props.label}</div>
      <input
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="w-full bg-gray-900 border border-gray-800 text-gray-200 text-xs rounded-md px-2.5 py-2 outline-none focus:border-blue-600"
      />
    </div>
  );
}

function DangerButton(props: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="w-full px-3 py-2 rounded-md text-xs border border-red-900/50 bg-red-950/40 text-red-200 hover:bg-red-950/70 transition"
    >
      {props.children}
    </button>
  );
}
