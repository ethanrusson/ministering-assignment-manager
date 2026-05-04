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
  cellOf,
  cellTopLeft,
  districtHeightForCount,
  findFreeCell,
  isPointInDistrict,
} from './layout';

const D = { position_x: 100, position_y: 100 };

describe('layout math', () => {
  it('district width is 2 * card + gap + padding', () => {
    expect(DISTRICT_WIDTH).toBe(2 * CARD_W + COL_GAP + 2 * DISTRICT_INNER_PAD_X);
  });

  it('cellTopLeft is reversible by cellOf', () => {
    for (let col = 0; col < COLS; col++) {
      for (let row = 0; row < 5; row++) {
        const tl = cellTopLeft(D, col, row);
        expect(cellOf(D, { position_x: tl.x, position_y: tl.y })).toEqual({ col, row });
      }
    }
  });

  it('districtHeightForCount accounts for header + padding + rows', () => {
    expect(districtHeightForCount(1)).toBe(
      DISTRICT_HEADER + 2 * DISTRICT_INNER_PAD_Y + CARD_H,
    );
    expect(districtHeightForCount(2)).toBe(
      DISTRICT_HEADER + 2 * DISTRICT_INNER_PAD_Y + CARD_H,
    ); // 2 in 2 cols = 1 row
    expect(districtHeightForCount(3)).toBe(
      DISTRICT_HEADER + 2 * DISTRICT_INNER_PAD_Y + 2 * CARD_H + ROW_GAP,
    );
  });

  it('isPointInDistrict checks AABB', () => {
    const d = { position_x: 100, position_y: 100, width: 200, height: 200 };
    expect(isPointInDistrict({ x: 150, y: 150 }, d)).toBe(true);
    expect(isPointInDistrict({ x: 50, y: 150 }, d)).toBe(false);
    expect(isPointInDistrict({ x: 100, y: 100 }, d)).toBe(true); // edge
  });
});

describe('findFreeCell', () => {
  it('returns preferred if free', () => {
    expect(findFreeCell(D, [], { col: 0, row: 0 })).toEqual({ col: 0, row: 0 });
  });

  it('finds adjacent cell when preferred is occupied', () => {
    const occupant = {
      id: 'a',
      ...cellTopLeft(D, 0, 0),
    };
    const free = findFreeCell(
      D,
      [{ id: occupant.id, position_x: occupant.x, position_y: occupant.y }],
      { col: 0, row: 0 },
    );
    expect(free).not.toEqual({ col: 0, row: 0 });
  });

  it('respects excludeId (the card being moved)', () => {
    const at00 = cellTopLeft(D, 0, 0);
    const me = { id: 'me', position_x: at00.x, position_y: at00.y };
    expect(findFreeCell(D, [me], { col: 0, row: 0 }, 'me')).toEqual({ col: 0, row: 0 });
  });

  it('overflows to a new row if grid is full', () => {
    const occ: { id: string; position_x: number; position_y: number }[] = [];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < COLS; c++) {
        const tl = cellTopLeft(D, c, r);
        occ.push({ id: `${c},${r}`, position_x: tl.x, position_y: tl.y });
      }
    }
    const free = findFreeCell(D, occ, { col: 0, row: 0 });
    expect(free.row).toBeGreaterThanOrEqual(5);
  });
});
