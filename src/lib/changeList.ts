// Pure function that diffs snapshot membership against the current state and
// returns a sorted list of changes grouped by the person's current destination
// (companionship or "Unassigned").
//
// Ordering:
//   1. Companionships inside districts, sorted by district.position_x (L→R),
//      then within district by companionship position_x (col 0 before col 1),
//      then by position_y sort key (top→bottom).
//   2. Un-districted companionships, sorted by position_y.
//   3. "Unassigned" group (people who had a companionship and no longer do).
//
// Within each group: elders first (alphabetical), then households (alphabetical).

import { companionshipTitle } from '@/lib/validation';

export interface ChangeEntry {
  name: string;
  kind: 'elder' | 'household';
}

export interface ChangeGroup {
  companionshipId: string | null;   // null = Unassigned
  title: string;
  districtName: string | null;
  entries: ChangeEntry[];
}

interface CompanionshipInfo {
  id: string;
  district_id: string | null;
  position_x: number;
  position_y: number;
}

interface DistrictInfo {
  id: string;
  name: string;
  position_x: number;
  position_y: number;
}

// Accepts readonly arrays so the output of Vue's readonly() wrapper is compatible.
interface SnapshotInput {
  elderLinks: readonly { companionship_id: string; elder_id: string }[];
  householdLinks: readonly { companionship_id: string; household_id: string }[];
}

export function generateChangeList(
  snapshot: SnapshotInput,
  currentElderLinks: readonly { companionship_id: string; elder_id: string }[],
  currentHouseholdLinks: readonly { companionship_id: string; household_id: string }[],
  eldersById: Map<string, { name: string }>,
  householdsById: Map<string, { name: string }>,
  companionships: CompanionshipInfo[],
  /** companionship_id → elder_id[] (current state, for title generation) */
  currentElderIdsForComp: Map<string, string[]>,
  districts: DistrictInfo[],
): ChangeGroup[] {
  // ─── Build lookup maps ────────────────────────────────────────────────────

  // snapshot: person id → companionship_id
  const snapElderComp = new Map(snapshot.elderLinks.map((l) => [l.elder_id, l.companionship_id]));
  const snapHouseholdComp = new Map(snapshot.householdLinks.map((l) => [l.household_id, l.companionship_id]));

  // current: person id → companionship_id
  const currElderComp = new Map(currentElderLinks.map((l) => [l.elder_id, l.companionship_id]));
  const currHouseholdComp = new Map(currentHouseholdLinks.map((l) => [l.household_id, l.companionship_id]));

  // ─── Collect changed people ───────────────────────────────────────────────

  /** Map from target-companionship-id (or null = unassigned) → ChangeEntry[] */
  const groups = new Map<string | null, ChangeEntry[]>();

  function addEntry(targetCompId: string | null, entry: ChangeEntry) {
    const arr = groups.get(targetCompId) ?? [];
    arr.push(entry);
    groups.set(targetCompId, arr);
  }

  // All elder ids seen in either snapshot or current
  const allElderIds = new Set([...snapElderComp.keys(), ...currElderComp.keys()]);
  for (const elderId of allElderIds) {
    const snapComp = snapElderComp.get(elderId) ?? null;
    const currComp = currElderComp.get(elderId) ?? null;
    if (snapComp === currComp) continue; // unchanged
    const elder = eldersById.get(elderId);
    if (!elder) continue;
    addEntry(currComp, { name: elder.name, kind: 'elder' });
  }

  // All household ids seen in either snapshot or current
  const allHouseholdIds = new Set([...snapHouseholdComp.keys(), ...currHouseholdComp.keys()]);
  for (const householdId of allHouseholdIds) {
    const snapComp = snapHouseholdComp.get(householdId) ?? null;
    const currComp = currHouseholdComp.get(householdId) ?? null;
    if (snapComp === currComp) continue;
    const household = householdsById.get(householdId);
    if (!household) continue;
    addEntry(currComp, { name: household.name, kind: 'household' });
  }

  if (groups.size === 0) return [];

  // ─── Build district lookup ────────────────────────────────────────────────

  const districtById = new Map(districts.map((d) => [d.id, d]));

  // ─── Sort companionships ──────────────────────────────────────────────────

  const compById = new Map(companionships.map((c) => [c.id, c]));

  function compSortKey(compId: string): [number, number, number, number] {
    const c = compById.get(compId);
    if (!c) return [2, 0, 0, 0]; // unknown → last
    if (!c.district_id) return [1, 0, c.position_x, c.position_y]; // undistricited → second group
    const d = districtById.get(c.district_id);
    if (!d) return [1, 0, c.position_x, c.position_y];
    // Districted: sort by district.position_x, then comp position_x (column), then comp position_y
    return [0, d.position_x, c.position_x, c.position_y];
  }

  // Collect all companionship ids that appear as group keys (excluding null)
  const compIds = [...groups.keys()].filter((k): k is string => k !== null);
  compIds.sort((a, b) => {
    const ka = compSortKey(a);
    const kb = compSortKey(b);
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] !== kb[i]) return ka[i] - kb[i];
    }
    return 0;
  });

  // ─── Build ChangeGroup array ──────────────────────────────────────────────

  function sortEntries(entries: ChangeEntry[]): ChangeEntry[] {
    return [...entries].sort((a, b) => {
      // elders before households
      if (a.kind !== b.kind) return a.kind === 'elder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  function compTitle(compId: string): string {
    const elderIds = currentElderIdsForComp.get(compId) ?? [];
    const names = elderIds
      .map((id) => eldersById.get(id)?.name)
      .filter((n): n is string => !!n);
    return companionshipTitle(names);
  }

  const result: ChangeGroup[] = [];

  for (const compId of compIds) {
    const entries = groups.get(compId) ?? [];
    if (!entries.length) continue;
    const comp = compById.get(compId);
    const district = comp?.district_id ? districtById.get(comp.district_id) : null;
    result.push({
      companionshipId: compId,
      title: compTitle(compId),
      districtName: district?.name ?? null,
      entries: sortEntries(entries),
    });
  }

  // "Unassigned" group goes last
  const unassignedEntries = groups.get(null);
  if (unassignedEntries?.length) {
    result.push({
      companionshipId: null,
      title: 'Unassigned',
      districtName: null,
      entries: sortEntries(unassignedEntries),
    });
  }

  return result;
}

/** Render a change list as plain text for clipboard copy. */
export function changeListToText(groups: ChangeGroup[]): string {
  return groups
    .map((g) => {
      const header = g.districtName ? `${g.districtName} — ${g.title}` : g.title;
      const lines = g.entries.map((e) => `  • ${e.name} moved to ${g.title}`);
      return [header, ...lines].join('\n');
    })
    .join('\n\n');
}
