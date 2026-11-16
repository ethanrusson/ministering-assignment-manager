// Which household names fit on screen, and how. Marks never move (their
// position is the point of the map), so crowding is solved by trimming names:
//   1. In priority order, give each household its surname below its square,
//      or above it if below is taken. A name may not cover another name or
//      another household's square.
//   2. Then lengthen each placed name to "Surname, I." where that still fits.
// The selected household always gets its full label.

export interface LabelCandidate {
  id: string;
  /** Square center, screen px. */
  x: number;
  y: number;
  /** Label widths, px: surname only, and with the initial. */
  shortW: number;
  longW: number;
  /** Always shown, in full (the selected household). */
  force?: boolean;
}

export interface PlacedLabel {
  long: boolean;
  above: boolean;
}

/**
 * Square size, px, by zoom (screen px per meter): SQUARE_BASE at SQUARE_BASE_SCALE,
 * growing with zoom ^ SQUARE_GROWTH, within SQUARE_MIN..SQUARE_MAX.
 */
export const SQUARE_BASE = 22;
export const SQUARE_BASE_SCALE = 1;
export const SQUARE_GROWTH = 0.3;
export const SQUARE_MIN = 8;
export const SQUARE_MAX = 32;

export function squareSize(scale: number): number {
  const s = SQUARE_BASE * (scale / SQUARE_BASE_SCALE) ** SQUARE_GROWTH;
  return Math.round(Math.min(SQUARE_MAX, Math.max(SQUARE_MIN, s)));
}

/** Gap from the square's center to the near edge of its label. */
export const labelOffset = (square: number) => square / 2 + 2;
export const LABEL_H = 15;
const PAD = 1;

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const hits = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

function labelRect(c: LabelCandidate, w: number, above: boolean, offset: number): Rect {
  const y0 = above ? c.y - offset - LABEL_H : c.y + offset;
  return { x0: c.x - w / 2 - PAD, y0: y0 - PAD, x1: c.x + w / 2 + PAD, y1: y0 + LABEL_H + PAD };
}

export function fitLabels(items: LabelCandidate[], square = SQUARE_BASE): Map<string, PlacedLabel> {
  const half = square / 2;
  const offset = labelOffset(square);
  const squares = items.map((c) => ({
    id: c.id,
    r: { x0: c.x - half, y0: c.y - half, x1: c.x + half, y1: c.y + half },
  }));
  const placed = new Map<string, { label: PlacedLabel; rect: Rect }>();
  const free = (c: LabelCandidate, r: Rect) =>
    ![...placed].some(([id, p]) => id !== c.id && hits(p.rect, r)) &&
    !squares.some((s) => s.id !== c.id && hits(s.r, r));

  for (const c of items) {
    if (c.force) {
      placed.set(c.id, { label: { long: true, above: false }, rect: labelRect(c, c.longW, false, offset) });
      continue;
    }
    for (const above of [false, true]) {
      const rect = labelRect(c, c.shortW, above, offset);
      if (free(c, rect)) {
        placed.set(c.id, { label: { long: false, above }, rect });
        break;
      }
    }
  }

  for (const c of items) {
    const p = placed.get(c.id);
    if (!p || p.label.long) continue;
    const rect = labelRect(c, c.longW, p.label.above, offset);
    if (free(c, rect)) placed.set(c.id, { label: { long: true, above: p.label.above }, rect });
  }

  return new Map([...placed].map(([id, p]) => [id, p.label]));
}
