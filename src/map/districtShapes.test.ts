import { describe, expect, it } from 'vitest';
import type { MultiPolygon } from 'polygon-clipping';
import { districtAreas } from './districtAreas';
import { districtAt, fitShapes, fromGeo, movesBetween, paint, ringShape, setShape, shapeRings, toGeo, type Shapes } from './districtShapes';

const P = (x: number, y: number) => ({ x, y });
const box = (x0: number, y0: number, x1: number, y1: number) => ringShape([P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)]);
const area = (m: MultiPolygon) =>
  m.reduce(
    (sum, poly) =>
      sum +
      poly.reduce((s, ring, i) => {
        let a = 0;
        for (let k = 0; k < ring.length - 1; k++) a += ring[k][0] * ring[k + 1][1] - ring[k + 1][0] * ring[k][1];
        return s + (i === 0 ? Math.abs(a / 2) : -Math.abs(a / 2));
      }, 0),
    0,
  );

describe('district shapes', () => {
  it('adds an area to a district and finds points in it', () => {
    const shapes = paint(new Map(), 'a', box(0, 0, 100, 100));
    expect(districtAt(shapes, P(50, 50))).toBe('a');
    expect(districtAt(shapes, P(150, 50))).toBeNull();
  });

  it('grows a district when an adjoining area is painted', () => {
    const shapes = paint(paint(new Map(), 'a', box(0, 0, 100, 100)), 'a', box(100, 0, 200, 100));
    expect(shapes.get('a')).toHaveLength(1);
    expect(area(shapes.get('a')!)).toBeCloseTo(20000, 0);
  });

  it('cuts a new shape out of the others, so shapes never overlap', () => {
    const a = paint(new Map(), 'a', box(0, 0, 100, 100));
    const ab = paint(a, 'b', box(50, 0, 150, 100));
    expect(area(ab.get('a')!)).toBeCloseTo(5000, 0);
    expect(area(ab.get('b')!)).toBeCloseTo(10000, 0);
    expect(districtAt(ab, P(75, 50))).toBe('b');
  });

  it('erases with no district, and drops a shape cut away entirely', () => {
    const shapes = paint(paint(new Map(), 'a', box(0, 0, 100, 100)), null, box(-10, -10, 110, 110));
    expect(shapes.has('a')).toBe(false);
  });

  it('replaces a district’s shape when its corners are edited', () => {
    const shapes: Shapes = paint(new Map(), 'a', box(0, 0, 100, 100));
    const rings = shapeRings(shapes.get('a')!);
    rings[0][0][2] = P(200, 100);
    const edited = setShape(shapes, 'a', ringShape(rings[0][0]));
    expect(districtAt(edited, P(150, 80))).toBe('a');
  });

  it('moves only households whose containing shape changed', () => {
    const before = paint(new Map(), 'a', box(0, 0, 100, 100));
    const after = paint(before, 'b', box(50, 0, 150, 100));
    const hs = [
      { id: 'stays', p: P(25, 50) },
      { id: 'cut', p: P(75, 50) },
      { id: 'new', p: P(125, 50) },
      { id: 'outside', p: P(300, 50) },
    ];
    expect(movesBetween(hs, before, after)).toEqual([
      { id: 'cut', district: 'b' },
      { id: 'new', district: 'b' },
    ]);
  });

  it('round-trips through stored lat/lng within a centimetre', () => {
    const origin = { lat: 40, lng: -111 };
    const m = box(-120.5, 30.25, 80, 210.75);
    const back = fromGeo(toGeo(m, origin), origin)!;
    back[0][0].forEach(([x, y], i) => {
      expect(x).toBeCloseTo(m[0][0][i][0], 1);
      expect(y).toBeCloseTo(m[0][0][i][1], 1);
    });
    expect(fromGeo(null, origin)).toBeNull();
  });
});

describe('fitShapes', () => {
  // A 300 m square ward with a street grid: two columns, two rows.
  const ward = [P(0, 0), P(300, 0), P(300, 300), P(0, 300)];
  const streets = [
    [P(150, -20), P(150, 320)],
    [P(-20, 150), P(320, 150)],
  ];
  const homes = [
    { p: P(60, 60), district: 'a' },
    { p: P(240, 60), district: 'a' },
    { p: P(60, 240), district: 'b' },
    { p: P(200, 200), district: 'b' },
    { p: P(260, 260), district: 'a' },
  ];

  it('puts every household inside its own district, with no overlaps', () => {
    const shapes = fitShapes(districtAreas(ward, streets, homes));
    for (const h of homes) expect(districtAt(shapes, h.p)).toBe(h.district);
    expect(area(shapes.get('a')!) + area(shapes.get('b')!)).toBeCloseTo(90000, -1);
  });

  it('keeps few corners on straight edges', () => {
    const wobbly = ringShape([P(0, 0), P(50, 0.5), P(100, 0), P(100, 100), P(0, 100)]);
    const shapes = fitShapes([{ district: 'a', shape: wobbly }]);
    expect(shapeRings(shapes.get('a')!)[0][0]).toHaveLength(4);
  });
});
