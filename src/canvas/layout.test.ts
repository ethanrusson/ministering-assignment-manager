import { describe, expect, it } from 'vitest';
import {
  CARD_H,
  CARD_W,
  COLS,
  COL_GAP,
  DISTRICT_HEADER,
  DISTRICT_INNER_PAD_X,
  DISTRICT_INNER_PAD_Y,
  DISTRICT_WIDTH,
  ROW_GAP,
  SORT_KEY_GAP,
  columnIndexForX,
  columnXForIndex,
  districtRenderHeight,
  findInsertOrdinalY,
  isPointInDistrict,
  packColumn,
  renderedPosition,
  renormalizeColumnSortKeys,
} from './layout';

const D = { position_x: 100, position_y: 100 };
/** Top of the first card slot in a column of D. */
const COL_TOP = D.position_y + DISTRICT_HEADER + DISTRICT_INNER_PAD_Y;

const heights = (entries: Record<string, number>) => new Map(Object.entries(entries));

describe('column geometry', () => {
  it('district width is 2 * card + gap + padding', () => {
    expect(COLS).toBe(2);
    expect(DISTRICT_WIDTH).toBe(2 * CARD_W + COL_GAP + 2 * DISTRICT_INNER_PAD_X);
  });

  it('places columns side by side inside the padding', () => {
    expect(columnXForIndex(D, 0)).toBe(D.position_x + DISTRICT_INNER_PAD_X);
    expect(columnXForIndex(D, 1)).toBe(D.position_x + DISTRICT_INNER_PAD_X + CARD_W + COL_GAP);
  });

  it('maps an x coordinate back to its column, splitting at the midpoint', () => {
    for (const col of [0, 1] as const) {
      const x = columnXForIndex(D, col);
      expect(columnIndexForX(D, x)).toBe(col);
      expect(columnIndexForX(D, x + 10)).toBe(col);
    }
    const mid = (columnXForIndex(D, 0) + columnXForIndex(D, 1)) / 2;
    expect(columnIndexForX(D, mid - 1)).toBe(0);
    expect(columnIndexForX(D, mid)).toBe(1);
    // Overshoots past either edge still land in the nearest column.
    expect(columnIndexForX(D, -1000)).toBe(0);
    expect(columnIndexForX(D, 100000)).toBe(1);
  });
});

describe('packColumn', () => {
  const cards = [
    { id: 'b', position_y: 2000 },
    { id: 'a', position_y: 1000 },
    { id: 'c', position_y: 3000 },
  ];

  it('stacks cards by sort key with a row gap between them', () => {
    const packed = packColumn(cards, heights({ a: 100, b: 200, c: 150 }));
    expect(packed).toEqual([
      { id: 'a', yOffset: 0, height: 100 },
      { id: 'b', yOffset: 100 + ROW_GAP, height: 200 },
      { id: 'c', yOffset: 100 + ROW_GAP + 200 + ROW_GAP, height: 150 },
    ]);
  });

  it('uses the default card height for cards not measured yet', () => {
    const packed = packColumn([{ id: 'a', position_y: 1000 }], new Map());
    expect(packed[0].height).toBe(CARD_H);
  });

  it('leaves room for a placeholder at the given ordinal', () => {
    const packed = packColumn(cards, heights({ a: 100, b: 100, c: 100 }), {
      placeholderOrdinal: 1,
      placeholderHeight: 50,
    });
    expect(packed.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    // b moves down by the placeholder plus one extra gap.
    expect(packed[1].yOffset).toBe(100 + ROW_GAP + 50 + ROW_GAP);
  });

  it('excludes the card being dragged', () => {
    const packed = packColumn(cards, heights({ a: 100, b: 100, c: 100 }), { excludeId: 'a' });
    expect(packed.map((p) => p.id)).toEqual(['b', 'c']);
    expect(packed[0].yOffset).toBe(0);
  });
});

describe('renderedPosition', () => {
  it('offsets a packed card from the district top, header and padding', () => {
    const packed = packColumn(
      [
        { id: 'a', position_y: 1000 },
        { id: 'b', position_y: 2000 },
      ],
      heights({ a: 120, b: 80 }),
    );
    expect(renderedPosition(D, 1, packed, 'b')).toEqual({
      x: columnXForIndex(D, 1),
      y: COL_TOP + 120 + ROW_GAP,
    });
  });

  it('returns null for a card not in the column', () => {
    expect(renderedPosition(D, 0, [], 'missing')).toBeNull();
  });
});

describe('districtRenderHeight', () => {
  const chrome = DISTRICT_HEADER + 2 * DISTRICT_INNER_PAD_Y;

  it('keeps one card slot of space when empty', () => {
    expect(districtRenderHeight([], [])).toBe(chrome + CARD_H);
  });

  it('fits the taller column', () => {
    const col0 = packColumn([{ id: 'a', position_y: 1 }], heights({ a: 300 }));
    const col1 = packColumn(
      [
        { id: 'b', position_y: 1 },
        { id: 'c', position_y: 2 },
      ],
      heights({ b: 200, c: 200 }),
    );
    expect(districtRenderHeight(col0, col1)).toBe(chrome + 200 + ROW_GAP + 200);
  });
});

describe('findInsertOrdinalY', () => {
  const h = heights({ a: 100, b: 100 });
  const cards = [
    { id: 'a', position_y: 1000 },
    { id: 'b', position_y: 2000 },
  ];
  // Midlines of a and b in world coordinates.
  const midA = COL_TOP + 50;
  const midB = COL_TOP + 100 + ROW_GAP + 50;

  it('gives the first card in an empty column the base sort key', () => {
    expect(findInsertOrdinalY(D, [], h, COL_TOP)).toEqual({
      sortY: SORT_KEY_GAP,
      needsRenormalize: false,
      ordinal: 0,
    });
  });

  it('inserts before the first card when dropped above its midline', () => {
    const r = findInsertOrdinalY(D, cards, h, midA - 1);
    expect(r.ordinal).toBe(0);
    expect(r.sortY).toBeLessThan(1000);
    expect(r.sortY).toBeGreaterThan(0);
    expect(r.needsRenormalize).toBe(false);
  });

  it('inserts between two cards at the midpoint of their keys', () => {
    const r = findInsertOrdinalY(D, cards, h, midA + 1);
    expect(r).toEqual({ sortY: 1500, needsRenormalize: false, ordinal: 1 });
  });

  it('appends after the last card', () => {
    const r = findInsertOrdinalY(D, cards, h, midB + 1);
    expect(r).toEqual({ sortY: 2000 + SORT_KEY_GAP, needsRenormalize: false, ordinal: 2 });
  });

  it('asks for renormalizing when neighbours have no room between them', () => {
    const tight = [
      { id: 'a', position_y: 1000 },
      { id: 'b', position_y: 1001 },
    ];
    const r = findInsertOrdinalY(D, tight, h, midA + 1);
    expect(r.ordinal).toBe(1);
    expect(r.needsRenormalize).toBe(true);
  });

  it('ignores the dragged card as its own neighbour', () => {
    const r = findInsertOrdinalY(D, cards, h, COL_TOP, 'a');
    expect(r.ordinal).toBe(0);
    expect(r.sortY).toBeLessThan(2000);
  });
});

describe('renormalizeColumnSortKeys', () => {
  it('respaces keys in sort order', () => {
    expect(
      renormalizeColumnSortKeys([
        { id: 'b', position_y: 7 },
        { id: 'a', position_y: 3 },
      ]),
    ).toEqual([
      { id: 'a', position_y: SORT_KEY_GAP },
      { id: 'b', position_y: 2 * SORT_KEY_GAP },
    ]);
  });

  it('splices an inserted card in at its ordinal, removing it from its old spot', () => {
    const out = renormalizeColumnSortKeys(
      [
        { id: 'a', position_y: 1 },
        { id: 'b', position_y: 2 },
        { id: 'c', position_y: 3 },
      ],
      { id: 'c', atOrdinal: 0, excludeId: 'c' },
    );
    expect(out.map((o) => o.id)).toEqual(['c', 'a', 'b']);
    expect(out.map((o) => o.position_y)).toEqual([1, 2, 3].map((n) => n * SORT_KEY_GAP));
  });
});

describe('isPointInDistrict', () => {
  it('checks the bounding box, edges included', () => {
    const d = { position_x: 100, position_y: 100, width: 200, height: 200 };
    expect(isPointInDistrict({ x: 150, y: 150 }, d)).toBe(true);
    expect(isPointInDistrict({ x: 50, y: 150 }, d)).toBe(false);
    expect(isPointInDistrict({ x: 100, y: 100 }, d)).toBe(true);
    expect(isPointInDistrict({ x: 300, y: 300 }, d)).toBe(true);
    expect(isPointInDistrict({ x: 301, y: 300 }, d)).toBe(false);
  });
});
