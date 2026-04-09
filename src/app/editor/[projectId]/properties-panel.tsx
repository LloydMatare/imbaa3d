"use client";

import { useMemo, useState } from "react";
import { useFloorPlanStore } from "@/lib/store/use-floorplan-store";
import type { FloorPlanItemType } from "@/lib/floorplan/types";

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

export function PropertiesPanel() {
  const selected = useFloorPlanStore((s) => s.selected);
  const setSelected = useFloorPlanStore((s) => s.setSelected);
  const tool = useFloorPlanStore((s) => s.tool);
  const setTool = useFloorPlanStore((s) => s.setTool);

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
  const [wallLenInput, setWallLenInput] = useState<string>("");

  const sel = useMemo(() => {
    if (!selected) return null;
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
    <div className="w-72 border-l border-gray-800 bg-gray-950/70 backdrop-blur-sm shrink-0 hidden lg:flex flex-col">
      <div className="p-4 border-b border-gray-800">
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

      <div className="p-4 overflow-auto">
        {!sel ? (
          <div className="space-y-3">
            <div className="text-xs text-gray-600">Select an object to edit.</div>
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
              </div>
            )}
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
