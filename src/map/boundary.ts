// Ward boundary editing (docs/ward-map-prd.md, Phase 6, step 1, D7): the only
// area drawn by hand. Corners are dragged, snap to other corners and to
// streets, and are stored as a GeoJSON Polygon in lat/lng (wards.boundary).

import type { WardBoundary } from '@/stores/auth';
import { closestOnSegment, distance, keepIndices, project, unproject, type LatLng, type Point } from './geo';

/** The generated outline is simplified to this tolerance so it has few corners to drag. */
export const OUTLINE_SIMPLIFY_M = 25;

export function toBoundary(ring: Point[], origin: LatLng): WardBoundary {
  const coords = ring.map((p) => {
    const { lat, lng } = unproject(p, origin);
    return [Number(lng.toFixed(6)), Number(lat.toFixed(6))] as [number, number];
  });
  return { type: 'Polygon', coordinates: [[...coords, coords[0]]] };
}

/** The stored boundary's corners as lat/lng (the closing point dropped). */
export function boundaryRing(b: WardBoundary): LatLng[] {
  return b.coordinates[0].slice(0, -1).map(([lng, lat]) => ({ lat, lng }));
}

export function fromBoundary(b: WardBoundary, origin: LatLng): Point[] {
  return b.coordinates[0].slice(0, -1).map(([lng, lat]) => project({ lat, lng }, origin));
}

/** Fewer corners for a closed ring, within `tolerance` meters of the original. */
export function simplifyRing(ring: Point[], tolerance: number): Point[] {
  if (ring.length <= 4) return ring;
  // Start from the corner farthest from the first, so the split isn't arbitrary.
  let far = 0;
  ring.forEach((p, i) => {
    if (distance(p, ring[0]) > distance(ring[far], ring[0])) far = i;
  });
  const a = ring.slice(0, far + 1);
  const b = [...ring.slice(far), ring[0]];
  const ka = keepIndices(a, tolerance);
  const kb = keepIndices(b, tolerance);
  const out = [...a.filter((_, i) => ka[i]), ...b.slice(1, -1).filter((_, i) => kb[i + 1])];
  return out.length >= 3 ? out : ring;
}

/**
 * Where a dragged corner lands: on another corner within `tolerance`, else on
 * the nearest street point within `tolerance`, else where it was dropped.
 */
export function snapCorner(
  p: Point,
  others: Point[],
  streets: Point[][],
  tolerance: number,
): { at: Point; onCorner: number | null } {
  let best: Point | null = null;
  let bestD = tolerance;
  let onCorner: number | null = null;
  others.forEach((c, i) => {
    const d = distance(p, c);
    if (d <= bestD) {
      best = c;
      bestD = d;
      onCorner = i;
    }
  });
  if (best) return { at: best, onCorner };
  for (const line of streets) {
    for (let i = 1; i < line.length; i++) {
      const q = closestOnSegment(p, line[i - 1], line[i]);
      const d = distance(p, q);
      if (d <= bestD) {
        best = q;
        bestD = d;
      }
    }
  }
  return { at: best ?? p, onCorner: null };
}

/** Moves corner `i`; dropping it onto a neighbouring corner removes it (never below 3). */
export function moveCorner(ring: Point[], i: number, at: Point, onCorner: number | null): Point[] {
  const n = ring.length;
  const neighbour = onCorner !== null && (onCorner === (i + 1) % n || onCorner === (i - 1 + n) % n);
  if (neighbour && n > 3) return ring.filter((_, k) => k !== i);
  return ring.map((p, k) => (k === i ? at : p));
}

/** Adds a corner in the middle of the edge from corner `i` to the next. */
export function insertCorner(ring: Point[], i: number): Point[] {
  const a = ring[i];
  const b = ring[(i + 1) % ring.length];
  return [...ring.slice(0, i + 1), { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, ...ring.slice(i + 1)];
}
