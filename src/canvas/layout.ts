// Layout constants and helpers for districts + companionships.
//
// Districts use a 2-column **masonry** layout: fixed column width, variable
// card heights, cards pack tight to the top of each column. Card positions
// inside a district are stored as logical sort keys (NOT pixels):
//   - `position_x` encodes the column index (snapped to one of two values)
//   - `position_y` is an integer sort key within the column (large gaps so
//     we can insert between two existing cards via midpoint)
// The actual rendered (x, y) is computed at render time using measured
// card heights from the companionships store's `heightById` reactive map.
//
// Companionships outside any district keep `position_x` / `position_y` as
// real pixel coordinates (free-floating on the canvas).

export const CARD_W = 400;
// Default min card height — used as a placeholder height before the
// ResizeObserver has measured an actual card. The card itself can grow
// taller as content wraps.
export const CARD_H = 180;
export const COL_GAP = 32;
export const ROW_GAP = 32;
export const DISTRICT_INNER_PAD_X = 32;
export const DISTRICT_INNER_PAD_Y = 32;
export const DISTRICT_HEADER = 36; // matches the .h-9 title bar in District.vue
export const COLS = 2;
export const DISTRICT_WIDTH =
  COLS * CARD_W + (COLS - 1) * COL_GAP + 2 * DISTRICT_INNER_PAD_X;

/** Sort-key spacing for new positions in a column. */
export const SORT_KEY_GAP = 1000;

interface DistrictPos {
  position_x: number;
  position_y: number;
}

// ─── Column geometry ────────────────────────────────────────────────────────

/** Absolute X for the left edge of a column within a district. */
export function columnXForIndex(d: DistrictPos, col: 0 | 1): number {
  return d.position_x + DISTRICT_INNER_PAD_X + col * (CARD_W + COL_GAP);
}

/**
 * Given an X coordinate (absolute world units) inside a district, return
 * which column (0 or 1) it falls into. Robust to slight overshoots.
 */
export function columnIndexForX(d: DistrictPos, x: number): 0 | 1 {
  const col0X = columnXForIndex(d, 0);
  const col1X = columnXForIndex(d, 1);
  // Midpoint between the two column starts.
  const mid = (col0X + col1X) / 2;
  return x < mid ? 0 : 1;
}

// ─── Masonry packing ────────────────────────────────────────────────────────

export interface CardSortInfo {
  id: string;
  position_y: number;
}

export interface PackedCard {
  id: string;
  /** Y offset relative to the column's top (district top + header + pad). */
  yOffset: number;
  /** Measured height used for layout. */
  height: number;
}

/**
 * Pack a column's cards top-to-bottom by their `position_y` sort order.
 * Optionally insert a placeholder slot at the given ordinal — used for the
 * live drag preview so existing cards visually shift to make room.
 */
export function packColumn(
  cards: CardSortInfo[],
  heightById: ReadonlyMap<string, number> | Map<string, number>,
  options: {
    placeholderOrdinal?: number;
    placeholderHeight?: number;
    /** Exclude this id from the layout (e.g. the card being dragged). */
    excludeId?: string;
  } = {},
): PackedCard[] {
  const { placeholderOrdinal, placeholderHeight, excludeId } = options;
  const sorted = cards
    .filter((c) => c.id !== excludeId)
    .slice()
    .sort((a, b) => a.position_y - b.position_y);

  type Slot =
    | { kind: 'real'; id: string; height: number }
    | { kind: 'placeholder'; height: number };
  const slots: Slot[] = [];
  for (let i = 0; i <= sorted.length; i++) {
    if (
      placeholderOrdinal !== undefined &&
      placeholderHeight !== undefined &&
      i === placeholderOrdinal
    ) {
      slots.push({ kind: 'placeholder', height: placeholderHeight });
    }
    if (i < sorted.length) {
      const c = sorted[i];
      slots.push({
        kind: 'real',
        id: c.id,
        height: heightById.get(c.id) ?? CARD_H,
      });
    }
  }

  const out: PackedCard[] = [];
  let yOffset = 0;
  for (let i = 0; i < slots.length; i++) {
    if (i > 0) yOffset += ROW_GAP;
    const s = slots[i];
    if (s.kind === 'real') {
      out.push({ id: s.id, yOffset, height: s.height });
    }
    yOffset += s.height;
  }

  return out;
}

/**
 * Compute the rendered (x, y) for a single card given the packed layout
 * for its column and the district top.
 */
export function renderedPosition(
  d: DistrictPos,
  col: 0 | 1,
  packed: PackedCard[],
  cardId: string,
): { x: number; y: number } | null {
  const entry = packed.find((p) => p.id === cardId);
  if (!entry) return null;
  return {
    x: columnXForIndex(d, col),
    y:
      d.position_y +
      DISTRICT_HEADER +
      DISTRICT_INNER_PAD_Y +
      entry.yOffset,
  };
}

// ─── District height ────────────────────────────────────────────────────────

/**
 * Total district height = max(col0 packed bottom, col1 packed bottom)
 * + header + bottom padding. Honors a minimum so empty districts are visible.
 */
export function districtRenderHeight(
  col0: PackedCard[],
  col1: PackedCard[],
): number {
  const colBottom = (packed: PackedCard[]) => {
    if (!packed.length) return 0;
    const last = packed[packed.length - 1];
    return last.yOffset + last.height;
  };
  const tallest = Math.max(colBottom(col0), colBottom(col1));
  const minBody = CARD_H; // ensures at least one card-slot of empty space
  const body = Math.max(tallest, minBody);
  return DISTRICT_HEADER + DISTRICT_INNER_PAD_Y + body + DISTRICT_INNER_PAD_Y;
}

// ─── Drop / insert math ─────────────────────────────────────────────────────

export interface InsertResult {
  /** New `position_y` sort key. May be a non-integer midpoint. */
  sortY: number;
  /** True if neighbors are too close together — caller should renormalize. */
  needsRenormalize: boolean;
  /** 0-indexed insert position (count of cards above). */
  ordinal: number;
}

/**
 * Given a column's existing cards and a drop pointer Y (in absolute world
 * coords), figure out:
 *   1. The insert ordinal (how many cards are above the drop point).
 *   2. The new `position_y` sort key (midpoint between neighbors).
 *
 * `excludeId` is the dragged card's id so it doesn't count as its own
 * neighbor when reordering within a column.
 */
export function findInsertOrdinalY(
  d: DistrictPos,
  cards: CardSortInfo[],
  heightById: ReadonlyMap<string, number> | Map<string, number>,
  dropY: number,
  excludeId?: string,
): InsertResult {
  const sorted = cards
    .filter((c) => c.id !== excludeId)
    .slice()
    .sort((a, b) => a.position_y - b.position_y);

  // Compute each card's Y range to decide which slot the pointer is over.
  const colTopY = d.position_y + DISTRICT_HEADER + DISTRICT_INNER_PAD_Y;
  let yCursor = colTopY;
  let ordinal = sorted.length; // default: append
  for (let i = 0; i < sorted.length; i++) {
    const h = heightById.get(sorted[i].id) ?? CARD_H;
    const cardMidY = yCursor + h / 2;
    if (dropY < cardMidY) {
      ordinal = i;
      break;
    }
    yCursor += h + ROW_GAP;
  }

  // Compute sortY based on neighbors at this ordinal.
  let sortY: number;
  let needsRenormalize = false;
  const prev = ordinal > 0 ? sorted[ordinal - 1] : null;
  const next = ordinal < sorted.length ? sorted[ordinal] : null;

  if (!prev && !next) {
    sortY = SORT_KEY_GAP; // first card
  } else if (!prev && next) {
    sortY = next.position_y - SORT_KEY_GAP;
    if (sortY <= 0) {
      // Don't bother going negative; just sit slightly before.
      sortY = next.position_y / 2;
    }
    if (next.position_y - sortY < 1) needsRenormalize = true;
  } else if (prev && !next) {
    sortY = prev.position_y + SORT_KEY_GAP;
  } else if (prev && next) {
    const gap = next.position_y - prev.position_y;
    if (gap > 1) {
      sortY = Math.floor((prev.position_y + next.position_y) / 2);
      if (sortY === prev.position_y || sortY === next.position_y) {
        // Shouldn't happen with gap > 1, but be safe.
        needsRenormalize = true;
        sortY = prev.position_y + 1;
      }
    } else {
      needsRenormalize = true;
      sortY = prev.position_y + 1; // tentative; caller will renormalize
    }
  } else {
    sortY = SORT_KEY_GAP;
  }

  return { sortY, needsRenormalize, ordinal };
}

/**
 * Renormalize a column's cards to clean spaced sort keys (1000, 2000, 3000, …).
 * Returns the new (id, position_y) pairs in ordinal order. The caller is
 * responsible for persisting these.
 *
 * Pass the dragged card's id and target ordinal to splice it in at the right
 * place during renormalization.
 */
export function renormalizeColumnSortKeys(
  cards: CardSortInfo[],
  insert?: { id: string; atOrdinal: number; excludeId?: string },
): { id: string; position_y: number }[] {
  const sorted = cards
    .filter((c) => c.id !== insert?.excludeId)
    .slice()
    .sort((a, b) => a.position_y - b.position_y)
    .map((c) => c.id);

  if (insert) {
    sorted.splice(insert.atOrdinal, 0, insert.id);
  }
  return sorted.map((id, i) => ({ id, position_y: (i + 1) * SORT_KEY_GAP }));
}

// ─── Geometry helpers ───────────────────────────────────────────────────────

export function isPointInDistrict(
  pt: { x: number; y: number },
  d: { position_x: number; position_y: number; width: number; height: number },
) {
  return (
    pt.x >= d.position_x &&
    pt.x <= d.position_x + d.width &&
    pt.y >= d.position_y &&
    pt.y <= d.position_y + d.height
  );
}
