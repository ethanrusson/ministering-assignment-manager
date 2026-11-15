import { describe, expect, it } from 'vitest';
import { planReviews, type ExistingReview, type ReviewHousehold } from './reviews';

// 0.001° of latitude is about 110 m; 0.0002° about 22 m.
const hh = (id: string, lat: number | null, source: ReviewHousehold['source'] = 'lcr') => ({
  id,
  lat,
  lng: lat === null ? null : 0,
  source: lat === null ? null : source,
});
const review = (id: string, householdId: string, kind: ExistingReview['kind'], status: ExistingReview['status'], data: unknown = {}) => ({
  id,
  householdId,
  kind,
  status,
  data,
});
const moveTo = (lat: number) => ({ from: { lat: 0, lng: 0 }, to: { lat, lng: 0 } });

describe('planReviews', () => {
  it('flags a move beyond the threshold, but not a small correction', () => {
    const plan = planReviews({
      households: [hh('far', 0), hh('near', 0)],
      updates: [
        { id: 'far', lat: 0.001, lng: 0 },
        { id: 'near', lat: 0.0002, lng: 0 },
      ],
      noLcrLocation: [],
      reviews: [],
    });
    expect(plan.insert).toEqual([{ householdId: 'far', kind: 'moved', data: moveTo(0.001) }]);
  });

  it('creates nothing new when the same data is imported again', () => {
    const plan = planReviews({
      households: [hh('a', 0), hh('b', null)],
      updates: [{ id: 'a', lat: 0.001, lng: 0 }],
      noLcrLocation: ['b'],
      reviews: [review('r1', 'a', 'moved', 'open', moveTo(0.001)), review('r2', 'b', 'no_location', 'open')],
    });
    expect(plan).toEqual({ insert: [], update: [], resolve: [], manualReplaced: [] });
  });

  it('keeps a dismissed item dismissed until the household moves somewhere else', () => {
    const dismissed = [review('r', 'a', 'moved', 'dismissed', moveTo(0.001))];
    const same = planReviews({ households: [hh('a', 0)], updates: [{ id: 'a', lat: 0.001, lng: 0 }], noLcrLocation: [], reviews: dismissed });
    expect(same.insert).toEqual([]);
    const again = planReviews({ households: [hh('a', 0)], updates: [{ id: 'a', lat: 0.003, lng: 0 }], noLcrLocation: [], reviews: dismissed });
    expect(again.insert).toEqual([{ householdId: 'a', kind: 'moved', data: moveTo(0.003) }]);
  });

  it('extends an open move to the newest position', () => {
    const plan = planReviews({
      households: [hh('a', 0.001)],
      updates: [{ id: 'a', lat: 0.003, lng: 0 }],
      noLcrLocation: [],
      reviews: [review('r', 'a', 'moved', 'open', moveTo(0.001))],
    });
    expect(plan.update).toEqual([{ id: 'r', data: moveTo(0.003) }]);
    expect(plan.insert).toEqual([]);
  });

  it('flags households with no location anywhere, not hand-placed ones', () => {
    const plan = planReviews({
      households: [hh('none', null), hh('placed', 0, 'manual')],
      updates: [],
      noLcrLocation: ['none', 'placed'],
      reviews: [],
    });
    expect(plan.insert).toEqual([{ householdId: 'none', kind: 'no_location', data: {} }]);
  });

  it('resolves "no location" once LCR provides one, and notes a replaced hand placement', () => {
    const plan = planReviews({
      households: [hh('a', null), hh('b', 0, 'manual')],
      updates: [
        { id: 'a', lat: 0.001, lng: 0 },
        { id: 'b', lat: 0.002, lng: 0 },
      ],
      noLcrLocation: [],
      reviews: [review('r', 'a', 'no_location', 'open')],
    });
    expect(plan.resolve).toEqual([{ id: 'r', resolution: 'located' }]);
    expect(plan.manualReplaced).toEqual(['b']);
    // A hand placement isn't an LCR move.
    expect(plan.insert).toEqual([]);
  });
});
