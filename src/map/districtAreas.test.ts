import { describe, expect, it } from 'vitest';
import polygonClipping, { type MultiPolygon } from 'polygon-clipping';
import { splitIntoBlocks, signedArea } from './blocks';
import { districtAreas, type DistrictArea } from './districtAreas';

// Fixture ward: a 300 m square. Two north–south streets (x = 100, 200) and one
// east–west street (y = 150) cross it fully, making six 100 × 150 m blocks.
const P = (x: number, y: number) => ({ x, y });
const ward = [P(0, 0), P(300, 0), P(300, 300), P(0, 300)];
const grid = [
  [P(100, -20), P(100, 320)],
  [P(200, -20), P(200, 320)],
  [P(-20, 150), P(320, 150)],
];
/** A cul-de-sac off y = 150: dead-ends, so it splits nothing. */
const deadEnd = [P(150, 150), P(150, 220)];

const areaOf = (m: MultiPolygon) =>
  m.reduce(
    (sum, poly) =>
      sum +
      poly.reduce((s, ring, i) => {
        const a = Math.abs(signedArea(ring.slice(0, -1).map(([x, y]) => P(x, y))));
        return s + (i === 0 ? a : -a);
      }, 0),
    0,
  );

const byDistrict = (areas: DistrictArea[]) => Object.fromEntries(areas.map((a) => [a.district, a]));

describe('splitIntoBlocks', () => {
  it('splits the ward along streets that cross it', () => {
    const blocks = splitIntoBlocks(ward, grid);
    expect(blocks).toHaveLength(6);
    for (const b of blocks) expect(Math.abs(signedArea(b))).toBeCloseTo(15000, 3);
  });

  it('ignores dead-end streets', () => {
    expect(splitIntoBlocks(ward, [...grid, deadEnd])).toHaveLength(6);
  });

  it('joins a street that stops just short of another', () => {
    // y = 75 from the west edge to 2 m short of x = 100: splits the north-west block.
    const blocks = splitIntoBlocks(ward, [...grid, [P(-20, 75), P(98, 75)]]);
    expect(blocks).toHaveLength(7);
  });

  it('ignores streets outside the ward', () => {
    expect(splitIntoBlocks(ward, [...grid, [P(400, 0), P(400, 300)]])).toHaveLength(6);
  });
});

describe('districtAreas', () => {
  it('gives each one-district block to that district and empty blocks to the nearest household', () => {
    // a in the north-west block, b in the north-east block; everything else is empty.
    const areas = byDistrict(
      districtAreas(ward, grid, [
        { p: P(50, 75), district: 'a' },
        { p: P(250, 75), district: 'b' },
      ]),
    );
    // Middle column's blocks are equidistant-ish; the west column goes to a, the east to b.
    expect(areaOf(areas.a.shape) + areaOf(areas.b.shape)).toBeCloseTo(90000, 0);
    expect(areaOf(areas.a.shape)).toBeGreaterThanOrEqual(30000);
    expect(areaOf(areas.b.shape)).toBeGreaterThanOrEqual(30000);
  });

  it('divides a mixed block halfway between its households, inside the block', () => {
    const areas = byDistrict(
      districtAreas(ward, grid, [
        { p: P(120, 75), district: 'a' },
        { p: P(180, 75), district: 'b' },
        { p: P(50, 225), district: 'a' },
        { p: P(250, 225), district: 'b' },
      ]),
    );
    // In the middle-north block (x 100–200, y 0–150) the line falls at x = 150.
    const middleNorth: MultiPolygon = [[[[100, 0], [200, 0], [200, 150], [100, 150], [100, 0]]]];
    const aPart = polygonClipping.intersection(areas.a.shape, middleNorth);
    expect(areaOf(aPart)).toBeCloseTo(7500, 0);
  });

  it('covers the ward exactly once: no gaps, no overlaps', () => {
    const areas = districtAreas(ward, [...grid, deadEnd], [
      { p: P(30, 30), district: 'a' },
      { p: P(130, 60), district: 'b' },
      { p: P(170, 90), district: 'a' },
      { p: P(260, 260), district: 'c' },
      { p: P(120, 200), district: '' },
    ]);
    const total = areas.reduce((s, a) => s + areaOf(a.shape), 0);
    expect(total).toBeCloseTo(90000, 0);
    for (let i = 0; i < areas.length; i++) {
      for (let j = i + 1; j < areas.length; j++) {
        expect(areaOf(polygonClipping.intersection(areas[i].shape, areas[j].shape))).toBeLessThan(0.01);
      }
    }
  });

  it('reports a district whose area comes out in two pieces', () => {
    // a holds the two west blocks and the north-east block; b's middle column separates them.
    const areas = byDistrict(
      districtAreas(ward, grid, [
        { p: P(50, 75), district: 'a' },
        { p: P(50, 225), district: 'a' },
        { p: P(150, 75), district: 'b' },
        { p: P(150, 225), district: 'b' },
        { p: P(250, 75), district: 'a' },
        { p: P(250, 225), district: 'b' },
      ]),
    );
    expect(areas.a.split).toBe(true);
    expect(areas.b.split).toBe(false);
  });

  it('counts households at the same point once', () => {
    const areas = districtAreas(ward, grid, [
      { p: P(50, 75), district: 'a' },
      { p: P(50, 75), district: 'b' },
    ]);
    expect(areas.map((a) => a.district)).toEqual(['a']);
  });

  it('divides the whole ward halfway between homes when there are no streets', () => {
    const areas = byDistrict(
      districtAreas(ward, [], [
        { p: P(75, 150), district: 'a' },
        { p: P(225, 150), district: 'b' },
      ]),
    );
    expect(areaOf(areas.a.shape)).toBeCloseTo(45000, 0);
    expect(areaOf(areas.b.shape)).toBeCloseTo(45000, 0);
  });
});
