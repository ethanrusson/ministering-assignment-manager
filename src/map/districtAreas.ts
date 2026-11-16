// Automatic district areas (docs/ward-map-prd.md, Phase 6, D6). Districts are
// sets of households; their areas are worked out, never drawn by hand:
//
//   1. split the ward into blocks along streets (blocks.ts)
//   2. a block whose households are all in one district goes to that district;
//      an empty block goes to the district of the nearest household
//   3. a block with households from several districts is divided halfway
//      between its households, staying inside the block
//   4. each district's pieces are merged into one area; a district whose area
//      comes out in more than one piece is reported as split
//   5. with no streets, the whole ward is divided halfway between homes
//
// Households at identical points count once. Works in projected meters.

import polygonClipping, { type MultiPolygon, type Polygon } from 'polygon-clipping';
import type { Point } from './geo';
import { interiorPoint, pointInRing, signedArea, splitIntoBlocks, type Ring } from './blocks';

/** District key for households without a district. */
export const NO_DISTRICT = '';

export interface AreaHousehold {
  p: Point;
  /** District id, or NO_DISTRICT. */
  district: string;
}

export interface DistrictArea {
  district: string;
  /** Polygons, each a list of rings (outer first), as [x, y] pairs in meters. */
  shape: MultiPolygon;
  /** True when the area is in more than one piece. */
  split: boolean;
}

export function districtAreas(
  boundary: Ring,
  streets: Point[][],
  households: AreaHousehold[],
): DistrictArea[] {
  const sites = uniqueSites(households.filter((h) => pointInRing(h.p, boundary)));
  if (!sites.length) return [];
  const blocks = streets.length ? splitIntoBlocks(boundary, streets) : [boundary];

  const pieces = new Map<string, Polygon[]>();
  const add = (district: string, ring: Ring) => {
    if (ring.length < 3 || Math.abs(signedArea(ring)) < 0.01) return;
    const list = pieces.get(district) ?? [];
    list.push([closeRing(ring)]);
    pieces.set(district, list);
  };

  for (const block of blocks) {
    const inside = sites.filter((s) => pointInRing(s.p, block));
    const districts = new Set(inside.map((s) => s.district));
    if (!inside.length) {
      add(nearest(interiorPoint(block), sites).district, block);
    } else if (districts.size === 1) {
      add(inside[0].district, block);
    } else {
      for (const s of inside) add(s.district, cellOf(s.p, inside.map((o) => o.p), block));
    }
  }

  return [...pieces].map(([district, polys]) => {
    let shape: MultiPolygon;
    try {
      shape = polygonClipping.union(polys[0], ...polys.slice(1));
    } catch {
      // polygon-clipping can still fail on near-degenerate input; draw the
      // pieces unmerged rather than lose the map.
      shape = polys;
    }
    return { district, shape, split: shape.length > 1 };
  });
}

/** The district whose area contains `p`, if any (a move-in's suggested district). */
export function districtAt(areas: DistrictArea[], p: Point): string | null {
  const inRing = (ring: [number, number][]) => pointInRing(p, ring.slice(0, -1).map(([x, y]) => ({ x, y })));
  const hit = areas.find((a) => a.shape.some(([outer, ...holes]) => inRing(outer) && !holes.some(inRing)));
  return hit?.district ?? null;
}

/** One site per point; a point shared by households in several districts keeps the first. */
function uniqueSites(households: AreaHousehold[]): AreaHousehold[] {
  const seen = new Map<string, AreaHousehold>();
  for (const h of households) {
    const key = `${h.p.x.toFixed(2)},${h.p.y.toFixed(2)}`;
    if (!seen.has(key)) seen.set(key, h);
  }
  return [...seen.values()];
}

function nearest(p: Point, sites: AreaHousehold[]): AreaHousehold {
  let best = sites[0];
  let bestD = Infinity;
  for (const s of sites) {
    const d = Math.hypot(s.p.x - p.x, s.p.y - p.y);
    if (d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

/** The part of `block` closer to `site` than to any other site: clip by each bisector. */
export function cellOf(site: Point, sites: Point[], block: Ring): Ring {
  let poly = block;
  for (const o of sites) {
    if (o === site || (o.x === site.x && o.y === site.y) || poly.length < 3) continue;
    const nx = o.x - site.x;
    const ny = o.y - site.y;
    const mx = (site.x + o.x) / 2;
    const my = (site.y + o.y) / 2;
    const side = (p: Point) => (p.x - mx) * nx + (p.y - my) * ny;
    const out: Ring = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const da = side(a);
      const db = side(b);
      if (da <= 0) out.push(a);
      if ((da <= 0) !== (db <= 0)) {
        const t = da / (da - db);
        out.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
      }
    }
    poly = out;
  }
  return poly;
}

/** Corners rounded to the centimetre: unrounded, polygon-clipping's union can throw on the real ward. */
function closeRing(r: Ring): [number, number][] {
  const cm = (v: number) => Math.round(v * 100) / 100;
  const pts = r.map((p): [number, number] => [cm(p.x), cm(p.y)]);
  pts.push(pts[0]);
  return pts;
}
