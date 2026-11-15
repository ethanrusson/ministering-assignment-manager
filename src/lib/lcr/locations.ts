// Plans a location import from the Member Directory (docs/ward-map-prd.md,
// Phase 0 items 4–5). Pure: takes the parsed directory and what's stored, and
// returns the writes to make.
//
// Matching (D4): a stored household's `lcr_uuid` is its head's person UUID, so
// it matches the directory household that lists that person as a member. Rows
// imported before LCR IDs were stored fall back to a unique name match: the
// household's own name ("Surname, Given & Given") or a head's ("Surname, Given").
// Elders link the same way, through any member of a directory household. An
// elder's existing home link is never overwritten, so manual picks stick.

import type { DirectoryHousehold, DirectoryParseResult } from './directory';

export interface LocationHousehold {
  id: string;
  name: string;
  lcrUuid: string | null;
  lat: number | null;
  lng: number | null;
}
export interface LocationElder {
  id: string;
  name: string;
  lcrUuid: string | null;
  homeHouseholdId: string | null;
}

export interface LocationPlan {
  /** Households whose coordinates are new or changed. */
  locationUpdates: { id: string; lat: number; lng: number }[];
  unchanged: number;
  /** Matched in the directory, but the directory has no location for them. */
  noLocation: { id: string; name: string }[];
  notInDirectory: { id: string; name: string }[];
  homeLinks: { elderId: string; householdId: string }[];
  /** Elders still without a home after this import. */
  eldersUnlinked: { id: string; name: string }[];
}

export function planLocationImport(
  parsed: DirectoryParseResult,
  existing: { households: LocationHousehold[]; elders: LocationElder[] },
): LocationPlan {
  const byMemberUuid = new Map<string, DirectoryHousehold>();
  const byMemberName = new Map<string, DirectoryHousehold[]>();
  const byHeadName = new Map<string, DirectoryHousehold[]>();
  const byHouseholdName = new Map<string, DirectoryHousehold[]>();
  for (const d of parsed.households) {
    push(byHouseholdName, normName(d.name), d);
    for (const m of d.members) {
      byMemberUuid.set(m.uuid, d);
      push(byMemberName, normName(m.name), d);
      if (m.head) push(byHeadName, normName(m.name), d);
    }
  }

  const plan: LocationPlan = {
    locationUpdates: [],
    unchanged: 0,
    noLocation: [],
    notInDirectory: [],
    homeLinks: [],
    eldersUnlinked: [],
  };

  // Directory household uuid → stored household id, for linking elders.
  const storedByDirectory = new Map<string, string>();
  for (const h of existing.households) {
    const d = h.lcrUuid
      ? byMemberUuid.get(h.lcrUuid)
      : (unique(byHouseholdName.get(normName(h.name))) ??
        unique(byHeadName.get(normName(h.name))));
    if (!d) {
      plan.notInDirectory.push({ id: h.id, name: h.name });
      continue;
    }
    if (!storedByDirectory.has(d.uuid)) storedByDirectory.set(d.uuid, h.id);
    if (d.lat === null || d.lng === null) {
      plan.noLocation.push({ id: h.id, name: h.name });
    } else if (d.lat === h.lat && d.lng === h.lng) {
      plan.unchanged++;
    } else {
      plan.locationUpdates.push({ id: h.id, lat: d.lat, lng: d.lng });
    }
  }

  for (const e of existing.elders) {
    if (e.homeHouseholdId) continue;
    const d = e.lcrUuid ? byMemberUuid.get(e.lcrUuid) : unique(byMemberName.get(normName(e.name)));
    const householdId = d ? storedByDirectory.get(d.uuid) : undefined;
    if (householdId) plan.homeLinks.push({ elderId: e.id, householdId });
    else plan.eldersUnlinked.push({ id: e.id, name: e.name });
  }

  return plan;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const arr = map.get(key);
  if (arr) arr.push(value);
  else map.set(key, [value]);
}

function unique<T>(arr: T[] | undefined): T | undefined {
  return arr?.length === 1 ? arr[0] : undefined;
}

function normName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}
