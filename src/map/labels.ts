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

export const SQUARE_HALF = 11;
/** Gap from the square's center to the near edge of its label, and label height. */
export const LABEL_OFFSET = 13;
export const LABEL_H = 15;
const PAD = 1;

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const hits = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

function labelRect(c: LabelCandidate, w: number, above: boolean): Rect {
  const y0 = above ? c.y - LABEL_OFFSET - LABEL_H : c.y + LABEL_OFFSET;
  return { x0: c.x - w / 2 - PAD, y0: y0 - PAD, x1: c.x + w / 2 + PAD, y1: y0 + LABEL_H + PAD };
}

export function fitLabels(items: LabelCandidate[]): Map<string, PlacedLabel> {
  const squares = items.map((c) => ({
    id: c.id,
    r: { x0: c.x - SQUARE_HALF, y0: c.y - SQUARE_HALF, x1: c.x + SQUARE_HALF, y1: c.y + SQUARE_HALF },
  }));
  const placed = new Map<string, { label: PlacedLabel; rect: Rect }>();
  const free = (c: LabelCandidate, r: Rect) =>
    ![...placed].some(([id, p]) => id !== c.id && hits(p.rect, r)) &&
    !squares.some((s) => s.id !== c.id && hits(s.r, r));

  for (const c of items) {
    if (c.force) {
      placed.set(c.id, { label: { long: true, above: false }, rect: labelRect(c, c.longW, false) });
      continue;
    }
    for (const above of [false, true]) {
      const rect = labelRect(c, c.shortW, above);
      if (free(c, rect)) {
        placed.set(c.id, { label: { long: false, above }, rect });
        break;
      }
    }
  }

  for (const c of items) {
    const p = placed.get(c.id);
    if (!p || p.label.long) continue;
    const rect = labelRect(c, c.longW, p.label.above);
    if (free(c, rect)) placed.set(c.id, { label: { long: true, above: p.label.above }, rect });
  }

  return new Map([...placed].map(([id, p]) => [id, p.label]));
}
