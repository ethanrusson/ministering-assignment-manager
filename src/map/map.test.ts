import { describe, expect, it } from 'vitest';
import {
  distance,
  formatMiles,
  groupByPoint,
  project,
  projectionOrigin,
  scaleBar,
  toBBox,
  unproject,
  wardBounds,
} from './geo';
import { fitLabels } from './labels';
import { homesToDraw, parseHouses } from './homes';
import { overpassQuery, parseOverpass, placeStreetLabels, simplify } from './streets';
import { allConnections, buildConnections, type MinisteringModel } from './connections';

describe('projection', () => {
  const origin = { lat: 40, lng: -111 };

  it('puts the origin at 0,0 with north up', () => {
    expect(project(origin, origin)).toEqual({ x: 0, y: -0 });
    expect(project({ lat: 40.001, lng: -111 }, origin).y).toBeCloseTo(-110.54, 2);
  });

  it('shrinks longitude by cos(latitude)', () => {
    const p = project({ lat: 40, lng: -110.999 }, origin);
    expect(p.x).toBeCloseTo(111.32 * Math.cos((40 * Math.PI) / 180), 2);
  });

  it('centers on the median household, ignoring a far outlier', () => {
    const o = projectionOrigin([
      { lat: 1, lng: 1 },
      { lat: 1.001, lng: 1.001 },
      { lat: 1.002, lng: 1.002 },
      { lat: 9, lng: 9 },
    ]);
    expect(o.lat).toBeCloseTo(1.0015, 6);
    expect(o.lng).toBeCloseTo(1.0015, 6);
  });
});

describe('distance', () => {
  it('is straight-line meters, shown in miles', () => {
    expect(distance({ x: 0, y: 0 }, { x: 300, y: 400 })).toBe(500);
    expect(formatMiles(1609.344)).toBe('1.0 mi');
    expect(formatMiles(480)).toBe('0.3 mi');
    expect(formatMiles(50)).toBe('< 0.1 mi');
  });
});

describe('groupByPoint', () => {
  it('groups households with identical coordinates only', () => {
    const groups = groupByPoint([
      { id: 'a', lat: 1, lng: 2 },
      { id: 'b', lat: 1, lng: 2 },
      { id: 'c', lat: 1, lng: 2.000001 },
    ]);
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([['a', 'b'], ['c']]);
  });
});

describe('wardBounds', () => {
  it('leaves out a pin far beyond the rest', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 0, y: 800 },
      { x: 1000, y: 800 },
      { x: 500, y: 400 },
      { x: 400, y: 300 },
      { x: 600, y: 500 },
      { x: 300, y: 600 },
      { x: 700, y: 200 },
      { x: 500, y: 100 },
      { x: 500, y: 20000 },
    ];
    expect(wardBounds(pts)).toEqual({ x: 0, y: 0, w: 1000, h: 800 });
  });

  it('keeps a strung-out group but drops a lone pin', () => {
    const tail = [0, 700, 1400, 2100].map((y) => ({ x: 0, y: -y }));
    const lone = { x: 0, y: 2500 };
    expect(wardBounds([...tail, lone])).toEqual({ x: -100, y: -2100, w: 200, h: 2100 });
  });

  it('has a minimum size for a single household', () => {
    expect(wardBounds([{ x: 10, y: 10 }])).toEqual({ x: -90, y: -90, w: 200, h: 200 });
  });
});

describe('scaleBar', () => {
  it('picks the longest round distance that fits', () => {
    // 0.1 px/m: 0.5 mi = 80 px fits in 120, 1 mi = 161 px does not.
    expect(scaleBar(0.1)).toEqual({ px: 0.5 * 1609.344 * 0.1, label: '0.5 mi' });
  });
});

// Companionship c1 (elders e1 at h1, e2 at h2) ministers to h3 and h4.
// Companionship c2 (elder e3 at h3, e4 with no home) ministers to h1.
function model(): MinisteringModel {
  return {
    companionshipForHousehold: new Map([
      ['h3', 'c1'],
      ['h4', 'c1'],
      ['h1', 'c2'],
    ]),
    companionshipForElder: new Map([
      ['e1', 'c1'],
      ['e2', 'c1'],
      ['e3', 'c2'],
      ['e4', 'c2'],
    ]),
    eldersInCompanionship: new Map([
      ['c1', ['e1', 'e2']],
      ['c2', ['e3', 'e4']],
    ]),
    householdsInCompanionship: new Map([
      ['c1', ['h3', 'h4']],
      ['c2', ['h1']],
    ]),
    homeOf: new Map([
      ['e1', 'h1'],
      ['e2', 'h2'],
      ['e3', 'h3'],
    ]),
  };
}

describe('buildConnections', () => {
  it('draws each minister home to a ministered household', () => {
    const c = buildConnections('h4', model());
    expect(c.ministers).toEqual([
      { from: 'h1', to: 'h4' },
      { from: 'h2', to: 'h4' },
    ]);
    expect(c.served).toEqual([]);
    expect([...c.focus].sort()).toEqual(['h1', 'h2', 'h4']);
  });

  it('adds served households and the companion when an elder lives here', () => {
    const c = buildConnections('h1', model());
    // h1 is ministered by c2: only e3 has a home.
    expect(c.ministers).toEqual([{ from: 'h3', to: 'h1' }]);
    // e1 lives at h1 and ministers (in c1) to h3 and h4 with e2.
    expect(c.served).toEqual([
      { from: 'h1', to: 'h3' },
      { from: 'h1', to: 'h4' },
    ]);
    expect(c.companion).toEqual([{ from: 'h1', to: 'h2' }]);
  });

  it('skips the companion line when the companion has no home', () => {
    const c = buildConnections('h3', model());
    expect(c.companion).toEqual([]);
    expect(c.served).toEqual([{ from: 'h3', to: 'h1' }]);
  });

  it('builds every minister-to-household line for the overlay', () => {
    expect(allConnections(model())).toEqual([
      { from: 'h1', to: 'h3' },
      { from: 'h1', to: 'h4' },
      { from: 'h2', to: 'h3' },
      { from: 'h2', to: 'h4' },
      { from: 'h3', to: 'h1' },
    ]);
  });
});

describe('unproject and toBBox', () => {
  const origin = { lat: 40, lng: -111 };

  it('inverts project', () => {
    const p = project({ lat: 40.01, lng: -110.98 }, origin);
    const back = unproject(p, origin);
    expect(back.lat).toBeCloseTo(40.01, 9);
    expect(back.lng).toBeCloseTo(-110.98, 9);
  });

  it('grows the box by the margin and keeps north above south', () => {
    const b = toBBox({ x: -100, y: -100, w: 200, h: 200 }, origin, 100);
    expect(b.north).toBeCloseTo(40 + 200 / 110540, 9);
    expect(b.south).toBeCloseTo(40 - 200 / 110540, 9);
    expect(b.east).toBeGreaterThan(b.west);
  });
});

describe('streets import', () => {
  it('builds a bounding-box-only Overpass query', () => {
    const q = overpassQuery({ south: 1, west: 2, north: 3, east: 4 });
    expect(q).toContain('(1.000000,2.000000,3.000000,4.000000)');
    expect(q).toContain('residential');
    expect(q).not.toContain('footway');
  });

  it('keeps streets by kind, drops footpaths and parking aisles', () => {
    const way = (id: number, tags: Record<string, string>) => ({
      type: 'way',
      id,
      tags,
      geometry: [
        { lat: 0, lon: 0 },
        { lat: 0, lon: 0.001 },
      ],
    });
    const streets = parseOverpass({
      elements: [
        way(1, { highway: 'secondary', name: 'Center St' }),
        way(2, { highway: 'residential', name: 'Maple Dr' }),
        way(3, { highway: 'service' }),
        way(4, { highway: 'service', service: 'parking_aisle' }),
        way(5, { highway: 'footway' }),
        { type: 'node', id: 6 },
      ],
    });
    expect(streets.map((s) => [s.osmId, s.kind, s.name])).toEqual([
      ['1', 'main', 'Center St'],
      ['2', 'residential', 'Maple Dr'],
      ['3', 'lane', ''],
    ]);
    expect(streets[0].geometry).toEqual({ type: 'LineString', coordinates: [[0, 0], [0.001, 0]] });
  });

  it('rejects a response without elements', () => {
    expect(() => parseOverpass({ remark: 'runtime error' })).toThrow(/unexpected/);
  });

  it('simplifies near-straight lines to their ends but keeps real corners', () => {
    const straight = [0, 1, 2, 3, 4].map((i) => ({ lat: 0.000001 * (i % 2), lng: i * 0.0005 }));
    expect(simplify(straight, 2)).toHaveLength(2);
    const corner = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 0.001 },
      { lat: 0.001, lng: 0.001 },
    ];
    expect(simplify(corner, 2)).toHaveLength(3);
  });
});

describe('placeStreetLabels', () => {
  const width = (s: string) => s.length * 6;

  it('labels the middle of the longest segment, upright', () => {
    const [l] = placeStreetLabels(
      [{ name: 'Oak Ave', pts: [{ x: 200, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 10 }] }],
      width,
    );
    expect(l).toEqual({ name: 'Oak Ave', x: 100, y: 0, angle: 0 });
  });

  it('skips streets too short for their name and repeats only far apart', () => {
    const seg = (x: number) => ({ name: 'Elm St', pts: [{ x, y: 0 }, { x: x + 100, y: 0 }] });
    const labels = placeStreetLabels(
      [{ name: 'Long Name Boulevard', pts: [{ x: 0, y: 50 }, { x: 40, y: 50 }] }, seg(0), seg(100), seg(400)],
      width,
    );
    expect(labels.map((l) => [l.name, l.x])).toEqual([
      ['Elm St', 50],
      ['Elm St', 450],
    ]);
  });
});

describe('fitLabels', () => {
  const c = (id: string, x: number, y: number, shortW = 40, longW = 60) => ({ id, x, y, shortW, longW });
  const show = (m: Map<string, { long: boolean; above: boolean }>) =>
    Object.fromEntries([...m].map(([id, l]) => [id, `${l.above ? 'above' : 'below'}${l.long ? '+initial' : ''}`]));

  it('shows full names below when there is room', () => {
    expect(show(fitLabels([c('a', 0, 0), c('b', 100, 0)]))).toEqual({ a: 'below+initial', b: 'below+initial' });
  });

  it('drops the initial before dropping a name', () => {
    // 50 px apart: two 60 px labels collide, two 40 px surnames don't.
    expect(show(fitLabels([c('a', 0, 0), c('b', 50, 0)]))).toEqual({ a: 'below', b: 'below' });
  });

  it('moves a name above its square when below is taken', () => {
    expect(show(fitLabels([c('a', 0, 0, 40, 40), c('b', 30, 0, 40, 40)]))).toEqual({ a: 'below+initial', b: 'above+initial' });
  });

  it('keeps a name off a neighbouring square', () => {
    // b's square sits where a's label would go, below or above.
    const out = fitLabels([c('a', 0, 0), c('b', 0, 30), c('d', 0, -30)]);
    expect(out.has('a')).toBe(false);
  });

  it('always shows a forced name in full', () => {
    const out = fitLabels([{ ...c('a', 0, 0), force: true }, c('b', 0, 30)]);
    expect(out.get('a')).toEqual({ long: true, above: false });
  });
});

describe('homes', () => {
  it('reads the footprint script output, ignoring stray text', () => {
    expect(parseHouses('copied:\n[{"lat":1,"lng":2},{"lat":"x"}]\n')).toEqual([{ lat: 1, lng: 2 }]);
    expect(() => parseHouses('nothing here')).toThrow(/footprints command/);
    expect(() => parseHouses('[]')).toThrow(/No houses/);
  });

  it('hides homes under a member household', () => {
    const homes = [{ id: 'near', p: { x: 10, y: 10 } }, { id: 'far', p: { x: 100, y: 0 } }];
    expect(homesToDraw(homes, [{ x: 0, y: 0 }]).map((h) => h.id)).toEqual(['far']);
  });
});
