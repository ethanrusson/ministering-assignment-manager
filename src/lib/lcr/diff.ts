import type { ParsedElder, ParsedHousehold, ParseResult } from './parser';

// We don't yet store legacyId in the DB (Phase 1 uses name-only matching).
// When we add a legacyId column, this module can prefer that key.

export interface ExistingElder {
  id: string;
  name: string;
  age: number | null;
  hidden: boolean;
}
export interface ExistingHousehold {
  id: string;
  name: string;
  hidden: boolean;
}

export interface ElderChange {
  parsed: ParsedElder;
  existing?: ExistingElder;
  kind: 'add' | 'age-change' | 'unchanged';
  prevAge?: number | null;
}

export interface HouseholdChange {
  parsed: ParsedHousehold;
  existing?: ExistingHousehold;
  kind: 'add' | 'unchanged';
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

export function diffImport(
  parsed: ParseResult,
  existing: { elders: ExistingElder[]; households: ExistingHousehold[] },
): DiffResult {
  const eldersByName = new Map(existing.elders.map((e) => [norm(e.name), e]));
  const householdsByName = new Map(existing.households.map((h) => [norm(h.name), h]));

  const elderChanges: ElderChange[] = [];
  const matchedElderIds = new Set<string>();
  for (const p of parsed.elders) {
    const ex = eldersByName.get(norm(p.name));
    if (!ex) {
      elderChanges.push({ parsed: p, kind: 'add' });
      continue;
    }
    matchedElderIds.add(ex.id);
    if ((ex.age ?? null) !== (p.age ?? null)) {
      elderChanges.push({ parsed: p, existing: ex, kind: 'age-change', prevAge: ex.age });
    } else {
      elderChanges.push({ parsed: p, existing: ex, kind: 'unchanged' });
    }
  }

  const householdChanges: HouseholdChange[] = [];
  const matchedHouseholdIds = new Set<string>();
  for (const p of parsed.households) {
    const ex = householdsByName.get(norm(p.name));
    if (!ex) {
      householdChanges.push({ parsed: p, kind: 'add' });
    } else {
      matchedHouseholdIds.add(ex.id);
      householdChanges.push({ parsed: p, existing: ex, kind: 'unchanged' });
    }
  }

  return {
    elders: elderChanges,
    households: householdChanges,
    orphans: {
      elders: existing.elders.filter((e) => !matchedElderIds.has(e.id) && !e.hidden),
      households: existing.households.filter(
        (h) => !matchedHouseholdIds.has(h.id) && !h.hidden,
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
}

export function summarizeDiff(d: DiffResult): DiffStats {
  return {
    eldersAdded: d.elders.filter((e) => e.kind === 'add').length,
    eldersAgeChanged: d.elders.filter((e) => e.kind === 'age-change').length,
    eldersUnchanged: d.elders.filter((e) => e.kind === 'unchanged').length,
    householdsAdded: d.households.filter((h) => h.kind === 'add').length,
    householdsUnchanged: d.households.filter((h) => h.kind === 'unchanged').length,
    orphanElders: d.orphans.elders.length,
    orphanHouseholds: d.orphans.households.length,
  };
}
