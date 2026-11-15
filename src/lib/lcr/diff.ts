import type { ParsedElder, ParsedHousehold, ParseResult } from './parser';

// Matching order for each parsed person:
//   1. LCR person UUID (stored as lcr_uuid). Survives renames.
//   2. Case-insensitive trimmed name, but only against local rows that have no
//      lcr_uuid yet, and only when exactly one such row has that name. This is
//      how rows created before UUIDs were stored get linked on their next import.
// A name that matches several unlinked rows is reported as ambiguous and left
// alone, so an import never attaches an ID to the wrong person.

export interface ExistingElder {
  id: string;
  name: string;
  age: number | null;
  hidden: boolean;
  lcrUuid?: string | null;
  notGenerallyAssigned?: boolean;
}
export interface ExistingHousehold {
  id: string;
  name: string;
  hidden: boolean;
  lcrUuid?: string | null;
}

/** Bookkeeping fields an import writes onto an existing elder. Never touches the board. */
export interface ElderIdentityPatch {
  lcr_uuid?: string;
  name?: string;
  not_generally_assigned?: boolean;
}
export interface HouseholdIdentityPatch {
  lcr_uuid?: string;
  name?: string;
}

export type MatchedBy = 'uuid' | 'name';

export interface ElderChange {
  parsed: ParsedElder;
  existing?: ExistingElder;
  kind: 'add' | 'age-change' | 'unchanged' | 'ambiguous';
  prevAge?: number | null;
  matchedBy?: MatchedBy;
  /** Present only when there is something to write. */
  identity?: ElderIdentityPatch;
}

export interface HouseholdChange {
  parsed: ParsedHousehold;
  existing?: ExistingHousehold;
  kind: 'add' | 'unchanged' | 'ambiguous';
  matchedBy?: MatchedBy;
  identity?: HouseholdIdentityPatch;
}

export interface OrphanReport {
  elders: ExistingElder[]; // present locally, missing from import
  households: ExistingHousehold[]; // ditto
}

export interface DiffResult {
  elders: ElderChange[];
  households: HouseholdChange[];
  orphans: OrphanReport;
}

const norm = (s: string) => s.trim().toLowerCase();

type Match<T> = { row: T; by: MatchedBy } | 'ambiguous' | null;

/** Builds a matcher that hands out each local row at most once. */
function matcher<T extends { id: string; name: string; lcrUuid?: string | null }>(rows: T[]) {
  const byUuid = new Map<string, T>();
  const byName = new Map<string, T[]>();
  for (const r of rows) {
    if (r.lcrUuid) byUuid.set(r.lcrUuid, r);
    else {
      const list = byName.get(norm(r.name)) ?? [];
      list.push(r);
      byName.set(norm(r.name), list);
    }
  }
  const taken = new Set<string>();
  /** Local rows a parsed name pointed at but couldn't pick between. Not orphans. */
  const ambiguous = new Set<string>();

  return {
    taken,
    ambiguous,
    match(uuid: string, name: string): Match<T> {
      const u = byUuid.get(uuid);
      if (u && !taken.has(u.id)) {
        taken.add(u.id);
        return { row: u, by: 'uuid' };
      }
      const candidates = (byName.get(norm(name)) ?? []).filter((r) => !taken.has(r.id));
      if (candidates.length > 1) {
        for (const c of candidates) ambiguous.add(c.id);
        return 'ambiguous';
      }
      if (candidates.length === 1) {
        taken.add(candidates[0].id);
        return { row: candidates[0], by: 'name' };
      }
      return null;
    },
  };
}

export function diffImport(
  parsed: ParseResult,
  existing: { elders: ExistingElder[]; households: ExistingHousehold[] },
): DiffResult {
  // LCR only reports notGenerallyAssigned on the eligible roster. Without the
  // roster every parsed elder reads false, which must not clear a stored flag.
  const trustFlags = parsed.hasEligibleRoster;

  const elders = matcher(existing.elders);
  const elderChanges: ElderChange[] = [];
  for (const p of parsed.elders) {
    const m = elders.match(p.legacyId, p.name);
    if (m === 'ambiguous') {
      elderChanges.push({ parsed: p, kind: 'ambiguous' });
      continue;
    }
    if (!m) {
      elderChanges.push({ parsed: p, kind: 'add' });
      continue;
    }
    const ex = m.row;
    const identity: ElderIdentityPatch = {};
    if (ex.lcrUuid !== p.legacyId) identity.lcr_uuid = p.legacyId;
    if (m.by === 'uuid' && ex.name.trim() !== p.name.trim()) identity.name = p.name;
    if (trustFlags && (ex.notGenerallyAssigned ?? false) !== p.notGenerallyAssigned) {
      identity.not_generally_assigned = p.notGenerallyAssigned;
    }
    const base = {
      parsed: p,
      existing: ex,
      matchedBy: m.by,
      ...(Object.keys(identity).length ? { identity } : {}),
    };
    if ((ex.age ?? null) !== (p.age ?? null)) {
      elderChanges.push({ ...base, kind: 'age-change', prevAge: ex.age });
    } else {
      elderChanges.push({ ...base, kind: 'unchanged' });
    }
  }

  const households = matcher(existing.households);
  const householdChanges: HouseholdChange[] = [];
  for (const p of parsed.households) {
    const m = households.match(p.legacyId, p.name);
    if (m === 'ambiguous') {
      householdChanges.push({ parsed: p, kind: 'ambiguous' });
      continue;
    }
    if (!m) {
      householdChanges.push({ parsed: p, kind: 'add' });
      continue;
    }
    const ex = m.row;
    const identity: HouseholdIdentityPatch = {};
    if (ex.lcrUuid !== p.legacyId) identity.lcr_uuid = p.legacyId;
    if (m.by === 'uuid' && ex.name.trim() !== p.name.trim()) identity.name = p.name;
    householdChanges.push({
      parsed: p,
      existing: ex,
      kind: 'unchanged',
      matchedBy: m.by,
      ...(Object.keys(identity).length ? { identity } : {}),
    });
  }

  return {
    elders: elderChanges,
    households: householdChanges,
    orphans: {
      elders: existing.elders.filter(
        (e) => !elders.taken.has(e.id) && !elders.ambiguous.has(e.id) && !e.hidden,
      ),
      households: existing.households.filter(
        (h) => !households.taken.has(h.id) && !households.ambiguous.has(h.id) && !h.hidden,
      ),
    },
  };
}

export interface DiffStats {
  eldersAdded: number;
  eldersAgeChanged: number;
  eldersUnchanged: number;
  householdsAdded: number;
  householdsUnchanged: number;
  orphanElders: number;
  orphanHouseholds: number;
  /** Existing rows that get their LCR ID stored for the first time. */
  newlyLinked: number;
  /** Rows matched by ID whose name changed in LCR. */
  renamed: number;
  /** Parsed people whose name matches more than one unlinked local row. */
  ambiguous: number;
}

export function summarizeDiff(d: DiffResult): DiffStats {
  const changes = [...d.elders, ...d.households];
  return {
    eldersAdded: d.elders.filter((e) => e.kind === 'add').length,
    eldersAgeChanged: d.elders.filter((e) => e.kind === 'age-change').length,
    eldersUnchanged: d.elders.filter((e) => e.kind === 'unchanged').length,
    householdsAdded: d.households.filter((h) => h.kind === 'add').length,
    householdsUnchanged: d.households.filter((h) => h.kind === 'unchanged').length,
    orphanElders: d.orphans.elders.length,
    orphanHouseholds: d.orphans.households.length,
    newlyLinked: changes.filter((c) => c.identity?.lcr_uuid !== undefined).length,
    renamed: changes.filter((c) => c.identity?.name !== undefined).length,
    ambiguous: changes.filter((c) => c.kind === 'ambiguous').length,
  };
}
