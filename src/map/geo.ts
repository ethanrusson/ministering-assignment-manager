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

/** Straight-line distance in meters between two projected points (D10). */
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
 * Bounding box for "fit to ward". Before a ward boundary exists this is the
 * households, leaving out pins far beyond the rest (an outlier would otherwise
 * shrink the whole ward to a dot).
 */
export function wardBounds(points: Point[], minSize = 200): Bounds | null {
  if (!points.length) return null;
  const c = { x: median(points.map((p) => p.x)), y: median(points.map((p) => p.y)) };
  const d = points.map((p) => distance(p, c)).sort((a, b) => a - b);
  const reach = Math.max(minSize, 3 * d[Math.floor((d.length - 1) * 0.9)]);
  const kept = points.filter((p) => distance(p, c) <= reach);
  const xs = kept.map((p) => p.x);
  const ys = kept.map((p) => p.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const w = Math.max(minSize, Math.max(...xs) - x0);
  const h = Math.max(minSize, Math.max(...ys) - y0);
  return { x: (x0 + Math.max(...xs)) / 2 - w / 2, y: (y0 + Math.max(...ys)) / 2 - h / 2, w, h };
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
