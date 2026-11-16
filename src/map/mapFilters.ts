// Map filtering and coloring (docs/ward-map-prd.md, Phase 3). Pure, so the
// rules can be tested and the panel's counts match what the map shows.

import type { HouseholdFlag } from '@/lib/flags';

/** 'district', 'status', or a label id. */
export type ColorBy = string;

export interface MapFilters {
  labels: Set<string>;
  flags: Set<HouseholdFlag>;
  /** District ranks (index in the district list). */
  districts: Set<number>;
}

export const emptyFilters = (): MapFilters => ({ labels: new Set(), flags: new Set(), districts: new Set() });

export const isFiltering = (f: MapFilters) => f.labels.size + f.flags.size + f.districts.size > 0;

/** AND across label / flag / district; OR within each. */
export function matches(
  f: MapFilters,
  h: { labelIds: string[]; flags: HouseholdFlag[]; districtRank: number },
): boolean {
  if (f.labels.size && !h.labelIds.some((l) => f.labels.has(l))) return false;
  if (f.flags.size && !h.flags.some((x) => f.flags.has(x))) return false;
  if (f.districts.size && !f.districts.has(h.districtRank)) return false;
  return true;
}

export interface Paint {
  /** CSS color variable names, e.g. 'red-600'. */
  fill: string;
  border: string;
  label: string;
}

/** "Color by status": the most pressing flag wins. */
export const STATUS_PAINT = {
  no_companionship: { fill: 'white', border: 'red-600', label: 'No companionship' },
  outside_ward: { fill: 'red-100', border: 'red-700', label: 'Outside ward' },
  other_district: { fill: 'amber-200', border: 'amber-600', label: 'Another district' },
  far_from_ministers: { fill: 'orange-200', border: 'orange-600', label: 'Far from ministers' },
  location_changed: { fill: 'cyan-100', border: 'cyan-600', label: 'Location changed' },
  ok: { fill: 'stone-200', border: 'stone-500', label: 'No issues' },
} satisfies Record<string, Paint>;

export function statusOf(flags: HouseholdFlag[]): keyof typeof STATUS_PAINT {
  for (const s of ['no_companionship', 'outside_ward', 'other_district', 'far_from_ministers', 'location_changed'] as const) {
    if (flags.includes(s)) return s;
  }
  return 'ok';
}
