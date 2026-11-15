// District membership editing (docs/ward-map-prd.md, Phase 6, step 2).
// A household's district is set directly (D5); edits are a draft until saved.
//
// Before the first save (no household has a district yet), every household
// starts in its companionship's district (step 7, "initial membership"), so
// that first save writes them all.

export interface MembershipHousehold {
  id: string;
  /** households.district_id as stored. */
  saved: string | null;
  /** The district of the household's companionship, if any. */
  companionshipDistrict: string | null;
}

export type Draft = Map<string, string | null>;

export const isInitialized = (hs: MembershipHousehold[]) => hs.some((h) => h.saved !== null);

/** Where a household stands before any edit in this session. */
export function baselineOf(h: MembershipHousehold, initialized: boolean): string | null {
  return initialized ? h.saved : h.companionshipDistrict;
}

export function effectiveOf(h: MembershipHousehold, draft: Draft, initialized: boolean): string | null {
  return draft.has(h.id) ? draft.get(h.id)! : baselineOf(h, initialized);
}

/**
 * A tap on a household (or a stack at one point, which moves as a unit): into
 * `district`, or out to no district if they're all already in it.
 */
export function toggle(draft: Draft, ids: string[], district: string | null, current: (id: string) => string | null): Draft {
  const allIn = ids.every((id) => current(id) === district);
  const next = new Map(draft);
  for (const id of ids) next.set(id, allIn ? null : district);
  return next;
}

/** Sets every one of `ids` to `district` (a lasso). */
export function assign(draft: Draft, ids: string[], district: string | null): Draft {
  const next = new Map(draft);
  for (const id of ids) next.set(id, district);
  return next;
}

export interface Change {
  id: string;
  from: string | null;
  to: string | null;
  /** Effect on "Ministered from another district" (district ≠ companionship's district). */
  flag: 'creates' | 'clears' | null;
}

export function changesOf(
  hs: MembershipHousehold[],
  draft: Draft,
): { writes: { id: string; district: string | null }[]; listed: Change[] } {
  const initialized = isInitialized(hs);
  const writes: { id: string; district: string | null }[] = [];
  const listed: Change[] = [];
  for (const h of hs) {
    const to = effectiveOf(h, draft, initialized);
    if (to !== h.saved) writes.push({ id: h.id, district: to });
    const from = baselineOf(h, initialized);
    if (to === from) continue;
    const other = (d: string | null) => d !== null && h.companionshipDistrict !== null && d !== h.companionshipDistrict;
    const before = other(from);
    const after = other(to);
    listed.push({ id: h.id, from, to, flag: !before && after ? 'creates' : before && !after ? 'clears' : null });
  }
  return { writes, listed };
}
