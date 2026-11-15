// Splits the ward into blocks along streets (docs/ward-map-prd.md, Phase 6,
// step 3.1). Works in projected meters (geo.ts).
//
// The ward boundary and every street segment are noded into one planar graph,
// streets ending just short of another street are joined to it, dead ends are
// pruned (so they don't split anything), and the faces of what's left inside
// the boundary are the blocks.

import type { Point } from './geo';

export type Ring = Point[];

/** A street end this close to another street is treated as joining it, in meters. */
const JOIN_M = 3;
/** Points closer than this are the same node, in meters. */
const SNAP_M = 0.05;

interface Seg {
  a: Point;
  b: Point;
}

export function splitIntoBlocks(boundary: Ring, streets: Point[][]): Ring[] {
  const segs: Seg[] = [];
  for (let i = 0; i < boundary.length; i++) {
    segs.push({ a: boundary[i], b: boundary[(i + 1) % boundary.length] });
  }
  const box = bbox(boundary, 10);
  const streetSegs: Seg[] = [];
  for (const line of streets) {
    for (let i = 1; i < line.length; i++) {
      const s = { a: line[i - 1], b: line[i] };
      if (overlapsBox(s, box)) streetSegs.push(s);
    }
  }
  segs.push(...streetSegs);
  segs.push(...joins(streets, segs));

  const graph = node(segs);
  prune(graph);
  return faces(graph).filter((f) => pointInRing(interiorPoint(f), boundary));
}

// ─── Noding ────────────────────────────────────────────────────────────────

/** Short connectors from street ends to a street they stop just short of. */
function joins(streets: Point[][], segs: Seg[]): Seg[] {
  const out: Seg[] = [];
  for (const line of streets) {
    if (line.length < 2) continue;
    for (const end of [line[0], line[line.length - 1]]) {
      let best: Point | null = null;
      let bestD = JOIN_M;
      for (const s of segs) {
        const p = closestOnSegment(end, s);
        const d = dist(end, p);
        if (d > SNAP_M && d < bestD) {
          best = p;
          bestD = d;
        }
      }
      if (best) out.push({ a: end, b: best });
    }
  }
  return out;
}

interface Graph {
  pts: Point[];
  adj: Map<number, Set<number>>;
}

function node(segs: Seg[]): Graph {
  // Split points along each segment, as parameters 0..1.
  const cuts = segs.map(() => [0, 1]);
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const hit = intersect(segs[i], segs[j]);
      if (hit) {
        cuts[i].push(hit.t);
        cuts[j].push(hit.u);
      }
    }
  }
  // Also split where an endpoint of one segment touches another mid-way.
  for (let i = 0; i < segs.length; i++) {
    for (const p of [segs[i].a, segs[i].b]) {
      for (let j = 0; j < segs.length; j++) {
        if (i === j) continue;
        const t = paramOnSegment(p, segs[j]);
        if (t !== null) cuts[j].push(t);
      }
    }
  }

  const g: Graph = { pts: [], adj: new Map() };
  const ids = new Map<string, number>();
  const id = (p: Point) => {
    const key = `${Math.round(p.x / SNAP_M)},${Math.round(p.y / SNAP_M)}`;
    let n = ids.get(key);
    if (n === undefined) {
      n = g.pts.length;
      g.pts.push(p);
      ids.set(key, n);
      g.adj.set(n, new Set());
    }
    return n;
  };
  segs.forEach((s, i) => {
    const ts = [...new Set(cuts[i])].sort((a, b) => a - b);
    for (let k = 1; k < ts.length; k++) {
      const u = id(lerp(s, ts[k - 1]));
      const v = id(lerp(s, ts[k]));
      if (u === v) continue;
      g.adj.get(u)!.add(v);
      g.adj.get(v)!.add(u);
    }
  });
  return g;
}

/** Remove dead ends: edges into a node with no other way out. */
function prune(g: Graph) {
  const stack = [...g.adj.keys()].filter((n) => g.adj.get(n)!.size === 1);
  while (stack.length) {
    const n = stack.pop()!;
    const nbrs = g.adj.get(n)!;
    if (nbrs.size !== 1) continue;
    const [m] = nbrs;
    nbrs.clear();
    const back = g.adj.get(m)!;
    back.delete(n);
    if (back.size === 1) stack.push(m);
  }
}

// ─── Faces ─────────────────────────────────────────────────────────────────

/** Bounded faces of the planar graph, as rings. */
function faces(g: Graph): Ring[] {
  const order = new Map<number, number[]>();
  for (const [n, nbrs] of g.adj) {
    const p = g.pts[n];
    order.set(
      n,
      [...nbrs].sort(
        (a, b) =>
          Math.atan2(g.pts[a].y - p.y, g.pts[a].x - p.x) -
          Math.atan2(g.pts[b].y - p.y, g.pts[b].x - p.x),
      ),
    );
  }
  const seen = new Set<string>();
  const rings: Ring[] = [];
  for (const [u, nbrs] of g.adj) {
    for (const v of nbrs) {
      if (seen.has(`${u}>${v}`)) continue;
      const ring: number[] = [];
      let a = u;
      let b = v;
      while (!seen.has(`${a}>${b}`)) {
        seen.add(`${a}>${b}`);
        ring.push(a);
        // Turn as sharply as possible at b: the neighbor just before a, going around b.
        const around = order.get(b)!;
        const i = around.indexOf(a);
        const c = around[(i - 1 + around.length) % around.length];
        a = b;
        b = c;
      }
      rings.push(ring.map((n) => g.pts[n]));
    }
  }
  // Every bounded face winds one way; each component's outer face the other.
  const signs = rings.map(signedArea);
  const outerSign = Math.sign(signs[signs.reduce((m, s, i) => (Math.abs(s) > Math.abs(signs[m]) ? i : m), 0)] ?? 0);
  return rings.filter((r, i) => r.length >= 3 && Math.sign(signs[i]) !== outerSign && Math.abs(signs[i]) > 1);
}

// ─── Small geometry ────────────────────────────────────────────────────────

export function signedArea(r: Ring): number {
  let s = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i];
    const q = r[(i + 1) % r.length];
    s += p.x * q.y - q.x * p.y;
  }
  return s / 2;
}

export function pointInRing(p: Point, r: Ring): boolean {
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

/** A point inside the ring: its centroid if that's inside, else just off its longest edge. */
export function interiorPoint(r: Ring): Point {
  const a = signedArea(r);
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i];
    const q = r[(i + 1) % r.length];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  const c = { x: cx / (6 * a), y: cy / (6 * a) };
  if (a !== 0 && pointInRing(c, r)) return c;
  let best = 0;
  for (let i = 1; i < r.length; i++) {
    if (dist(r[i], r[(i + 1) % r.length]) > dist(r[best], r[(best + 1) % r.length])) best = i;
  }
  const p = r[best];
  const q = r[(best + 1) % r.length];
  const len = dist(p, q) || 1;
  const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  const n = { x: -(q.y - p.y) / len, y: (q.x - p.x) / len };
  const tryAt = { x: mid.x + n.x * 0.1, y: mid.y + n.y * 0.1 };
  return pointInRing(tryAt, r) ? tryAt : { x: mid.x - n.x * 0.1, y: mid.y - n.y * 0.1 };
}

function intersect(s: Seg, r: Seg): { t: number; u: number } | null {
  const dx1 = s.b.x - s.a.x;
  const dy1 = s.b.y - s.a.y;
  const dx2 = r.b.x - r.a.x;
  const dy2 = r.b.y - r.a.y;
  const den = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(den) < 1e-12) return null;
  const ex = r.a.x - s.a.x;
  const ey = r.a.y - s.a.y;
  const t = (ex * dy2 - ey * dx2) / den;
  const u = (ex * dy1 - ey * dx1) / den;
  return t > 0 && t < 1 && u > 0 && u < 1 ? { t, u } : null;
}

/** Where p lies along s (0..1, exclusive), if it's within SNAP_M of the segment. */
function paramOnSegment(p: Point, s: Seg): number | null {
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  const len2 = dx * dx + dy * dy;
  if (!len2) return null;
  const t = ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / len2;
  if (t <= 0 || t >= 1) return null;
  return dist(p, lerp(s, t)) <= SNAP_M ? t : null;
}

function closestOnSegment(p: Point, s: Seg): Point {
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / len2)) : 0;
  return lerp(s, t);
}

const lerp = (s: Seg, t: number): Point => ({ x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t });
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function bbox(r: Ring, pad: number) {
  const xs = r.map((p) => p.x);
  const ys = r.map((p) => p.y);
  return { x0: Math.min(...xs) - pad, y0: Math.min(...ys) - pad, x1: Math.max(...xs) + pad, y1: Math.max(...ys) + pad };
}

function overlapsBox(s: Seg, b: ReturnType<typeof bbox>): boolean {
  return (
    Math.max(s.a.x, s.b.x) >= b.x0 &&
    Math.min(s.a.x, s.b.x) <= b.x1 &&
    Math.max(s.a.y, s.b.y) >= b.y0 &&
    Math.min(s.a.y, s.b.y) <= b.y1
  );
}
