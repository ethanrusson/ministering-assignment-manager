// Flags: issues the app detects from the data (docs/ward-map-prd.md, Phases 3
// and 6). Never edited directly; a flag goes away when its data changes, and
// "far from ministers" and "ministered from another district" can also be
// acknowledged. Pure, like validation.ts beside it.
//
// "Ministered from another district" needs households to have districts
// (Phase 6), and "Outside ward" needs a saved ward boundary.

import { distance, project, type LatLng } from '@/map/geo';

export type HouseholdFlag =
  | 'no_companionship'
  | 'far_from_ministers'
  | 'no_location'
  | 'location_changed'
  | 'new_since_import'
  | 'other_district'
  | 'outside_ward';

export type ElderFlag = 'no_companionship' | 'not_generally_assigned' | 'new_since_import';

/** Straight-line distance from the ministers' midpoint beyond which a household is "far" (0.5 mi). */
export const FAR_FROM_MINISTERS_M = 804.672;

export const HOUSEHOLD_FLAG_LABELS: Record<HouseholdFlag, string> = {
  no_companionship: 'No companionship',
  far_from_ministers: 'Far from ministers',
  no_location: 'No location',
  location_changed: 'Location changed',
  new_since_import: 'New since last import',
  other_district: 'Ministered from another district',
  outside_ward: 'Outside ward',
};

export const ELDER_FLAG_LABELS: Record<ElderFlag, string> = {
  no_companionship: 'Elder without companionship',
  not_generally_assigned: 'Not generally assigned',
  new_since_import: 'New elder since last import',
};

export interface FlagHousehold {
  id: string;
  lat: number | null;
  lng: number | null;
  lcrUuid: string | null;
  createdAt: string;
  /** households.district_id; null when it has none. */
  districtId: string | null;
}

export interface FlagElder {
  id: string;
  homeHouseholdId: string | null;
  notGenerallyAssigned: boolean;
  lcrUuid: string | null;
  createdAt: string;
}

export interface FlagInput {
  households: FlagHousehold[];
  elders: FlagElder[];
  companionshipForHousehold: Map<string, string>;
  companionshipForElder: Map<string, string>;
  eldersInCompanionship: Map<string, string[]>;
  /** Households with an open "moved" location review. */
  movedHouseholdIds: Set<string>;
  /** When the most recent ministering import ran, if any. */
  lastImportAt: string | null;
  acknowledgements: { householdId: string; flag: string; companionshipId: string }[];
  /** Companionship id → its district id. */
  districtOfCompanionship: Map<string, string | null>;
  /** The saved ward boundary, if any. */
  boundary: LatLng[] | null;
}

export interface Flags {
  households: Map<string, HouseholdFlag[]>;
  elders: Map<string, ElderFlag[]>;
}

export function computeFlags(input: FlagInput): Flags {
  const located = new Map<string, LatLng>();
  for (const h of input.households) {
    if (h.lat !== null && h.lng !== null) located.set(h.id, { lat: h.lat, lng: h.lng });
  }
  const homeOf = new Map<string, string>();
  for (const e of input.elders) if (e.homeHouseholdId) homeOf.set(e.id, e.homeHouseholdId);
  const isNew = (r: { lcrUuid: string | null; createdAt: string }) =>
    !!input.lastImportAt && !!r.lcrUuid && r.createdAt >= input.lastImportAt;
  const acked = (householdId: string, flag: string, comp: string) =>
    input.acknowledgements.some(
      (a) => a.householdId === householdId && a.flag === flag && a.companionshipId === comp,
    );

  const households = new Map<string, HouseholdFlag[]>();
  for (const h of input.households) {
    const flags: HouseholdFlag[] = [];
    const comp = input.companionshipForHousehold.get(h.id);
    if (!comp) flags.push('no_companionship');
    const here = located.get(h.id);
    if (!here) flags.push('no_location');
    if (comp && here) {
      const far = distanceToMinisters(here, comp, input, homeOf, located);
      if (far !== null && far > FAR_FROM_MINISTERS_M && !acked(h.id, 'far_from_ministers', comp)) {
        flags.push('far_from_ministers');
      }
    }
    const compDistrict = comp ? input.districtOfCompanionship.get(comp) : null;
    if (comp && h.districtId && compDistrict && h.districtId !== compDistrict && !acked(h.id, 'other_district', comp)) {
      flags.push('other_district');
    }
    if (here && input.boundary && !insidePolygon(here, input.boundary)) flags.push('outside_ward');
    if (input.movedHouseholdIds.has(h.id)) flags.push('location_changed');
    if (isNew(h)) flags.push('new_since_import');
    if (flags.length) households.set(h.id, flags);
  }

  const elders = new Map<string, ElderFlag[]>();
  for (const e of input.elders) {
    const flags: ElderFlag[] = [];
    if (e.notGenerallyAssigned) flags.push('not_generally_assigned');
    else if (!input.companionshipForElder.has(e.id)) flags.push('no_companionship');
    if (isNew(e)) flags.push('new_since_import');
    if (flags.length) elders.set(e.id, flags);
  }

  return { households, elders };
}

/** Ray casting on lat/lng, which is fine at ward scale. */
export function insidePolygon(p: LatLng, ring: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.lat > p.lat !== b.lat > p.lat && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng) {
      inside = !inside;
    }
  }
  return inside;
}

/** The midpoint of a companionship's ministers' homes; null if none is located. */
export function ministersHub(
  companionshipId: string,
  eldersInCompanionship: Map<string, string[]>,
  homeOf: Map<string, string>,
  located: Map<string, LatLng>,
): LatLng | null {
  const homes = (eldersInCompanionship.get(companionshipId) ?? [])
    .map((e) => homeOf.get(e))
    .map((h) => (h ? located.get(h) : undefined))
    .filter((p): p is LatLng => !!p);
  if (!homes.length) return null;
  return {
    lat: homes.reduce((s, p) => s + p.lat, 0) / homes.length,
    lng: homes.reduce((s, p) => s + p.lng, 0) / homes.length,
  };
}

/** Straight-line meters between two lat/lng points. */
export function metersBetween(a: LatLng, b: LatLng): number {
  return distance({ x: 0, y: 0 }, project(b, a));
}

/** Meters from a household to the midpoint of its ministers' homes; null if none is located. */
export function distanceToMinisters(
  here: LatLng,
  companionshipId: string,
  input: Pick<FlagInput, 'eldersInCompanionship'>,
  homeOf: Map<string, string>,
  located: Map<string, LatLng>,
): number | null {
  const hub = ministersHub(companionshipId, input.eldersInCompanionship, homeOf, located);
  return hub ? metersBetween(hub, here) : null;
}
