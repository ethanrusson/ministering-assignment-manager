import { describe, expect, it } from 'vitest';
import { findFreeSpot } from './autoNudge';

describe('findFreeSpot', () => {
  it('returns the preferred spot when no overlap', () => {
    const out = findFreeSpot({ x: 100, y: 100 }, { w: 50, h: 50 }, []);
    expect(out).toEqual({ x: 100, y: 100 });
  });

  it('avoids a single overlapping rect', () => {
    const existing = [{ x: 100, y: 100, w: 50, h: 50 }];
    const out = findFreeSpot({ x: 100, y: 100 }, { w: 50, h: 50 }, existing);
    const overlaps = !(
      out.x + 50 < existing[0].x ||
      existing[0].x + existing[0].w < out.x ||
      out.y + 50 < existing[0].y ||
      existing[0].y + existing[0].h < out.y
    );
    expect(overlaps).toBe(false);
  });

  it('finds a gap in a wall of cards', () => {
    const existing = Array.from({ length: 5 }, (_, i) => ({
      x: 100 + i * 60,
      y: 100,
      w: 50,
      h: 50,
    }));
    const out = findFreeSpot({ x: 180, y: 180 }, { w: 50, h: 50 }, existing);
    const anyOverlap = existing.some(
      (r) =>
        !(
          out.x + 50 < r.x ||
          r.x + r.w < out.x ||
          out.y + 50 < r.y ||
          r.y + r.h < out.y
        ),
    );
    expect(anyOverlap).toBe(false);
  });
});
