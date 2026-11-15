// Location review items a location import creates (docs/ward-map-prd.md,
// Phase 2). Pure: takes the households as stored before the import, what LCR
// says now, and the reviews already on file; returns the writes to make.
//
//   no_location  a household with no location anywhere: LCR has none (or
//                doesn't list it) and nothing was placed by hand.
//   moved        an LCR location that changed by more than MOVED_THRESHOLD_M.
//                The new position is applied; the review records old → new.
//
// Re-importing the same data creates nothing new. A dismissed item stays
// dismissed until the data behind it changes (a different "moved to").

import type { LocationReviewKind, LocationReviewStatus, LocationSource } from '@/types/database';
import { distance, project, type LatLng } from '@/map/geo';

export const MOVED_THRESHOLD_M = 50;

export interface ReviewHousehold {
  id: string;
  lat: number | null;
  lng: number | null;
  source: LocationSource | null;
}

export interface MovedData {
  from: LatLng;
  to: LatLng;
}

export interface ExistingReview {
  id: string;
  householdId: string;
  kind: LocationReviewKind;
  status: LocationReviewStatus;
  data: unknown;
}

export interface ReviewPlan {
  insert: { householdId: string; kind: LocationReviewKind; data: MovedData | Record<string, never> }[];
  /** Open "moved" items whose household moved again: same "from", new "to". */
  update: { id: string; data: MovedData }[];
  resolve: { id: string; resolution: string }[];
  /** Hand-placed households whose location LCR now provides (D2). */
  manualReplaced: string[];
}

export function planReviews(input: {
  households: ReviewHousehold[];
  /** New LCR coordinates for matched households. */
  updates: { id: string; lat: number; lng: number }[];
  /** Households LCR gives no location for, including ones it doesn't list. */
  noLcrLocation: string[];
  reviews: ExistingReview[];
}): ReviewPlan {
  const plan: ReviewPlan = { insert: [], update: [], resolve: [], manualReplaced: [] };
  const byId = new Map(input.households.map((h) => [h.id, h]));
  const reviewsFor = (id: string, kind: LocationReviewKind) =>
    input.reviews.filter((r) => r.householdId === id && r.kind === kind);

  for (const u of input.updates) {
    const h = byId.get(u.id);
    if (!h) continue;
    for (const r of reviewsFor(h.id, 'no_location')) {
      if (r.status === 'open') plan.resolve.push({ id: r.id, resolution: 'located' });
    }
    if (h.source === 'manual') plan.manualReplaced.push(h.id);
    if (h.lat === null || h.lng === null || h.source !== 'lcr') continue;

    const from = { lat: h.lat, lng: h.lng };
    const to = { lat: u.lat, lng: u.lng };
    if (metersBetween(from, to) <= MOVED_THRESHOLD_M) continue;
    const moved = reviewsFor(h.id, 'moved');
    const open = moved.find((r) => r.status === 'open');
    if (open) {
      const data = open.data as MovedData;
      if (!sameSpot(data.to, to)) plan.update.push({ id: open.id, data: { from: data.from, to } });
    } else if (!moved.some((r) => sameSpot((r.data as MovedData)?.to, to))) {
      plan.insert.push({ householdId: h.id, kind: 'moved', data: { from, to } });
    }
  }

  for (const id of input.noLcrLocation) {
    const h = byId.get(id);
    if (!h || h.lat !== null) continue;
    const seen = reviewsFor(id, 'no_location').some((r) => r.status !== 'resolved');
    if (!seen) plan.insert.push({ householdId: id, kind: 'no_location', data: {} });
  }

  return plan;
}

function metersBetween(a: LatLng, b: LatLng): number {
  return distance({ x: 0, y: 0 }, project(b, a));
}

function sameSpot(a: LatLng | undefined, b: LatLng): boolean {
  return !!a && a.lat === b.lat && a.lng === b.lng;
}
