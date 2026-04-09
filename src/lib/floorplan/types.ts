export type FloorPlanTool =
  | "select"
  | "wall"
  | "room"
  | "door"
  | "window"
  | "measure"
  | "furniture"
  | "pan";

export const FLOORPLAN_SCHEMA_ID = "imbaa3d.floorplan" as const;
export const CURRENT_FLOORPLAN_VERSION = 3 as const;

const MAX_WALLS = 2000;
const MAX_OPENINGS = 2000;
const MAX_ITEMS = 2000;
const MAX_ROOMS = 500;
const MAX_ROOM_POINTS = 200;

export type FloorPlanUpgradeReport = {
  truncated: {
    walls: number;
    openings: number;
    items: number;
    rooms: number;
    roomPoints: number;
  };
  droppedInvalid: {
    walls: number;
    openings: number;
    items: number;
    rooms: number;
    roomPoints: number;
  };
};

export function createEmptyFloorPlanUpgradeReport(): FloorPlanUpgradeReport {
  return {
    truncated: { walls: 0, openings: 0, items: 0, rooms: 0, roomPoints: 0 },
    droppedInvalid: { walls: 0, openings: 0, items: 0, rooms: 0, roomPoints: 0 },
  };
}

export function summarizeFloorPlanUpgradeReport(
  report: FloorPlanUpgradeReport
): string | null {
  const parts: string[] = [];

  const t = report.truncated;
  if (t.walls) parts.push(`walls truncated: ${t.walls}`);
  if (t.openings) parts.push(`openings truncated: ${t.openings}`);
  if (t.items) parts.push(`items truncated: ${t.items}`);
  if (t.rooms) parts.push(`rooms truncated: ${t.rooms}`);
  if (t.roomPoints) parts.push(`room points truncated: ${t.roomPoints}`);

  const d = report.droppedInvalid;
  if (d.walls) parts.push(`invalid walls dropped: ${d.walls}`);
  if (d.openings) parts.push(`invalid openings dropped: ${d.openings}`);
  if (d.items) parts.push(`invalid items dropped: ${d.items}`);
  if (d.rooms) parts.push(`invalid rooms dropped: ${d.rooms}`);
  if (d.roomPoints) parts.push(`invalid room points dropped: ${d.roomPoints}`);

  return parts.length ? parts.join("; ") : null;
}

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
  | "lamp"
  | "tv"
  | "mirror"
  | "dishwasher"
  | "washer"
  | "car"
  | "flowerpot"
  | "generic"
  | "cabinet"
  | "shelf"
  | "plant";

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

export type FloorPlanDocV3 = {
  schema: typeof FLOORPLAN_SCHEMA_ID;
  version: 3;
  gridSize: number;
  pxPerMeter: number;
  units: "m" | "ft";
  snapping: { grid: boolean; wall: boolean };
  stage: { x: number; y: number; scale: number };
  walls: FloorPlanWall[];
  openings: FloorPlanOpening[];
  items: FloorPlanItem[];
  rooms: FloorPlanRoom[];
  // Reserved for future migrations/debugging. The editor does not currently mutate this.
  meta?: { createdAt?: string; updatedAt?: string };
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

export function isFloorPlanDocV3(x: unknown): x is FloorPlanDocV3 {
  if (!x || typeof x !== "object") return false;
  const o = x as Partial<FloorPlanDocV3>;
  const stage = (o as { stage?: unknown }).stage;
  if (!stage || typeof stage !== "object") return false;
  const st = stage as Record<string, unknown>;
  return (
    o.schema === FLOORPLAN_SCHEMA_ID &&
    o.version === 3 &&
    typeof o.gridSize === "number" &&
    typeof o.pxPerMeter === "number" &&
    (o.units === "m" || o.units === "ft") &&
    typeof st.x === "number" &&
    typeof st.y === "number" &&
    typeof st.scale === "number" &&
    Array.isArray(o.walls) &&
    Array.isArray(o.openings) &&
    Array.isArray(o.items) &&
    Array.isArray(o.rooms)
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

function asRecord(x: unknown): Record<string, unknown> {
  return x && typeof x === "object" ? (x as Record<string, unknown>) : {};
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

function normalizeFloorPlanCore(
  input: unknown,
  report: FloorPlanUpgradeReport | null
): FloorPlanDocV2 {
  const o = asRecord(input);
  const gridSize = clampInt(asNumber(o.gridSize) ?? 25, 5, 200);
  const pxPerMeter = clampInt(asNumber(o.pxPerMeter) ?? 100, 10, 2000);
  const units: "m" | "ft" = o.units === "ft" ? "ft" : "m";
  const snappingObj = asRecord(o.snapping);
  const snapping = {
    grid: typeof snappingObj.grid === "boolean" ? snappingObj.grid : true,
    wall: typeof snappingObj.wall === "boolean" ? snappingObj.wall : true,
  };

  const stageObj = asRecord(o.stage);
  const stage = {
    x: asNumber(stageObj.x) ?? 0,
    y: asNumber(stageObj.y) ?? 0,
    scale: clamp(asNumber(stageObj.scale) ?? 1, 0.1, 8),
  };

  const walls: FloorPlanWall[] = [];
  const rawWalls = Array.isArray(o.walls) ? o.walls : [];
  if (report && rawWalls.length > MAX_WALLS) report.truncated.walls += rawWalls.length - MAX_WALLS;
  for (const raw of rawWalls.slice(0, MAX_WALLS)) {
    const o = raw as Record<string, unknown>;
    const id = asString(o.id) ?? crypto.randomUUID();
    const x1 = asNumber(o.x1);
    const y1 = asNumber(o.y1);
    const x2 = asNumber(o.x2);
    const y2 = asNumber(o.y2);
    if (x1 == null || y1 == null || x2 == null || y2 == null) {
      if (report) report.droppedInvalid.walls += 1;
      continue;
    }
    const thickness = clampInt(asNumber(o.thickness) ?? 6, 2, 40);
    walls.push({ id, x1, y1, x2, y2, thickness });
  }

  const wallsById = new Map(walls.map((w) => [w.id, w]));

  const openings: FloorPlanOpening[] = [];
  const rawOpenings = Array.isArray(o.openings) ? o.openings : [];
  if (report && rawOpenings.length > MAX_OPENINGS)
    report.truncated.openings += rawOpenings.length - MAX_OPENINGS;
  for (const raw of rawOpenings.slice(0, MAX_OPENINGS)) {
    const o = raw as Record<string, unknown>;
    const id = asString(o.id) ?? crypto.randomUUID();
    const kind: FloorPlanOpeningKind = o.kind === "window" ? "window" : "door";
    const x = asNumber(o.x);
    const y = asNumber(o.y);
    if (x == null || y == null) {
      if (report) report.droppedInvalid.openings += 1;
      continue;
    }
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
  const rawItems = Array.isArray(o.items) ? o.items : [];
  if (report && rawItems.length > MAX_ITEMS) report.truncated.items += rawItems.length - MAX_ITEMS;
  for (const raw of rawItems.slice(0, MAX_ITEMS)) {
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
      lamp: true,
      tv: true,
      mirror: true,
      dishwasher: true,
      washer: true,
      car: true,
      flowerpot: true,
      generic: true,
      cabinet: true,
      shelf: true,
      plant: true,
    };
    const t: FloorPlanItemType =
      type && (allowed as Record<string, true | undefined>)[type]
        ? (type as FloorPlanItemType)
        : "generic";
    const x = asNumber(o.x);
    const y = asNumber(o.y);
    const w = asNumber(o.w);
    const h = asNumber(o.h);
    if (x == null || y == null || w == null || h == null) {
      if (report) report.droppedInvalid.items += 1;
      continue;
    }
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
  const rawRooms = Array.isArray(o.rooms) ? o.rooms : [];
  if (report && rawRooms.length > MAX_ROOMS) report.truncated.rooms += rawRooms.length - MAX_ROOMS;
  for (const raw of rawRooms.slice(0, MAX_ROOMS)) {
    const o = raw as Record<string, unknown>;
    const id = asString(o.id) ?? crypto.randomUUID();
    const name = asString(o.name) ?? "Room";
    const ptsRaw = (o.points ?? []) as unknown;
    if (!Array.isArray(ptsRaw)) {
      if (report) report.droppedInvalid.rooms += 1;
      continue;
    }
    const points: FloorPlanPoint[] = [];
    for (const pr of ptsRaw) {
      const p = pr as Record<string, unknown>;
      const x = asNumber(p.x);
      const y = asNumber(p.y);
      if (x == null || y == null) {
        if (report) report.droppedInvalid.roomPoints += 1;
        continue;
      }
      points.push({ x, y });
    }
    if (points.length < 3) {
      if (report) report.droppedInvalid.rooms += 1;
      continue;
    }
    // Cap points to prevent pathological payloads.
    if (report && points.length > MAX_ROOM_POINTS)
      report.truncated.roomPoints += points.length - MAX_ROOM_POINTS;
    rooms.push({
      id,
      name: name.slice(0, 60),
      points: points.slice(0, MAX_ROOM_POINTS),
    });
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

function normalizeMeta(input: unknown): FloorPlanDocV3["meta"] | undefined {
  const o = asRecord(input);
  const createdAt = asString(o.createdAt);
  const updatedAt = asString(o.updatedAt);
  if (!createdAt && !updatedAt) return undefined;
  return {
    createdAt: createdAt ? createdAt.slice(0, 60) : undefined,
    updatedAt: updatedAt ? updatedAt.slice(0, 60) : undefined,
  };
}

function normalizeFloorPlanDocV3(input: unknown): FloorPlanDocV3 {
  const core = normalizeFloorPlanCore(input, null);
  const o = asRecord(input);
  const meta = normalizeMeta(o.meta);
  return {
    schema: FLOORPLAN_SCHEMA_ID,
    version: 3,
    gridSize: core.gridSize,
    pxPerMeter: core.pxPerMeter,
    units: core.units,
    snapping: core.snapping ?? { grid: true, wall: true },
    stage: core.stage,
    walls: core.walls,
    openings: core.openings,
    items: core.items,
    rooms: core.rooms,
    ...(meta ? { meta } : {}),
  };
}

export function upgradeFloorPlanDoc(input: unknown): FloorPlanDocV3 {
  // Accept any historical or malformed payload and produce a canonical v3 doc.
  // If the doc is already v3, we still normalize for safety.
  return normalizeFloorPlanDocV3(input);
}

export function upgradeFloorPlanDocWithReport(input: unknown): {
  doc: FloorPlanDocV3;
  report: FloorPlanUpgradeReport;
} {
  const report = createEmptyFloorPlanUpgradeReport();
  const core = normalizeFloorPlanCore(input, report);
  const o = asRecord(input);
  const meta = normalizeMeta(o.meta);
  const doc: FloorPlanDocV3 = {
    schema: FLOORPLAN_SCHEMA_ID,
    version: 3,
    gridSize: core.gridSize,
    pxPerMeter: core.pxPerMeter,
    units: core.units,
    snapping: core.snapping ?? { grid: true, wall: true },
    stage: core.stage,
    walls: core.walls,
    openings: core.openings,
    items: core.items,
    rooms: core.rooms,
    ...(meta ? { meta } : {}),
  };
  return { doc, report };
}

export function sanitizeFloorPlanDocForStorage(
  input: unknown,
  now: Date = new Date()
): FloorPlanDocV3 {
  const doc = upgradeFloorPlanDoc(input);
  const iso = now.toISOString();
  const createdAt = doc.meta?.createdAt ?? iso;
  return {
    ...doc,
    meta: {
      createdAt,
      updatedAt: iso,
    },
  };
}

export function createEmptyFloorPlanDoc(now: Date = new Date()): FloorPlanDocV3 {
  return sanitizeFloorPlanDocForStorage(
    {
      schema: FLOORPLAN_SCHEMA_ID,
      version: CURRENT_FLOORPLAN_VERSION,
      gridSize: 25,
      pxPerMeter: 100,
      units: "m",
      snapping: { grid: true, wall: true },
      stage: { x: 0, y: 0, scale: 1 },
      walls: [],
      openings: [],
      items: [],
      rooms: [],
    },
    now
  );
}

export type FloorPlanDocStats = {
  walls: number;
  openings: number;
  items: number;
  rooms: number;
  totalPoints: number;
  estimatedJsonBytes: number;
};

export function floorPlanDocStats(doc: FloorPlanDocV3): FloorPlanDocStats {
  let totalPoints = 0;
  for (const r of doc.rooms) totalPoints += r.points.length;
  return {
    walls: doc.walls.length,
    openings: doc.openings.length,
    items: doc.items.length,
    rooms: doc.rooms.length,
    totalPoints,
    estimatedJsonBytes: JSON.stringify(doc).length,
  };
}

export type FloorPlanDocIntegrityIssue = {
  code: string;
  message: string;
  severity: "warning" | "error";
};

export function validateFloorPlanDocIntegrity(
  doc: FloorPlanDocV3
): FloorPlanDocIntegrityIssue[] {
  const issues: FloorPlanDocIntegrityIssue[] = [];
  const wallIds = new Set(doc.walls.map((w) => w.id));

  for (const op of doc.openings) {
    if (op.wallId && !wallIds.has(op.wallId)) {
      issues.push({
        code: "OPENING_DANGLING_WALL_REF",
        message: `Opening ${op.id} references non-existent wall ${op.wallId}`,
        severity: "warning",
      });
    }
  }

  const seenIds = new Set<string>();
  for (const w of doc.walls) {
    if (seenIds.has(w.id)) {
      issues.push({ code: "DUPLICATE_ID", message: `Duplicate wall id: ${w.id}`, severity: "error" });
    }
    seenIds.add(w.id);
  }
  for (const op of doc.openings) {
    if (seenIds.has(op.id)) {
      issues.push({ code: "DUPLICATE_ID", message: `Duplicate opening id: ${op.id}`, severity: "error" });
    }
    seenIds.add(op.id);
  }
  for (const it of doc.items) {
    if (seenIds.has(it.id)) {
      issues.push({ code: "DUPLICATE_ID", message: `Duplicate item id: ${it.id}`, severity: "error" });
    }
    seenIds.add(it.id);
  }
  for (const r of doc.rooms) {
    if (seenIds.has(r.id)) {
      issues.push({ code: "DUPLICATE_ID", message: `Duplicate room id: ${r.id}`, severity: "error" });
    }
    seenIds.add(r.id);
  }

  for (const r of doc.rooms) {
    if (r.points.length < 3) {
      issues.push({
        code: "ROOM_TOO_FEW_POINTS",
        message: `Room ${r.id} has fewer than 3 points`,
        severity: "error",
      });
    }
  }

  return issues;
}

export function safeUpgradeFloorPlanDoc(input: unknown): {
  doc: FloorPlanDocV3;
  wasCorrupt: boolean;
} {
  try {
    const doc = upgradeFloorPlanDoc(input);
    return { doc, wasCorrupt: !isFloorPlanDocV3(input) };
  } catch {
    return { doc: createEmptyFloorPlanDoc(), wasCorrupt: true };
  }
}
