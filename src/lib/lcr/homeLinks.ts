// Links elders to the household they live in.
//
// LCR identifies a household by its head's person UUID, so an elder who heads a
// household has the same lcr_uuid as that household. Elders who don't head a
// household (adult children, roommates) are left for a later source or a manual
// pick. An existing link is never overwritten, so manual picks stick.

export interface HomeLinkElder {
  id: string;
  lcrUuid: string | null;
  homeHouseholdId: string | null;
}
export interface HomeLinkHousehold {
  id: string;
  lcrUuid: string | null;
}
export interface HomeLink {
  elderId: string;
  householdId: string;
}

export function homeLinksByHeadOfHousehold(
  elders: HomeLinkElder[],
  households: HomeLinkHousehold[],
): HomeLink[] {
  const householdByUuid = new Map<string, string>();
  for (const h of households) if (h.lcrUuid) householdByUuid.set(h.lcrUuid, h.id);

  const links: HomeLink[] = [];
  for (const e of elders) {
    if (e.homeHouseholdId || !e.lcrUuid) continue;
    const householdId = householdByUuid.get(e.lcrUuid);
    if (householdId) links.push({ elderId: e.id, householdId });
  }
  return links;
}
