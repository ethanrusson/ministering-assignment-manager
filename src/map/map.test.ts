import { describe, expect, it } from 'vitest';
import {
  distance,
  formatMiles,
  groupByPoint,
  project,
  projectionOrigin,
  scaleBar,
  wardBounds,
} from './geo';
import { allConnections, buildConnections, type MinisteringModel } from './connections';
import { nudge } from './nudge';

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

describe('nudge', () => {
  const box = (id: string, x: number, y: number) => ({ id, x, y, left: -20, top: -10, w: 40, h: 20 });

  it('leaves separate boxes alone', () => {
    const out = nudge([box('a', 0, 0), box('b', 100, 0)]);
    expect(out.get('a')).toEqual({ dx: 0, dy: 0 });
    expect(out.get('b')).toEqual({ dx: 0, dy: 0 });
  });

  it('pushes overlapping boxes apart until they clear', () => {
    const out = nudge([box('a', 0, 0), box('b', 10, 0)], { gap: 0 });
    const a = out.get('a')!;
    const b = out.get('b')!;
    // 30 px of horizontal overlap but only 20 px vertical: they separate vertically.
    expect(a.dx).toBe(0);
    expect(b.dy - a.dy).toBeGreaterThanOrEqual(20);
  });

  it('never moves a box further than maxShift', () => {
    const out = nudge([box('a', 0, 0), box('b', 0, 0), box('c', 0, 0)], { maxShift: 5 });
    for (const o of out.values()) expect(Math.hypot(o.dx, o.dy)).toBeLessThanOrEqual(5 + 1e-9);
  });
});
