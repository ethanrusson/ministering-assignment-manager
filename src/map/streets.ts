// OpenStreetMap street import (docs/ward-map-prd.md, Phase 5, D12).
// The only request sent out is the Overpass query below, which carries the
// map's bounding box and nothing else.

import type { StreetKind } from '@/types/database';
import { keepIndices, project, type BBox, type LatLng, type Point } from './geo';

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

const KIND_BY_HIGHWAY: Record<string, StreetKind> = {
  primary: 'main',
  primary_link: 'main',
  secondary: 'main',
  secondary_link: 'main',
  tertiary: 'main',
  tertiary_link: 'main',
  residential: 'residential',
  unclassified: 'residential',
  living_street: 'residential',
  service: 'lane',
};

/** Service roads that aren't streets anyone would navigate by. */
const SKIPPED_SERVICE = new Set(['parking_aisle', 'drive-through']);

/** How far a simplified line may stray from the original, in meters. */
const SIMPLIFY_TOLERANCE_M = 2;

export function overpassQuery(b: BBox): string {
  const box = [b.south, b.west, b.north, b.east].map((n) => n.toFixed(6)).join(',');
  const highways = Object.keys(KIND_BY_HIGHWAY).join('|');
  return `[out:json][timeout:30];way["highway"~"^(${highways})$"](${box});out tags geom;`;
}

export interface ImportedStreet {
  osmId: string;
  name: string;
  kind: StreetKind;
  /** GeoJSON LineString, [lng, lat] pairs. */
  geometry: { type: 'LineString'; coordinates: [number, number][] };
}

interface OverpassWay {
  type?: string;
  id?: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
}

export function parseOverpass(json: unknown): ImportedStreet[] {
  const elements = (json as { elements?: OverpassWay[] })?.elements;
  if (!Array.isArray(elements)) throw new Error('OpenStreetMap sent an unexpected response.');
  const out: ImportedStreet[] = [];
  for (const el of elements) {
    if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) continue;
    const tags = el.tags ?? {};
    const kind = KIND_BY_HIGHWAY[tags.highway ?? ''];
    if (!kind || (kind === 'lane' && SKIPPED_SERVICE.has(tags.service ?? ''))) continue;
    const pts = el.geometry.map((g) => ({ lat: g.lat, lng: g.lon }));
    out.push({
      osmId: String(el.id),
      name: tags.name ?? '',
      kind,
      geometry: {
        type: 'LineString',
        coordinates: simplify(pts, SIMPLIFY_TOLERANCE_M).map((p) => [round(p.lng), round(p.lat)]),
      },
    });
  }
  return out;
}

/** Douglas–Peucker in local meters. Endpoints always survive. */
export function simplify(pts: LatLng[], toleranceM: number): LatLng[] {
  if (pts.length < 3) return pts;
  const keep = keepIndices(pts.map((p) => project(p, pts[0])), toleranceM);
  return pts.filter((_, i) => keep[i]);
}

const round = (n: number) => Number(n.toFixed(6));

export interface StreetLabel {
  name: string;
  x: number;
  y: number;
  /** Degrees, kept between -90 and 90 so text never reads upside down. */
  angle: number;
}

/**
 * One label per street name per stretch of road: at the middle of a way's
 * longest screen segment that fits the text, skipping any spot within
 * `minGap` px of a label already placed for the same name.
 */
export function placeStreetLabels(
  ways: { name: string; pts: Point[] }[],
  textWidth: (name: string) => number,
  minGap = 240,
): StreetLabel[] {
  const placed: StreetLabel[] = [];
  for (const w of ways) {
    if (!w.name) continue;
    let best: { a: Point; b: Point; len: number } | null = null;
    for (let i = 1; i < w.pts.length; i++) {
      const a = w.pts[i - 1];
      const b = w.pts[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (!best || len > best.len) best = { a, b, len };
    }
    if (!best || best.len < textWidth(w.name) + 16) continue;
    const x = (best.a.x + best.b.x) / 2;
    const y = (best.a.y + best.b.y) / 2;
    if (placed.some((l) => l.name === w.name && Math.hypot(l.x - x, l.y - y) < minGap)) continue;
    let angle = (Math.atan2(best.b.y - best.a.y, best.b.x - best.a.x) * 180) / Math.PI;
    if (angle > 90) angle -= 180;
    if (angle <= -90) angle += 180;
    placed.push({ name: w.name, x, y, angle });
  }
  return placed;
}
