import type { FloorPlanWall } from "./types";

type Pt = { x: number; y: number };

function ptKey(p: Pt, precision = 2): string {
  return `${p.x.toFixed(precision)},${p.y.toFixed(precision)}`;
}

function angle(a: Pt, b: Pt): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

/**
 * Detect closed wall loops (faces) from a set of walls.
 * Returns an array of polygon point arrays, each representing a potential room.
 *
 * Uses left-face traversal: at each vertex, walk along an edge then rotate
 * counterclockwise to find the next edge, tracing bounded faces.
 */
export function detectWallLoops(walls: FloorPlanWall[]): Pt[][] {
  if (walls.length < 3) return [];

  // Build vertex and edge maps
  const vertexMap = new Map<string, Pt>(); // key -> point
  const adjacency = new Map<string, { to: string; wallIdx: number }[]>();

  for (let i = 0; i < walls.length; i++) {
    const w = walls[i]!;
    const k1 = ptKey({ x: w.x1, y: w.y1 });
    const k2 = ptKey({ x: w.x2, y: w.y2 });

    if (k1 === k2) continue; // degenerate wall

    if (!vertexMap.has(k1)) vertexMap.set(k1, { x: w.x1, y: w.y1 });
    if (!vertexMap.has(k2)) vertexMap.set(k2, { x: w.x2, y: w.y2 });

    if (!adjacency.has(k1)) adjacency.set(k1, []);
    if (!adjacency.has(k2)) adjacency.set(k2, []);
    adjacency.get(k1)!.push({ to: k2, wallIdx: i });
    adjacency.get(k2)!.push({ to: k1, wallIdx: i });
  }

  // Sort adjacency lists by angle for each vertex
  for (const [key, neighbors] of adjacency) {
    const v = vertexMap.get(key)!;
    neighbors.sort((a, b) => {
      const angleA = angle(v, vertexMap.get(a.to)!);
      const angleB = angle(v, vertexMap.get(b.to)!);
      return angleA - angleB;
    });
  }

  // Track visited directed edges: "fromKey->toKey"
  const visited = new Set<string>();
  const loops: Pt[][] = [];

  for (const [startKey, neighbors] of adjacency) {
    for (const neighbor of neighbors) {
      const edgeKey = `${startKey}->${neighbor.to}`;
      if (visited.has(edgeKey)) continue;

      // Trace a face using left-turn traversal
      const face: string[] = [startKey];
      let current = neighbor.to;
      let prev = startKey;

      visited.add(edgeKey);

      let maxSteps = walls.length * 2; // prevent infinite loops
      while (current !== startKey && maxSteps-- > 0) {
        face.push(current);
        const currentNeighbors = adjacency.get(current);
        if (!currentNeighbors || currentNeighbors.length < 2) break;

        // Find the index of prev in current's adjacency list
        const prevIdx = currentNeighbors.findIndex((n) => n.to === prev);
        if (prevIdx === -1) break;

        // Rotate counterclockwise: pick the next neighbor (wrapping around)
        const nextIdx = (prevIdx + 1) % currentNeighbors.length;
        const next = currentNeighbors[nextIdx]!;

        const nextEdgeKey = `${current}->${next.to}`;
        if (visited.has(nextEdgeKey)) break;
        visited.add(nextEdgeKey);

        prev = current;
        current = next.to;
      }

      if (current === startKey && face.length >= 3) {
        const pts = face.map((k) => vertexMap.get(k)!).filter(Boolean);
        if (pts.length >= 3) {
          // Check if the polygon has a reasonable area (not degenerate)
          const area = Math.abs(polygonSignedArea(pts));
          if (area > 1) {
            loops.push(pts);
          }
        }
      }
    }
  }

  return loops;
}

function polygonSignedArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/**
 * Filter detected loops to only include interior rooms (positive area in screen coords).
 * In screen coordinates, positive area = interior face (y-axis points down).
 */
export function filterInteriorRooms(loops: Pt[][]): Pt[][] {
  return loops.filter((pts) => polygonSignedArea(pts) < 0);
}

/**
 * Check if a room with the given points already exists in the list.
 */
export function roomExists(
  existingRooms: { points: Pt[] }[],
  newPoints: Pt[],
  tolerance = 5
): boolean {
  for (const room of existingRooms) {
    if (room.points.length !== newPoints.length) continue;
    // Check if all points match within tolerance (in any rotation)
    const n = newPoints.length;
    for (let offset = 0; offset < n; offset++) {
      let allMatch = true;
      for (let i = 0; i < n; i++) {
        const np = newPoints[i]!;
        const rp = room.points[(i + offset) % n]!;
        if (Math.hypot(np.x - rp.x, np.y - rp.y) > tolerance) {
          allMatch = false;
          break;
        }
      }
      if (allMatch) return true;
    }
  }
  return false;
}
