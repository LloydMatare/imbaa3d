import { create } from "zustand";
import type {
  FloorPlanDocV2,
  FloorPlanItem,
  FloorPlanItemType,
  FloorPlanOpening,
  FloorPlanRoom,
  FloorPlanTool,
  FloorPlanWall,
} from "@/lib/floorplan/types";

type Selection = { kind: "wall" | "item" | "opening" | "room"; id: string } | null;

type Snapshot = Pick<
  FloorPlanDocV2,
  | "stage"
  | "walls"
  | "openings"
  | "items"
  | "rooms"
  | "gridSize"
  | "pxPerMeter"
  | "units"
  | "snapping"
>;

function snapshotOf(s: FloorPlanState): Snapshot {
  return {
    gridSize: s.gridSize,
    pxPerMeter: s.pxPerMeter,
    units: s.units,
    snapping: s.snapping,
    stage: s.stage,
    walls: s.walls,
    openings: s.openings,
    items: s.items,
    rooms: s.rooms,
  };
}

export interface FloorPlanState {
  // Monotonic revision counter used for "dirty" tracking and autosave.
  editSeq: number;
  markDirty: () => void;

  tool: FloorPlanTool;
  setTool: (tool: FloorPlanTool) => void;

  furnitureType: FloorPlanItemType;
  setFurnitureType: (t: FloorPlanItemType) => void;

  gridSize: number;
  setGridSize: (gridSize: number) => void;

  pxPerMeter: number;
  setPxPerMeter: (pxPerMeter: number) => void;
  units: "m" | "ft";
  setUnits: (u: "m" | "ft") => void;

  snapping: {
    grid: boolean;
    wall: boolean;
  };
  setSnapping: (s: FloorPlanState["snapping"]) => void;

  stage: { x: number; y: number; scale: number };
  setStage: (stage: FloorPlanState["stage"]) => void;

  walls: FloorPlanWall[];
  openings: FloorPlanOpening[];
  items: FloorPlanItem[];
  rooms: FloorPlanRoom[];

  wallDraft: { x1: number; y1: number; x2: number; y2: number } | null;
  setWallDraft: (d: FloorPlanState["wallDraft"]) => void;

  selected: Selection;
  setSelected: (sel: Selection) => void;

  load: (doc: FloorPlanDocV2) => void;
  toDoc: () => FloorPlanDocV2;

  addWall: (wall: FloorPlanWall) => void;
  updateWall: (id: string, patch: Partial<FloorPlanWall>) => void;
  updateWallWithHistory: (id: string, patch: Partial<FloorPlanWall>) => void;
  addOpening: (opening: FloorPlanOpening) => void;
  updateOpening: (id: string, patch: Partial<FloorPlanOpening>) => void;
  updateOpeningWithHistory: (
    id: string,
    patch: Partial<FloorPlanOpening>
  ) => void;
  addItem: (item: FloorPlanItem) => void;
  updateItem: (id: string, patch: Partial<FloorPlanItem>) => void;
  updateItemWithHistory: (id: string, patch: Partial<FloorPlanItem>) => void;
  addRoom: (room: FloorPlanRoom) => void;
  updateRoom: (id: string, patch: Partial<FloorPlanRoom>) => void;
  updateRoomWithHistory: (id: string, patch: Partial<FloorPlanRoom>) => void;
  deleteSelected: () => void;

  history: { past: Snapshot[]; future: Snapshot[] };
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  clearHistory: () => void;
}

export const useFloorPlanStore = create<FloorPlanState>((set, get) => ({
  editSeq: 0,
  markDirty: () => set((s) => ({ editSeq: s.editSeq + 1 })),

  tool: "select",
  setTool: (tool) =>
    set({
      tool,
      wallDraft: tool === "wall" ? get().wallDraft : null,
    }),

  furnitureType: "generic",
  setFurnitureType: (furnitureType) => set({ furnitureType }),

  gridSize: 25,
  setGridSize: (gridSize) => {
    get().pushHistory();
    set({ gridSize });
  },

  pxPerMeter: 100,
  setPxPerMeter: (pxPerMeter) => {
    get().pushHistory();
    set({ pxPerMeter });
  },

  units: "m",
  setUnits: (units) => {
    get().pushHistory();
    set({ units });
  },

  snapping: { grid: true, wall: true },
  setSnapping: (snapping) => set({ snapping }),

  stage: { x: 0, y: 0, scale: 1 },
  setStage: (stage) => set({ stage }),

  walls: [],
  openings: [],
  items: [],
  rooms: [],

  wallDraft: null,
  setWallDraft: (wallDraft) => set({ wallDraft }),

  selected: null,
  setSelected: (selected) => set({ selected }),

  load: (doc) =>
    set({
      editSeq: 0,
      tool: "select",
      furnitureType: "generic",
      gridSize: doc.gridSize,
      pxPerMeter: doc.pxPerMeter || 100,
      units: doc.units || "m",
      snapping: doc.snapping || { grid: true, wall: true },
      stage: doc.stage,
      walls: doc.walls,
      openings: doc.openings,
      items: doc.items,
      rooms: doc.rooms || [],
      selected: null,
      wallDraft: null,
      history: { past: [], future: [] },
    }),

  toDoc: () => {
    const s = get();
    return {
      version: 2,
      gridSize: s.gridSize,
      pxPerMeter: s.pxPerMeter,
      units: s.units,
      snapping: s.snapping,
      stage: s.stage,
      walls: s.walls,
      openings: s.openings,
      items: s.items,
      rooms: s.rooms,
    };
  },

  addWall: (wall) => {
    get().pushHistory();
    set((s) => ({ walls: [...s.walls, wall], selected: { kind: "wall", id: wall.id } }));
  },

  updateWall: (id, patch) => {
    set((s) => {
      const nextWalls = s.walls.map((w) => (w.id === id ? { ...w, ...patch } : w));
      const wall = nextWalls.find((w) => w.id === id);
      if (!wall) return { walls: nextWalls };

      // Keep openings attached to the wall in sync if they have wallT.
      const dx = wall.x2 - wall.x1;
      const dy = wall.y2 - wall.y1;
      const rot = (Math.atan2(dy, dx) * 180) / Math.PI;
      const wallLen = Math.hypot(dx, dy);
      const nextOpenings = s.openings.map((op) => {
        if (op.wallId !== id) return op;
        if (op.wallT == null) return op;
        const half = op.w / 2;
        const margin = Math.max(half + 2, half);
        const minT = wallLen > 0 ? Math.min(0.5, margin / wallLen) : 0;
        const maxT = wallLen > 0 ? Math.max(0.5, 1 - margin / wallLen) : 1;
        const t = Math.max(minT, Math.min(maxT, Math.max(0, Math.min(1, op.wallT))));
        const wClamped =
          wallLen > 0 ? Math.min(op.w, Math.max(20, wallLen - 6)) : op.w;
        return {
          ...op,
          w: wClamped,
          wallT: t,
          x: wall.x1 + dx * t,
          y: wall.y1 + dy * t,
          rotation: rot,
        };
      });

      return { walls: nextWalls, openings: nextOpenings };
    });
  },

  updateWallWithHistory: (id, patch) => {
    get().pushHistory();
    get().updateWall(id, patch);
  },

  addOpening: (opening) => {
    get().pushHistory();
    set((s) => ({
      openings: [...s.openings, opening],
      selected: { kind: "opening", id: opening.id },
    }));
  },

  updateOpening: (id, patch) => {
    set((s) => ({
      openings: s.openings.map((op) => (op.id === id ? { ...op, ...patch } : op)),
    }));
  },

  updateOpeningWithHistory: (id, patch) => {
    get().pushHistory();
    get().updateOpening(id, patch);
  },

  addItem: (item) => {
    get().pushHistory();
    set((s) => ({ items: [...s.items, item], selected: { kind: "item", id: item.id } }));
  },

  updateItem: (id, patch) => {
    set((s) => ({
      items: s.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    }));
  },

  updateItemWithHistory: (id, patch) => {
    get().pushHistory();
    get().updateItem(id, patch);
  },

  addRoom: (room) => {
    get().pushHistory();
    set((s) => ({ rooms: [...s.rooms, room], selected: { kind: "room", id: room.id } }));
  },

  updateRoom: (id, patch) => {
    set((s) => ({
      rooms: s.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  },

  updateRoomWithHistory: (id, patch) => {
    get().pushHistory();
    get().updateRoom(id, patch);
  },

  deleteSelected: () => {
    const sel = get().selected;
    if (!sel) return;
    get().pushHistory();
    if (sel.kind === "item") {
      set((s) => ({ items: s.items.filter((x) => x.id !== sel.id), selected: null }));
    } else if (sel.kind === "opening") {
      set((s) => ({
        openings: s.openings.filter((x) => x.id !== sel.id),
        selected: null,
      }));
    } else if (sel.kind === "room") {
      set((s) => ({ rooms: s.rooms.filter((x) => x.id !== sel.id), selected: null }));
    } else {
      set((s) => ({ walls: s.walls.filter((x) => x.id !== sel.id), selected: null }));
    }
  },

  history: { past: [], future: [] },
  pushHistory: () => {
    const s = get();
    const snap = snapshotOf(s);
    set((st) => ({
      history: { past: [...st.history.past, snap], future: [] },
    }));
  },
  undo: () => {
    const s = get();
    const past = s.history.past;
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    const cur = snapshotOf(s);
    set((st) => ({
      ...st,
      gridSize: prev.gridSize,
      pxPerMeter: prev.pxPerMeter,
      units: prev.units,
      snapping: prev.snapping,
      stage: prev.stage,
      walls: prev.walls,
      openings: prev.openings,
      items: prev.items,
      rooms: prev.rooms,
      selected: null,
      wallDraft: null,
      history: { past: past.slice(0, -1), future: [cur, ...st.history.future] },
    }));
  },
  redo: () => {
    const s = get();
    const fut = s.history.future;
    if (fut.length === 0) return;
    const next = fut[0];
    const cur = snapshotOf(s);
    set((st) => ({
      ...st,
      gridSize: next.gridSize,
      pxPerMeter: next.pxPerMeter,
      units: next.units,
      snapping: next.snapping,
      stage: next.stage,
      walls: next.walls,
      openings: next.openings,
      items: next.items,
      rooms: next.rooms,
      selected: null,
      wallDraft: null,
      history: { past: [...st.history.past, cur], future: fut.slice(1) },
    }));
  },
  clearHistory: () => set({ history: { past: [], future: [] } }),
}));
