// Colour per district, keyed by its position in the district list — the same
// rank the grid orders by, so a district's badge number and colour always
// agree with where its cards sit.
//
// Districts have no colour of their own in the database; this is presentation
// only. Emerald is deliberately absent (it means "drop target" elsewhere), as
// are stone (no district) and red (warnings).

const PALETTE = [
  'bg-blue-100 text-blue-700 ring-blue-300',
  'bg-amber-100 text-amber-700 ring-amber-300',
  'bg-violet-100 text-violet-700 ring-violet-300',
  'bg-teal-100 text-teal-700 ring-teal-300',
  'bg-rose-100 text-rose-700 ring-rose-300',
  'bg-lime-100 text-lime-700 ring-lime-300',
  'bg-cyan-100 text-cyan-700 ring-cyan-300',
  'bg-orange-100 text-orange-700 ring-orange-300',
];

export const NO_DISTRICT_CLASSES = 'bg-white text-stone-500 ring-stone-300';

/** Tailwind classes for the district at `rank`; cycles past the palette end. */
export function districtClasses(rank: number): string {
  if (rank < 0) return NO_DISTRICT_CLASSES;
  return PALETTE[rank % PALETTE.length];
}

/** Short badge label for the district at `rank` — "D1", "D2", … */
export function districtLabel(rank: number): string {
  return rank < 0 ? '—' : `D${rank + 1}`;
}
