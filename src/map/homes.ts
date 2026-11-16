// Non-member homes on the map (migration 0006): the faint squares between
// member households.

import { distance, type LatLng, type Point } from './geo';

/** A footprint home this close to a member household is that household's house, so it isn't drawn. */
export const MEMBER_HOME_RADIUS_M = 25;

/** Reads the JSON printed by scripts/footprints.ts. */
export function parseHouses(text: string): LatLng[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1));
  } catch {
    throw new Error('Paste the output of the footprints command.');
  }
  if (!Array.isArray(raw)) throw new Error('Paste the output of the footprints command.');
  const out: LatLng[] = [];
  for (const p of raw) {
    const { lat, lng } = (p ?? {}) as Partial<LatLng>;
    if (typeof lat === 'number' && typeof lng === 'number' && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      out.push({ lat, lng });
    }
  }
  if (!out.length) throw new Error('No houses found in the pasted text.');
  return out;
}

/**
 * Homes to draw: every home not under a member household. A home placed by
 * hand is always drawn. Points are projected meters.
 */
export function homesToDraw<T extends { p: Point; manual: boolean }>(homes: T[], members: Point[]): T[] {
  return homes.filter((h) => h.manual || !members.some((m) => distance(h.p, m) <= MEMBER_HOME_RADIUS_M));
}
