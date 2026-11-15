// The "Reassign" list for a household (docs/ward-map-prd.md, Phase 4): the
// nearest companionships by distance to the midpoint of their ministers'
// homes, plus the current one. Pure, so the ranking can be tested.

import { metersBetween } from '@/lib/flags';
import type { LatLng } from './geo';

export const NEAREST_COUNT = 4;

export interface Candidate {
  id: string;
  /** Midpoint of the ministers' homes; null when none is located. */
  hub: LatLng | null;
}

export interface Option {
  id: string;
  meters: number | null;
  current: boolean;
}

/**
 * The NEAREST_COUNT nearest companionships (unlocated ones last), then the
 * current one if it isn't already listed.
 */
export function reassignOptions(
  here: LatLng | null,
  candidates: Candidate[],
  currentId: string | null,
): Option[] {
  const ranked = candidates
    .map((c) => ({ id: c.id, meters: here && c.hub ? metersBetween(here, c.hub) : null }))
    .sort((a, b) => (a.meters ?? Infinity) - (b.meters ?? Infinity));
  const shown = ranked.slice(0, NEAREST_COUNT);
  const current = ranked.find((r) => r.id === currentId);
  if (current && !shown.includes(current)) shown.push(current);
  return shown.map((r) => ({ ...r, current: r.id === currentId }));
}
