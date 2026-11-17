// Districts drawn by hand (docs/ward-map-prd.md, Phase 6). Each district's
// shape is a set of polygons in projected meters. Shapes never overlap: a
// shape drawn or edited for one district is cut out of every other.
//
// Shapes move households only where a shape changed: a household whose
// containing shape is different afterwards joins that district (or none).
// Households tapped into a district against the lines stay put otherwise.

import polygonClipping, { type MultiPolygon } from 'polygon-clipping';
import type { DistrictShapeGeo } from '@/types/database';
import { simplifyRing } from './boundary';
import { pointInRing, project, unproject, type LatLng, type Point } from './geo';

export type Shapes = Map<string, MultiPolygon>;

/** Corners rounded to the centimetre: unrounded, polygon-clipping can throw on real input. */
const cm = (v: number) => Math.round(v * 100) / 100;

/** An open ring (lasso corners) as a shape. */
export function ringShape(ring: Point[]): MultiPolygon {
  const pts = ring.map((p): [number, number] => [cm(p.x), cm(p.y)]);
  return [[[...pts, pts[0]]]];
}

/** Every ring of a shape as open corner lists: [polygon][ring][corner]. */
export function shapeRings(m: MultiPolygon): Point[][][] {
  return m.map((poly) => poly.map((ring) => ring.slice(0, -1).map(([x, y]) => ({ x, y }))));
}

export function fromRings(rings: Point[][][]): MultiPolygon {
  return rings.map((poly) => poly.map((ring) => ringShape(ring)[0][0]));
}

function safe(op: () => MultiPolygon, fallback: MultiPolygon): MultiPolygon {
  try {
    return op();
  } catch {
    return fallback;
  }
}

/** Sets a district's shape (null: no district, which only erases), cutting it out of the others. */
export function setShape(shapes: Shapes, district: string | null, shape: MultiPolygon): Shapes {
  const clean = safe(() => polygonClipping.union(shape), shape);
  const next: Shapes = new Map();
  for (const [d, m] of shapes) {
    if (d === district) continue;
    const cut = safe(() => polygonClipping.difference(m, clean), m);
    if (cut.length) next.set(d, cut);
  }
  if (district && clean.length) next.set(district, clean);
  return next;
}

/** Adds an area to a district's shape (or erases it everywhere, for no district). */
export function paint(shapes: Shapes, district: string | null, area: MultiPolygon): Shapes {
  const own = district ? shapes.get(district) : undefined;
  return setShape(shapes, district, own ? safe(() => polygonClipping.union(own, area), area) : area);
}

/** Fitted shapes drop corners within this many meters of a straight edge, so they're easy to adjust. */
export const FIT_SIMPLIFY_M = 4;
/** Pieces smaller than this, in square meters, left over from fitting are dropped. */
const MIN_PIECE_M2 = 100;

const ringArea = (ring: [number, number][]) =>
  Math.abs(ring.reduce((sum, [x, y], i) => (i ? sum + ring[i - 1][0] * y - x * ring[i - 1][1] : sum), 0)) / 2;

/**
 * Shapes from worked-out district areas (districtAreas.ts, "Redraw lines"):
 * simplified to fewer corners, never overlapping, without slivers.
 */
export function fitShapes(areas: { district: string; shape: MultiPolygon }[], tolerance = FIT_SIMPLIFY_M): Shapes {
  let shapes: Shapes = new Map();
  for (const a of areas) {
    const rings = shapeRings(a.shape).map((poly) => poly.map((ring) => simplifyRing(ring, tolerance)));
    shapes = setShape(shapes, a.district, fromRings(rings));
  }
  const kept: Shapes = new Map();
  for (const [d, m] of shapes) {
    const pieces = m.filter(([outer]) => ringArea(outer) >= MIN_PIECE_M2);
    if (pieces.length) kept.set(d, pieces);
  }
  return kept;
}

/** The district whose shape contains `p`, if any. */
export function districtAt(shapes: Shapes, p: Point): string | null {
  const inRing = (ring: [number, number][]) => pointInRing(p, ring.slice(0, -1).map(([x, y]) => ({ x, y })));
  for (const [d, m] of shapes) {
    if (m.some(([outer, ...holes]) => inRing(outer) && !holes.some(inRing))) return d;
  }
  return null;
}

/** Households whose containing shape changed, with the district they now fall in. */
export function movesBetween(
  households: { id: string; p: Point }[],
  before: Shapes,
  after: Shapes,
): { id: string; district: string | null }[] {
  return households.flatMap((h) => {
    const was = districtAt(before, h.p);
    const now = districtAt(after, h.p);
    return was === now ? [] : [{ id: h.id, district: now }];
  });
}

export function toGeo(m: MultiPolygon, origin: LatLng): DistrictShapeGeo {
  return {
    type: 'MultiPolygon',
    coordinates: m.map((poly) =>
      poly.map((ring) =>
        ring.map(([x, y]) => {
          const { lat, lng } = unproject({ x, y }, origin);
          return [Number(lng.toFixed(7)), Number(lat.toFixed(7))] as [number, number];
        }),
      ),
    ),
  };
}

export function fromGeo(geo: DistrictShapeGeo | null, origin: LatLng): MultiPolygon | null {
  if (geo?.type !== 'MultiPolygon' || !Array.isArray(geo.coordinates)) return null;
  return geo.coordinates.map((poly) =>
    poly.map((ring) =>
      ring.map(([lng, lat]) => {
        const p = project({ lat, lng }, origin);
        return [cm(p.x), cm(p.y)] as [number, number];
      }),
    ),
  );
}
