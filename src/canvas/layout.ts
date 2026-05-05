// Layout constants and helpers for districts + companionships.
//
// Districts use a fixed 2-column grid. Width is constant; height auto-sizes
// to fit the number of companionships inside the district. Companionships
// dropped inside a district snap to the nearest free grid cell. Companionships
// outside any district are positioned freely.

export const CARD_W = 400;
// Collapsed card slot height: title row (~36) + 2 rows of elder chips (~52)
// + vertical padding (~16). Rendered card pins to this via min-height/height
// in CompanionshipCard.vue so the grid stays aligned even when chips wrap.
export const CARD_H = 180;
export const COL_GAP = 16;
export const ROW_GAP = 16;
export const DISTRICT_INNER_PAD_X = 16;
export const DISTRICT_INNER_PAD_Y = 16;
export const DISTRICT_HEADER = 36; // matches the .h-9 title bar in District.vue
export const COLS = 2;
export const DISTRICT_WIDTH =
  COLS * CARD_W + (COLS - 1) * COL_GAP + 2 * DISTRICT_INNER_PAD_X;

interface DistrictPos {
  position_x: number;
  position_y: number;
}
interface CompPos {
  position_x: number;
  position_y: number;
}

export function districtHeightForRows(rows: number): number {
  const r = Math.max(1, rows);
  return DISTRICT_HEADER + 2 * DISTRICT_INNER_PAD_Y + r * CARD_H + (r - 1) * ROW_GAP;
}

export function districtHeightForCount(n: number): number {
  return districtHeightForRows(Math.ceil(n / COLS));
}

export function cellTopLeft(d: DistrictPos, col: number, row: number) {
  return {
    x: d.position_x + DISTRICT_INNER_PAD_X + col * (CARD_W + COL_GAP),
    y:
      d.position_y +
      DISTRICT_HEADER +
      DISTRICT_INNER_PAD_Y +
      row * (CARD_H + ROW_GAP),
  };
}

/** Map a card top-left to its (col, row) within a district. */
export function cellOf(d: DistrictPos, c: CompPos) {
  const relX = c.position_x - d.position_x - DISTRICT_INNER_PAD_X;
  const relY = c.position_y - d.position_y - DISTRICT_HEADER - DISTRICT_INNER_PAD_Y;
  const col = Math.max(0, Math.min(COLS - 1, Math.round(relX / (CARD_W + COL_GAP))));
  const row = Math.max(0, Math.round(relY / (CARD_H + ROW_GAP)));
  return { col, row };
}

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

/** Find a free cell in `district` near `preferred`, ignoring `excludeId`. */
export function findFreeCell(
  district: DistrictPos,
  occupants: { id: string; position_x: number; position_y: number }[],
  preferred: { col: number; row: number },
  excludeId: string | null = null,
) {
  const occ = new Set<string>();
  for (const o of occupants) {
    if (o.id === excludeId) continue;
    const { col, row } = cellOf(district, o);
    occ.add(`${col},${row}`);
  }
  if (!occ.has(`${preferred.col},${preferred.row}`)) return preferred;
  // Manhattan-distance spiral; bounded — districts won't get giant.
  for (let dist = 1; dist < 60; dist++) {
    for (let dr = -dist; dr <= dist; dr++) {
      for (let dc = -COLS; dc <= COLS; dc++) {
        if (Math.abs(dr) + Math.abs(dc) !== dist) continue;
        const col = preferred.col + dc;
        const row = preferred.row + dr;
        if (col < 0 || col >= COLS || row < 0) continue;
        if (!occ.has(`${col},${row}`)) return { col, row };
      }
    }
  }
  // Fallback: first column, next row past everyone.
  let maxRow = -1;
  for (const key of occ) {
    const [, r] = key.split(',').map(Number);
    if (r > maxRow) maxRow = r;
  }
  return { col: 0, row: maxRow + 1 };
}
