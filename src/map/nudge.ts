// Display-only spreading of overlapping household marks (D3). Boxes are in
// screen pixels; the result is a per-box offset, never a stored position.

export interface Box {
  id: string;
  /** Anchor point (the location) and the box's extent around it. */
  x: number;
  y: number;
  left: number;
  top: number;
  w: number;
  h: number;
}

/**
 * Pushes overlapping boxes apart, each at most `maxShift` px from its true
 * place, so a mark never wanders far from the home it stands for.
 */
export function nudge(
  boxes: Box[],
  { iterations = 300, gap = 2, maxShift = Infinity } = {},
): Map<string, { dx: number; dy: number }> {
  const home = boxes.map((b) => ({ x: b.x + b.left, y: b.y + b.top }));
  const pos = boxes.map((b, i) => ({ ...home[i], w: b.w + gap, h: b.h + gap }));
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const a = pos[i];
        const b = pos[j];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        // Separate along the axis that needs the smaller push; ties go by index.
        if (ox < oy) {
          const s = a.x + a.w / 2 <= b.x + b.w / 2 ? -1 : 1;
          a.x += (s * ox) / 2;
          b.x -= (s * ox) / 2;
        } else {
          const s = a.y + a.h / 2 <= b.y + b.h / 2 ? -1 : 1;
          a.y += (s * oy) / 2;
          b.y -= (s * oy) / 2;
        }
      }
    }
    for (let i = 0; i < pos.length; i++) {
      const dx = pos[i].x - home[i].x;
      const dy = pos[i].y - home[i].y;
      const d = Math.hypot(dx, dy);
      if (d > maxShift) {
        pos[i].x = home[i].x + (dx * maxShift) / d;
        pos[i].y = home[i].y + (dy * maxShift) / d;
      }
    }
    if (!moved) break;
  }
  return new Map(
    boxes.map((b, i) => [b.id, { dx: pos[i].x - home[i].x, dy: pos[i].y - home[i].y }]),
  );
}
