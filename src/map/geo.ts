// Map geometry (docs/ward-map-prd.md, "Coordinates and rendering").
// Stored coordinates are lat/lng; the map draws in meters on a flat
// equirectangular projection centered on the ward.

export interface LatLng {
  lat: number;
  lng: number;
}
export interface Point {
  x: number;
  y: number;
}

const M_PER_DEG_LNG_AT_EQUATOR = 111320;
const M_PER_DEG_LAT = 110540;
const M_PER_MILE = 1609.344;

/** Ward center: the median household, so one far-off pin doesn't drag it. */
export function projectionOrigin(points: LatLng[]): LatLng {
  if (!points.length) return { lat: 0, lng: 0 };
  return { lat: median(points.map((p) => p.lat)), lng: median(points.map((p) => p.lng)) };
}

/** Meters east (x) and south (y) of the origin. */
export function project(p: LatLng, origin: LatLng): Point {
  return {
    x: (p.lng - origin.lng) * Math.cos((origin.lat * Math.PI) / 180) * M_PER_DEG_LNG_AT_EQUATOR,
    y: -(p.lat - origin.lat) * M_PER_DEG_LAT,
  };
}

export function unproject(p: Point, origin: LatLng): LatLng {
  return {
    lat: origin.lat - p.y / M_PER_DEG_LAT,
    lng: origin.lng + p.x / (Math.cos((origin.lat * Math.PI) / 180) * M_PER_DEG_LNG_AT_EQUATOR),
  };
}

/**
 * Douglas–Peucker: which points of a line to keep so it strays from the
 * original by at most `tolerance`. Endpoints always survive.
 */
export function keepIndices(pts: Point[], tolerance: number): boolean[] {
  const keep = new Array<boolean>(pts.length).fill(false);
  if (!pts.length) return keep;
  keep[0] = keep[pts.length - 1] = true;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let worst = -1;
    let worstD = tolerance;
    for (let i = a + 1; i < b; i++) {
      const d = distance(pts[i], closestOnSegment(pts[i], pts[a], pts[b]));
      if (d > worstD) {
        worst = i;
        worstD = d;
      }
    }
    if (worst >= 0) {
      keep[worst] = true;
      stack.push([a, worst], [worst, b]);
    }
  }
  return keep;
}

export function closestOnSegment(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/** Straight-line distance in meters between two projected points (D10). */
/** Ray-casting point-in-polygon for an open ring. */
export function pointInRing(p: Point, r: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i];
    const b = r[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function formatMiles(meters: number): string {
  const mi = meters / M_PER_MILE;
  return mi < 0.1 ? '< 0.1 mi' : `${mi.toFixed(1)} mi`;
}

export interface PointGroup<T> {
  key: string;
  lat: number;
  lng: number;
  items: T[];
}

/** Households at identical coordinates, drawn as one box (D3). */
export function groupByPoint<T extends LatLng>(items: T[]): PointGroup<T>[] {
  const groups = new Map<string, PointGroup<T>>();
  for (const it of items) {
    const key = `${it.lat},${it.lng}`;
    const g = groups.get(key);
    if (g) g.items.push(it);
    else groups.set(key, { key, lat: it.lat, lng: it.lng, items: [it] });
  }
  return [...groups.values()];
}

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A starting ward outline before one is drawn (docs/ward-map-prd.md, Phase 6):
 * the convex hull around the households, `marginM` out, leaving out lone pins.
 */
export function outlineAround(points: Point[], marginM: number): Point[] {
  const grouped = points.filter((p) => points.some((q) => q !== p && distance(p, q) <= ISOLATED_M));
  const pts = (grouped.length ? grouped : points).flatMap((p) =>
    Array.from({ length: 8 }, (_, i) => ({
      x: p.x + marginM * Math.cos((i * Math.PI) / 4),
      y: p.y + marginM * Math.sin((i * Math.PI) / 4),
    })),
  );
  return convexHull(pts);
}

/** Andrew's monotone chain. */
function convexHull(pts: Point[]): Point[] {
  const s = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  if (s.length < 3) return s;
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const p of s) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (const p of [...s].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** A household with no other household this close is left out of "fit to ward". */
const ISOLATED_M = 1000;

/**
 * Bounding box for "fit to ward". Before a ward boundary exists this is the
 * households, leaving out lone pins far from any other (one would otherwise
 * stretch the frame and leave most of the screen empty). A strung-out group of
 * homes stays in, since each has a neighbour nearby.
 */
export function wardBounds(points: Point[], minSize = 200): Bounds | null {
  if (!points.length) return null;
  const grouped = points.filter((p) =>
    points.some((q) => q !== p && distance(p, q) <= ISOLATED_M),
  );
  const kept = grouped.length ? grouped : points;
  const xs = kept.map((p) => p.x);
  const ys = kept.map((p) => p.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const w = Math.max(minSize, Math.max(...xs) - x0);
  const h = Math.max(minSize, Math.max(...ys) - y0);
  return { x: (x0 + Math.max(...xs)) / 2 - w / 2, y: (y0 + Math.max(...ys)) / 2 - h / 2, w, h };
}

export interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** A projected box, grown by `marginM` on every side, as lat/lng bounds. */
export function toBBox(b: Bounds, origin: LatLng, marginM: number): BBox {
  const sw = unproject({ x: b.x - marginM, y: b.y + b.h + marginM }, origin);
  const ne = unproject({ x: b.x + b.w + marginM, y: b.y - marginM }, origin);
  return { south: sw.lat, west: sw.lng, north: ne.lat, east: ne.lng };
}

/** Ground added around the households when downloading map data for them. */
export const MAP_AREA_MARGIN_M = 250;

/** The households' area (outliers left out, see wardBounds) as lat/lng bounds. */
export function householdArea(points: LatLng[], marginM: number): BBox | null {
  const origin = projectionOrigin(points);
  const b = wardBounds(points.map((p) => project(p, origin)));
  return b ? toBBox(b, origin, marginM) : null;
}

const SCALE_STEPS_MI = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 25];

/** The longest round distance whose bar fits in `maxPx` at `pxPerMeter`. */
export function scaleBar(pxPerMeter: number, maxPx = 120): { px: number; label: string } {
  let best = SCALE_STEPS_MI[0];
  for (const mi of SCALE_STEPS_MI) if (mi * M_PER_MILE * pxPerMeter <= maxPx) best = mi;
  return { px: best * M_PER_MILE * pxPerMeter, label: `${best} mi` };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
