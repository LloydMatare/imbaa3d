import * as THREE from "three";
import type {
  FloorPlanDocV3,
  FloorPlanWall,
  FloorPlanOpening,
  FloorPlanRoom,
  FloorPlanItem,
  FloorPlanItemType,
} from "./types";
import { detectWallLoops } from "./room-detection";

// ─── Constants ─────────────────────────────────────────────────────

const WALL_HEIGHT = 2.8; // meters
const WALL_THICKNESS_SCALE = 0.01; // pixels → meters (rough)
const DEFAULT_WALL_COLOR = 0xf5f5f5;
const DEFAULT_FLOOR_COLOR = 0xc8a87e;
const DOOR_HEIGHT = 2.1;
const WINDOW_SILL = 0.9;
const WINDOW_HEIGHT = 1.2;

// ─── Types ─────────────────────────────────────────────────────────

export type GenerationSettings = {
  wallHeight?: number;
  wallColor?: number;
  floorColor?: number;
  ceilingColor?: number;
  includeCeiling?: boolean;
};

export type SceneGeometry = {
  walls: THREE.Group[];
  floors: THREE.Mesh[];
  ceilings: THREE.Mesh[];
  openings: THREE.Group[];
  furniture: THREE.Group[];
};

export type ConversionResult = {
  scene: THREE.Group;
  geometry: SceneGeometry;
  boundingBox: THREE.Box3;
};

// ─── Helpers ───────────────────────────────────────────────────────

function pxToMeters(px: number, pxPerMeter: number): number {
  return px / pxPerMeter;
}

function wallLength(wall: FloorPlanWall): number {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  return Math.sqrt(dx * dx + dy * dy);
}

function wallAngle(wall: FloorPlanWall): number {
  return Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1);
}

function wallCenter(wall: FloorPlanWall): { cx: number; cy: number } {
  return {
    cx: (wall.x1 + wall.x2) / 2,
    cy: (wall.y1 + wall.y2) / 2,
  };
}

// ─── Wall Geometry ─────────────────────────────────────────────────

function createWallMesh(
  wall: FloorPlanWall,
  pxPerMeter: number,
  allWalls: FloorPlanWall[],
  openings: FloorPlanOpening[],
  wallHeight: number,
  wallColor: number
): THREE.Group {
  const lengthM = pxToMeters(wallLength(wall), pxPerMeter);
  const thicknessM = Math.max(
    0.08,
    pxToMeters(wall.thickness, pxPerMeter) * WALL_THICKNESS_SCALE
  );
  const { cx, cy } = wallCenter(wall);
  const angle = wallAngle(wall);

  const group = new THREE.Group();

  const wallMat = new THREE.MeshStandardMaterial({
    color: wallColor,
    roughness: 0.8,
    metalness: 0.05,
  });

  // In 2D the walls are rendered as stroked lines with round caps, which visually "hides"
  // tiny gaps at joints. In 3D, BoxGeometry has flat ends, so we extend walls slightly
  // when they connect to other walls to close those gaps.
  const endpointConnected = (x: number, y: number) => {
    for (const other of allWalls) {
      if (other.id === wall.id) continue;
      const d1 = Math.hypot(other.x1 - x, other.y1 - y);
      if (d1 <= 0.5) return true;
      const d2 = Math.hypot(other.x2 - x, other.y2 - y);
      if (d2 <= 0.5) return true;
    }
    return false;
  };
  const extendStart = endpointConnected(wall.x1, wall.y1);
  const extendEnd = endpointConnected(wall.x2, wall.y2);
  const extStartM = extendStart ? thicknessM / 2 : 0;
  const extEndM = extendEnd ? thicknessM / 2 : 0;
  const meshShiftX = (extEndM - extStartM) / 2;
  const rangeStart = -lengthM / 2 - extStartM;
  const rangeEnd = lengthM / 2 + extEndM;

  // Find openings attached to this wall, sorted by position along wall
  const wallOpenings = openings
    .filter((op) => op.wallId === wall.id)
    .map((op) => {
      const t = op.wallT ?? 0.5;
      const opHalfW = pxToMeters(op.w, pxPerMeter) / 2;
      return { op, t, opHalfW };
    })
    .sort((a, b) => a.t - b.t);

  // Build wall segments that avoid openings
  // For each opening we need:
  //   - Doors: gap from y=0 to DOOR_HEIGHT
  //   - Windows: gap from y=WINDOW_SILL to WINDOW_SILL+WINDOW_HEIGHT
  // We split the wall into boxes in 3 regions: below openings, around openings, above openings

  if (wallOpenings.length === 0) {
    // Simple wall — single box
    const geo = new THREE.BoxGeometry(rangeEnd - rangeStart, wallHeight, thicknessM);
    const mesh = new THREE.Mesh(geo, wallMat);
    mesh.position.x = meshShiftX;
    // BoxGeometry is centered, but our world "ground" is y=0. Lift the wall so it sits on the floor.
    mesh.position.y = wallHeight / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  } else {
    // Wall with openings — build segments around them
    // Work in "along wall" coordinates: -halfLen to +halfLen
    const halfLen = lengthM / 2;

    // Build gap intervals per vertical region
    type Interval = { start: number; end: number };
    const doorGaps: Interval[] = [];
    const windowGaps: Interval[] = [];

    for (const { op, t, opHalfW } of wallOpenings) {
      // `t` is defined over the original segment, so the opening center stays relative to the
      // original endpoints. The wall may be slightly extended (rangeStart/rangeEnd) to close joints.
      const center = -halfLen + t * lengthM;
      const gap: Interval = {
        start: Math.max(rangeStart, center - opHalfW),
        end: Math.min(rangeEnd, center + opHalfW),
      };
      if (gap.end > gap.start) {
        if (op.kind === "door") {
          doorGaps.push(gap);
        } else {
          windowGaps.push(gap);
        }
      }
    }

    // Merge overlapping gaps
    const mergeGaps = (gaps: Interval[]): Interval[] => {
      if (gaps.length <= 1) return gaps;
      const sorted = [...gaps].sort((a, b) => a.start - b.start);
      const merged: Interval[] = [sorted[0]!];
      for (let i = 1; i < sorted.length; i++) {
        const last = merged[merged.length - 1]!;
        const cur = sorted[i]!;
        if (cur.start <= last.end) {
          last.end = Math.max(last.end, cur.end);
        } else {
          merged.push({ ...cur });
        }
      }
      return merged;
    }

    const allGaps = mergeGaps(
      [...doorGaps, ...windowGaps].sort((a, b) => a.start - b.start)
    );

    // Build wall boxes in the "full height" region (between door gaps only)
    // Actually, let's use a simpler approach: for each segment between gaps,
    // create boxes for each vertical band

    // Vertical bands:
    // Band 1: floor to window sill (0 to WINDOW_SILL) — always solid where no door
    // Band 2: window sill to window top (WINDOW_SILL to WINDOW_SILL + WINDOW_HEIGHT) — solid where no window or door
    // Band 3: window top to ceiling (WINDOW_SILL + WINDOW_HEIGHT to wallHeight) — always solid

    const wsBottom = WINDOW_SILL;
    const wsTop = WINDOW_SILL + WINDOW_HEIGHT;

    // Helper: create boxes for solid intervals between gaps, at given y position and height
    const addSolidBoxes = (
      gaps: Interval[],
      yCenter: number,
      boxHeight: number
    ) => {
      let prev = rangeStart;
      for (const gap of gaps) {
        if (gap.start > prev) {
          const segLen = gap.start - prev;
          const geo = new THREE.BoxGeometry(segLen, boxHeight, thicknessM);
          const mesh = new THREE.Mesh(geo, wallMat);
          mesh.position.set(prev + segLen / 2 + meshShiftX, yCenter, 0);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          group.add(mesh);
        }
        prev = gap.end;
      }
      if (prev < rangeEnd) {
        const segLen = rangeEnd - prev;
        const geo = new THREE.BoxGeometry(segLen, boxHeight, thicknessM);
        const mesh = new THREE.Mesh(geo, wallMat);
        mesh.position.set(prev + segLen / 2 + meshShiftX, yCenter, 0);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      }
    }

    // Band 3: above window sill + window height — always solid (no gaps)
    const band3Height = wallHeight - wsTop;
    if (band3Height > 0.01) {
      addSolidBoxes([], wsTop + band3Height / 2, band3Height);
    }

    // Band 2: window region — gaps for both doors AND windows
    const band2Height = wsTop - wsBottom;
    if (band2Height > 0.01) {
      addSolidBoxes(allGaps, wsBottom + band2Height / 2, band2Height);
    }

    // Band 1: below window sill — gaps only for doors
    const band1Height = wsBottom;
    if (band1Height > 0.01) {
      const doorOnlyGaps = mergeGaps(doorGaps);
      addSolidBoxes(doorOnlyGaps, band1Height / 2, band1Height);
    }
  }

  // Position and rotate the group
  const cxM = pxToMeters(cx, pxPerMeter);
  const cyM = pxToMeters(cy, pxPerMeter);
  group.position.set(cxM, 0, -cyM);
  group.rotation.y = -angle;

  return group;
}

// ─── Door/Window Frames ────────────────────────────────────────────

function createDoorMesh(
  opening: FloorPlanOpening,
  wall: FloorPlanWall,
  pxPerMeter: number
): THREE.Group {
  const group = new THREE.Group();
  const w = pxToMeters(opening.w, pxPerMeter);
  const thickness = Math.max(
    0.08,
    pxToMeters(wall.thickness, pxPerMeter) * WALL_THICKNESS_SCALE
  );

  // Door panel
  const doorGeo = new THREE.BoxGeometry(w, DOOR_HEIGHT, thickness * 0.6);
  const doorMat = new THREE.MeshStandardMaterial({
    color: 0x8b6914,
    roughness: 0.6,
    metalness: 0.1,
  });
  const doorMesh = new THREE.Mesh(doorGeo, doorMat);
  doorMesh.position.y = DOOR_HEIGHT / 2;
  doorMesh.castShadow = true;
  group.add(doorMesh);

  // Position the door
  const t = opening.wallT ?? 0.5;
  const wallAngleRad = wallAngle(wall);
  const alongX = wall.x1 + (wall.x2 - wall.x1) * t;
  const alongY = wall.y1 + (wall.y2 - wall.y1) * t;

  group.position.set(
    pxToMeters(alongX, pxPerMeter),
    0,
    -pxToMeters(alongY, pxPerMeter)
  );
  group.rotation.y = -wallAngleRad;

  return group;
}

function createWindowMesh(
  opening: FloorPlanOpening,
  wall: FloorPlanWall,
  pxPerMeter: number
): THREE.Group {
  const group = new THREE.Group();
  const w = pxToMeters(opening.w, pxPerMeter);
  const thickness = Math.max(
    0.08,
    pxToMeters(wall.thickness, pxPerMeter) * WALL_THICKNESS_SCALE
  );

  // Glass pane
  const glassGeo = new THREE.BoxGeometry(w, WINDOW_HEIGHT, thickness * 0.3);
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x87ceeb,
    transparent: true,
    opacity: 0.4,
    roughness: 0.1,
    metalness: 0.3,
  });
  const glassMesh = new THREE.Mesh(glassGeo, glassMat);
  glassMesh.position.y = WINDOW_SILL + WINDOW_HEIGHT / 2;
  group.add(glassMesh);

  // Frame
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x666666,
    roughness: 0.7,
    metalness: 0.2,
  });
  const frameThickness = 0.04;

  // Top frame
  const topGeo = new THREE.BoxGeometry(w + frameThickness, frameThickness, thickness);
  const topMesh = new THREE.Mesh(topGeo, frameMat);
  topMesh.position.y = WINDOW_SILL + WINDOW_HEIGHT;
  group.add(topMesh);

  // Bottom frame
  const bottomMesh = new THREE.Mesh(topGeo.clone(), frameMat);
  bottomMesh.position.y = WINDOW_SILL;
  group.add(bottomMesh);

  // Position the window
  const t = opening.wallT ?? 0.5;
  const alongX = wall.x1 + (wall.x2 - wall.x1) * t;
  const alongY = wall.y1 + (wall.y2 - wall.y1) * t;

  group.position.set(
    pxToMeters(alongX, pxPerMeter),
    0,
    -pxToMeters(alongY, pxPerMeter)
  );
  group.rotation.y = -wallAngle(wall);

  return group;
}

// ─── Floor Geometry ────────────────────────────────────────────────

function createFloorMesh(
  room: FloorPlanRoom,
  pxPerMeter: number
): THREE.Mesh | null {
  if (room.points.length < 3) return null;

  const shape = new THREE.Shape();
  const first = room.points[0]!;
  shape.moveTo(
    pxToMeters(first.x, pxPerMeter),
    pxToMeters(first.y, pxPerMeter)
  );

  for (let i = 1; i < room.points.length; i++) {
    const p = room.points[i]!;
    shape.lineTo(
      pxToMeters(p.x, pxPerMeter),
      pxToMeters(p.y, pxPerMeter)
    );
  }
  shape.closePath();

  const geometry = new THREE.ShapeGeometry(shape);
  const material = new THREE.MeshStandardMaterial({
    color: DEFAULT_FLOOR_COLOR,
    roughness: 0.7,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.01; // slightly above ground to avoid z-fighting
  mesh.receiveShadow = true;
  mesh.userData.isFloor = true;

  return mesh;
}

function getWallsBoundingBox(walls: FloorPlanWall[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (walls.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const wall of walls) {
    minX = Math.min(minX, wall.x1, wall.x2);
    minY = Math.min(minY, wall.y1, wall.y2);
    maxX = Math.max(maxX, wall.x1, wall.x2);
    maxY = Math.max(maxY, wall.y1, wall.y2);
  }
  return { minX, minY, maxX, maxY };
}

function createCeilingMesh(
  room: FloorPlanRoom,
  pxPerMeter: number,
  wallHeight: number,
  ceilingColor: number
): THREE.Mesh | null {
  if (room.points.length < 3) return null;

  const shape = new THREE.Shape();
  const first = room.points[0]!;
  shape.moveTo(
    pxToMeters(first.x, pxPerMeter),
    pxToMeters(first.y, pxPerMeter)
  );

  for (let i = 1; i < room.points.length; i++) {
    const p = room.points[i]!;
    shape.lineTo(
      pxToMeters(p.x, pxPerMeter),
      pxToMeters(p.y, pxPerMeter)
    );
  }
  shape.closePath();

  const geometry = new THREE.ShapeGeometry(shape);
  const material = new THREE.MeshStandardMaterial({
    color: ceilingColor,
    roughness: 0.9,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "ceiling";
  // Keep ceiling in the same X/Z = -Y coordinate space as walls/floor; DoubleSide material handles facing.
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = wallHeight;
  mesh.receiveShadow = true;

  return mesh;
}

// ─── Furniture Geometry ────────────────────────────────────────────

type FurnitureDef = {
  height: number;
  color: number;
  roughness: number;
};

const FURNITURE_DEFS: Record<FloorPlanItemType, FurnitureDef> = {
  sofa: { height: 0.7, color: 0x6b8e6b, roughness: 0.8 },
  bed: { height: 0.5, color: 0x8b7355, roughness: 0.9 },
  table: { height: 0.75, color: 0x8b6914, roughness: 0.6 },
  chair: { height: 0.8, color: 0x8b6914, roughness: 0.6 },
  desk: { height: 0.75, color: 0x8b6914, roughness: 0.6 },
  toilet: { height: 0.45, color: 0xf0f0f0, roughness: 0.3 },
  sink: { height: 0.85, color: 0xf0f0f0, roughness: 0.3 },
  bathtub: { height: 0.6, color: 0xf0f0f0, roughness: 0.3 },
  stove: { height: 0.9, color: 0x333333, roughness: 0.4 },
  fridge: { height: 1.8, color: 0xcccccc, roughness: 0.3 },
  wardrobe: { height: 2.0, color: 0x8b6914, roughness: 0.7 },
  bookshelf: { height: 1.8, color: 0x8b6914, roughness: 0.7 },
  lamp: { height: 1.5, color: 0xffd700, roughness: 0.5 },
  tv: { height: 0.6, color: 0x222222, roughness: 0.2 },
  mirror: { height: 1.0, color: 0xaaccee, roughness: 0.1 },
  dishwasher: { height: 0.85, color: 0xcccccc, roughness: 0.3 },
  washer: { height: 0.85, color: 0xf0f0f0, roughness: 0.3 },
  car: { height: 1.5, color: 0xf87171, roughness: 0.4 },
  flowerpot: { height: 0.4, color: 0x22c55e, roughness: 0.8 },
  cabinet: { height: 0.8, color: 0x8b6914, roughness: 0.6 },
  shelf: { height: 0.3, color: 0x8b6914, roughness: 0.7 },
  plant: { height: 1.0, color: 0x22c55e, roughness: 0.8 },
  generic: { height: 0.5, color: 0x888888, roughness: 0.5 },
};

function createFurnitureMesh(
  item: FloorPlanItem,
  pxPerMeter: number
): THREE.Group {
  const group = new THREE.Group();
  const def = FURNITURE_DEFS[item.type] ?? FURNITURE_DEFS.generic;

  const w = pxToMeters(item.w, pxPerMeter);
  const h = pxToMeters(item.h, pxPerMeter);

  const geometry = new THREE.BoxGeometry(w, def.height, h);
  const material = new THREE.MeshStandardMaterial({
    color: def.color,
    roughness: def.roughness,
    metalness: 0.1,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = def.height / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  // Position and rotate
  const cx = pxToMeters(item.x + item.w / 2, pxPerMeter);
  const cy = pxToMeters(item.y + item.h / 2, pxPerMeter);
  group.position.set(cx, 0, -cy);
  group.rotation.y = -(item.rotation * Math.PI) / 180;

  return group;
}

// ─── Main Conversion ───────────────────────────────────────────────

export function convertFloorPlanTo3D(
  doc: FloorPlanDocV3,
  settings?: GenerationSettings
): ConversionResult {
  const wallHeight = settings?.wallHeight ?? WALL_HEIGHT;
  const wallColor = settings?.wallColor ?? DEFAULT_WALL_COLOR;
  const floorColor = settings?.floorColor ?? DEFAULT_FLOOR_COLOR;
  const ceilingColor = settings?.ceilingColor ?? 0xfafafa;
  const includeCeiling = settings?.includeCeiling ?? true;

  const group = new THREE.Group();
  const walls: THREE.Group[] = [];
  const floors: THREE.Mesh[] = [];
  const ceilings: THREE.Mesh[] = [];
  const openingMeshes: THREE.Group[] = [];
  const furnitureGroups: THREE.Group[] = [];
  const pxPerMeter = doc.pxPerMeter;

  // Build wall meshes
  for (const wall of doc.walls) {
    const meshGroup = createWallMesh(
      wall,
      pxPerMeter,
      doc.walls,
      doc.openings,
      wallHeight,
      wallColor
    );
    walls.push(meshGroup);
    group.add(meshGroup);
  }

  // Build floor meshes for rooms
  if (doc.rooms.length > 0) {
    for (const room of doc.rooms) {
      const mesh = createFloorMesh(room, pxPerMeter);
      if (mesh) {
        if (floorColor !== DEFAULT_FLOOR_COLOR) {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          mat.color.setHex(floorColor);
        }
        floors.push(mesh);
        group.add(mesh);
      }
    }
  } else {
    // No rooms detected, create a floor following the outer wall shape
    const loops = detectWallLoops(doc.walls);
    if (loops.length > 0) {
      // Use the largest loop as the outer shape
      const outerLoop = loops.reduce((largest, current) =>
        current.length > largest.length ? current : largest
      );
      if (outerLoop.length >= 3) {
        const shape = new THREE.Shape();
        const first = outerLoop[0]!;
        shape.moveTo(
          pxToMeters(first.x, pxPerMeter),
          pxToMeters(first.y, pxPerMeter)
        );
        for (let i = 1; i < outerLoop.length; i++) {
          const p = outerLoop[i]!;
          shape.lineTo(
            pxToMeters(p.x, pxPerMeter),
            pxToMeters(p.y, pxPerMeter)
          );
        }
        shape.closePath();

        const geometry = new THREE.ShapeGeometry(shape);
        const material = new THREE.MeshStandardMaterial({
          color: floorColor,
          roughness: 0.8,
          metalness: 0.0,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.receiveShadow = true;
        mesh.userData.isFloor = true;
        floors.push(mesh);
        group.add(mesh);
      }
    } else {
      // Fallback to bounding box if no loops
      const bbox = getWallsBoundingBox(doc.walls);
      if (bbox) {
        const width = bbox.maxX - bbox.minX;
        const height = bbox.maxY - bbox.minY;
        if (width > 0 && height > 0) {
          const geometry = new THREE.PlaneGeometry(
            pxToMeters(width, pxPerMeter),
            pxToMeters(height, pxPerMeter)
          );
          const material = new THREE.MeshStandardMaterial({
            color: floorColor,
            roughness: 0.8,
            metalness: 0.0,
          });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.rotation.x = -Math.PI / 2;
          mesh.position.set(
            pxToMeters(bbox.minX + width / 2, pxPerMeter),
            0,
            -pxToMeters(bbox.minY + height / 2, pxPerMeter)
          );
          mesh.receiveShadow = true;
          mesh.userData.isFloor = true;
          floors.push(mesh);
          group.add(mesh);
        }
      }
    }
  }

  // Build ceiling meshes for rooms
  if (includeCeiling) {
    if (doc.rooms.length > 0) {
      for (const room of doc.rooms) {
        const mesh = createCeilingMesh(room, pxPerMeter, wallHeight, ceilingColor);
        if (mesh) {
          ceilings.push(mesh);
          group.add(mesh);
        }
      }
    } else {
      // No rooms detected, create a ceiling following the outer wall shape
      const loops = detectWallLoops(doc.walls);
      if (loops.length > 0) {
        // Use the largest loop as the outer shape
        const outerLoop = loops.reduce((largest, current) =>
          current.length > largest.length ? current : largest
        );
        if (outerLoop.length >= 3) {
          const shape = new THREE.Shape();
          const first = outerLoop[0]!;
          shape.moveTo(
            pxToMeters(first.x, pxPerMeter),
            pxToMeters(first.y, pxPerMeter)
          );
          for (let i = 1; i < outerLoop.length; i++) {
            const p = outerLoop[i]!;
            shape.lineTo(
              pxToMeters(p.x, pxPerMeter),
              pxToMeters(p.y, pxPerMeter)
            );
          }
          shape.closePath();

          const geometry = new THREE.ShapeGeometry(shape);
          const material = new THREE.MeshStandardMaterial({
            color: ceilingColor,
            roughness: 0.9,
            metalness: 0.0,
            side: THREE.DoubleSide,
          });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.name = "ceiling";
          mesh.rotation.x = -Math.PI / 2;
          mesh.position.y = wallHeight;
          mesh.receiveShadow = true;
          ceilings.push(mesh);
          group.add(mesh);
        }
      } else {
        // Fallback to bounding box if no loops
        const bbox = getWallsBoundingBox(doc.walls);
        if (bbox) {
          const width = bbox.maxX - bbox.minX;
          const height = bbox.maxY - bbox.minY;
          if (width > 0 && height > 0) {
            const geometry = new THREE.PlaneGeometry(
              pxToMeters(width, pxPerMeter),
              pxToMeters(height, pxPerMeter)
            );
            const material = new THREE.MeshStandardMaterial({
              color: ceilingColor,
              roughness: 0.9,
              metalness: 0.0,
              side: THREE.DoubleSide,
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = "ceiling";
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.y = wallHeight;
            mesh.receiveShadow = true;
            ceilings.push(mesh);
            group.add(mesh);
          }
        }
      }
    }
  }

  // Build door/window meshes for ALL openings
  // Wall-attached openings use wall geometry for positioning
  // Unattached openings use their own x/y with a synthetic wall
  const wallById = new Map(doc.walls.map((w) => [w.id, w]));

  for (const op of doc.openings) {
    let meshGroup: THREE.Group;
    if (op.wallId) {
      const wall = wallById.get(op.wallId);
      if (!wall) continue;
      if (op.kind === "door") {
        meshGroup = createDoorMesh(op, wall, pxPerMeter);
      } else {
        meshGroup = createWindowMesh(op, wall, pxPerMeter);
      }
    } else {
      // Unattached opening — create synthetic wall for positioning
      const synthWall: FloorPlanWall = {
        id: op.id,
        x1: op.x - op.w / 2,
        y1: op.y,
        x2: op.x + op.w / 2,
        y2: op.y,
        thickness: 6,
      };
      if (op.kind === "door") {
        meshGroup = createDoorMesh(op, synthWall, pxPerMeter);
      } else {
        meshGroup = createWindowMesh(op, synthWall, pxPerMeter);
      }
    }
    openingMeshes.push(meshGroup);
    group.add(meshGroup);
  }

  // Build furniture meshes
  for (const item of doc.items) {
    const mesh = createFurnitureMesh(item, pxPerMeter);
    furnitureGroups.push(mesh);
    group.add(mesh);
  }

  // Compute bounding box
  const boundingBox = new THREE.Box3().setFromObject(group);

  return {
    scene: group,
    geometry: { walls, floors, ceilings, openings: openingMeshes, furniture: furnitureGroups },
    boundingBox,
  };
}

// ─── GLB Export ────────────────────────────────────────────────────

export async function exportToGLB(scene: THREE.Group): Promise<ArrayBuffer> {
  // three/examples exporters assume browser globals (FileReader) even when running with Node's Blob.
  // In Next.js Route Handlers we run in Node (`export const runtime = "nodejs"`), so polyfill as needed.
  type FileReaderLike = {
    result: string | ArrayBuffer | null;
    onloadend: null | (() => void);
    onerror: null | ((err: unknown) => void);
    readAsArrayBuffer: (blob: Blob) => void;
    readAsDataURL: (blob: Blob) => void;
  };
  type FileReaderCtor = new () => FileReaderLike;
  const g = globalThis as unknown as { FileReader?: FileReaderCtor };

  if (typeof g.FileReader === "undefined") {
    class NodeFileReader {
      public result: string | ArrayBuffer | null = null;
      public onloadend: null | (() => void) = null;
      public onerror: null | ((err: unknown) => void) = null;

      readAsArrayBuffer(blob: Blob) {
        blob
          .arrayBuffer()
          .then((buf) => {
            this.result = buf;
            this.onloadend?.();
          })
          .catch((err) => {
            this.onerror?.(err);
            this.onloadend?.();
          });
      }

      readAsDataURL(blob: Blob) {
        blob
          .arrayBuffer()
          .then((buf) => {
            const b64 = Buffer.from(buf).toString("base64");
            // GLTFExporter only uses this for embedding buffers (non-binary mode).
            this.result = `data:application/octet-stream;base64,${b64}`;
            this.onloadend?.();
          })
          .catch((err) => {
            this.onerror?.(err);
            this.onloadend?.();
          });
      }
    }

    g.FileReader = NodeFileReader as unknown as FileReaderCtor;
  }

  const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
  const exporter = new GLTFExporter();

  return new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(result);
        } else {
          const json = JSON.stringify(result);
          const buffer = new TextEncoder().encode(json).buffer;
          resolve(buffer);
        }
      },
      (error) => reject(error),
      { binary: true }
    );
  });
}

export async function exportToOBJ(scene: THREE.Object3D): Promise<ArrayBuffer> {
  const { OBJExporter } = await import("three/examples/jsm/exporters/OBJExporter.js");
  const exporter = new OBJExporter();

  const result = exporter.parse(scene);
  return new TextEncoder().encode(result).buffer;
}

export async function exportToSTL(scene: THREE.Object3D): Promise<ArrayBuffer> {
  const { STLExporter } = await import("three/examples/jsm/exporters/STLExporter.js");
  const exporter = new STLExporter();

  const result = exporter.parse(scene);
  return new TextEncoder().encode(result).buffer;
}


