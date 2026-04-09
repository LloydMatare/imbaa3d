export type FloorPlanTool =
  | "select"
  | "wall"
  | "room"
  | "door"
  | "window"
  | "measure"
  | "furniture"
  | "pan";

export type FloorPlanWall = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
};

export type FloorPlanItemType =
  | "sofa"
  | "bed"
  | "table"
  | "chair"
  | "desk"
  | "toilet"
  | "sink"
  | "bathtub"
  | "stove"
  | "fridge"
  | "wardrobe"
  | "bookshelf"
  | "generic";

export type FloorPlanItem = {
  id: string;
  type: FloorPlanItemType;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
};

export type FloorPlanOpeningKind = "door" | "window";

// Openings (doors/windows) are stored with x/y as their visual center point.
export type FloorPlanOpening = {
  id: string;
  kind: FloorPlanOpeningKind;
  x: number;
  y: number;
  w: number;
  rotation: number;
  wallId: string | null;
  // If snapped to a wall, the relative position along the wall segment [0..1].
  wallT: number | null;
};

export type FloorPlanPoint = { x: number; y: number };

export type FloorPlanRoom = {
  id: string;
  name: string;
  points: FloorPlanPoint[]; // polygon points (at least 3)
};

export type FloorPlanDocV1 = {
  version: 1;
  gridSize: number;
  stage: { x: number; y: number; scale: number };
  walls: FloorPlanWall[];
  items: FloorPlanItem[];
};

export type FloorPlanDocV2 = {
  version: 2;
  gridSize: number;
  // Scale: how many canvas pixels correspond to 1 meter (used for dimension labels).
  pxPerMeter: number;
  units: "m" | "ft";
  snapping?: { grid: boolean; wall: boolean };
  stage: { x: number; y: number; scale: number };
  walls: FloorPlanWall[];
  openings: FloorPlanOpening[];
  items: FloorPlanItem[];
  rooms: FloorPlanRoom[];
};

export function isFloorPlanDocV1(x: unknown): x is FloorPlanDocV1 {
  if (!x || typeof x !== "object") return false;
  const o = x as Partial<FloorPlanDocV1>;
  const stage = (o as { stage?: unknown }).stage;
  if (!stage || typeof stage !== "object") return false;
  const st = stage as Record<string, unknown>;
  return (
    o.version === 1 &&
    typeof o.gridSize === "number" &&
    typeof st.x === "number" &&
    typeof st.y === "number" &&
    typeof st.scale === "number" &&
    Array.isArray(o.walls) &&
    Array.isArray(o.items)
  );
}

export function isFloorPlanDocV2(x: unknown): x is FloorPlanDocV2 {
  if (!x || typeof x !== "object") return false;
  const o = x as Partial<FloorPlanDocV2>;
  const stage = (o as { stage?: unknown }).stage;
  if (!stage || typeof stage !== "object") return false;
  const st = stage as Record<string, unknown>;
  return (
    o.version === 2 &&
    typeof o.gridSize === "number" &&
    typeof st.x === "number" &&
    typeof st.y === "number" &&
    typeof st.scale === "number" &&
    Array.isArray(o.walls) &&
    Array.isArray(o.openings) &&
    Array.isArray(o.items)
  );
}

function clamp01(n: number) {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function asNumber(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

function asString(x: unknown): string | null {
  return typeof x === "string" ? x : null;
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function openingTFromXY(args: {
  wall: FloorPlanWall;
  x: number;
  y: number;
}): number | null {
  const { wall, x, y } = args;
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const len2 = dx * dx + dy * dy;
  if (!Number.isFinite(len2) || len2 <= 0) return null;
  const t = ((x - wall.x1) * dx + (y - wall.y1) * dy) / len2;
  return clamp01(t);
}

function normalizeFloorPlanDocV2(input: FloorPlanDocV2): FloorPlanDocV2 {
  const gridSize = clampInt(asNumber(input.gridSize) ?? 25, 5, 200);
  const pxPerMeter = clampInt(asNumber(input.pxPerMeter) ?? 100, 10, 2000);
  const units: "m" | "ft" = input.units === "ft" ? "ft" : "m";
  const snappingObj = (input.snapping ?? {}) as Record<string, unknown>;
  const snapping = {
    grid: typeof snappingObj.grid === "boolean" ? snappingObj.grid : true,
    wall: typeof snappingObj.wall === "boolean" ? snappingObj.wall : true,
  };

  const stageObj = (input.stage ?? {}) as Record<string, unknown>;
  const stage = {
    x: asNumber(stageObj.x) ?? 0,
    y: asNumber(stageObj.y) ?? 0,
    scale: clamp(asNumber(stageObj.scale) ?? 1, 0.1, 8),
  };

  const walls: FloorPlanWall[] = [];
  for (const raw of Array.isArray(input.walls) ? input.walls : []) {
    const o = raw as Record<string, unknown>;
    const id = asString(o.id) ?? crypto.randomUUID();
    const x1 = asNumber(o.x1);
    const y1 = asNumber(o.y1);
    const x2 = asNumber(o.x2);
    const y2 = asNumber(o.y2);
    if (x1 == null || y1 == null || x2 == null || y2 == null) continue;
    const thickness = clampInt(asNumber(o.thickness) ?? 6, 2, 40);
    walls.push({ id, x1, y1, x2, y2, thickness });
  }

  const wallsById = new Map(walls.map((w) => [w.id, w]));

  const openings: FloorPlanOpening[] = [];
  for (const raw of Array.isArray(input.openings) ? input.openings : []) {
    const o = raw as Record<string, unknown>;
    const id = asString(o.id) ?? crypto.randomUUID();
    const kind: FloorPlanOpeningKind = o.kind === "window" ? "window" : "door";
    const x = asNumber(o.x);
    const y = asNumber(o.y);
    if (x == null || y == null) continue;
    const w = clampInt(asNumber(o.w) ?? (kind === "door" ? 90 : 80), 20, 2000);
    const rotation = asNumber(o.rotation) ?? 0;
    const wallId = asString(o.wallId) ?? null;
    const wall = wallId ? wallsById.get(wallId) : null;
    const wallT0 = asNumber(o.wallT);
    const wallT =
      wall && (wallT0 == null || !Number.isFinite(wallT0))
        ? openingTFromXY({ wall, x, y })
        : wallT0 == null
          ? null
          : clamp01(wallT0);
    openings.push({
      id,
      kind,
      x,
      y,
      w,
      rotation,
      wallId: wall ? wallId : null,
      wallT: wall ? (wallT == null ? null : clamp01(wallT)) : null,
    });
  }

  const items: FloorPlanItem[] = [];
  for (const raw of Array.isArray(input.items) ? input.items : []) {
    const o = raw as Record<string, unknown>;
    const id = asString(o.id) ?? crypto.randomUUID();
    const type = asString(o.type);
    const allowed: Record<FloorPlanItemType, true> = {
      sofa: true,
      bed: true,
      table: true,
      chair: true,
      desk: true,
      toilet: true,
      sink: true,
      bathtub: true,
      stove: true,
      fridge: true,
      wardrobe: true,
      bookshelf: true,
      generic: true,
    };
    const t: FloorPlanItemType =
      type && (allowed as Record<string, true | undefined>)[type]
        ? (type as FloorPlanItemType)
        : "generic";
    const x = asNumber(o.x);
    const y = asNumber(o.y);
    const w = asNumber(o.w);
    const h = asNumber(o.h);
    if (x == null || y == null || w == null || h == null) continue;
    const rotation = asNumber(o.rotation) ?? 0;
    items.push({
      id,
      type: t,
      x,
      y,
      w: clampInt(w, 10, 10000),
      h: clampInt(h, 10, 10000),
      rotation,
    });
  }

  const rooms: FloorPlanRoom[] = [];
  const roomsInput = (input as unknown as { rooms?: unknown }).rooms;
  const roomsArr: unknown[] = Array.isArray(roomsInput) ? roomsInput : [];
  for (const raw of roomsArr) {
    const o = raw as Record<string, unknown>;
    const id = asString(o.id) ?? crypto.randomUUID();
    const name = asString(o.name) ?? "Room";
    const ptsRaw = (o.points ?? []) as unknown;
    if (!Array.isArray(ptsRaw)) continue;
    const points: FloorPlanPoint[] = [];
    for (const pr of ptsRaw) {
      const p = pr as Record<string, unknown>;
      const x = asNumber(p.x);
      const y = asNumber(p.y);
      if (x == null || y == null) continue;
      points.push({ x, y });
    }
    if (points.length < 3) continue;
    // Cap points to prevent pathological payloads.
    rooms.push({ id, name: name.slice(0, 60), points: points.slice(0, 200) });
  }

  return {
    version: 2,
    gridSize,
    pxPerMeter,
    units,
    snapping,
    stage,
    walls,
    openings,
    items,
    rooms,
  };
}

export function upgradeFloorPlanDoc(input: unknown): FloorPlanDocV2 {
  if (isFloorPlanDocV2(input)) return normalizeFloorPlanDocV2(input);
  if (isFloorPlanDocV1(input)) {
    return {
      version: 2,
      gridSize: input.gridSize,
      pxPerMeter: 100,
      units: "m",
      snapping: { grid: true, wall: true },
      stage: input.stage,
      walls: input.walls,
      openings: [],
      items: input.items,
      rooms: [],
    };
  }
  return {
    version: 2,
    gridSize: 25,
    pxPerMeter: 100,
    units: "m",
    snapping: { grid: true, wall: true },
    stage: { x: 0, y: 0, scale: 1 },
    walls: [],
    openings: [],
    items: [],
    rooms: [],
  };
}
