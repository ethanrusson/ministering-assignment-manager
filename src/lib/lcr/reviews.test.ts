import { describe, expect, it } from 'vitest';
import { planOutsideWard, planReviews, type ExistingReview, type ReviewHousehold } from './reviews';

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

describe('planOutsideWard', () => {
  const boundary = [
    { lat: -1, lng: -1 },
    { lat: -1, lng: 1 },
    { lat: 1, lng: 1 },
    { lat: 1, lng: -1 },
  ];
  const at = (lat: number) => ({ lat, lng: 0 });

  it('flags a location outside the boundary once', () => {
    const plan = planOutsideWard({ households: [{ id: 'a', at: at(2) }, { id: 'b', at: at(0) }], boundary, reviews: [] });
    expect(plan.insert).toEqual([{ householdId: 'a', kind: 'outside_ward', data: { at: at(2) } }]);
    const again = planOutsideWard({
      households: [{ id: 'a', at: at(2) }],
      boundary,
      reviews: [review('r', 'a', 'outside_ward', 'open', { at: at(2) })],
    });
    expect(again.insert).toEqual([]);
  });

  it('keeps a dismissed item dismissed until the household moves', () => {
    const reviews = [review('r', 'a', 'outside_ward', 'dismissed', { at: at(2) })];
    expect(planOutsideWard({ households: [{ id: 'a', at: at(2) }], boundary, reviews }).insert).toEqual([]);
    expect(planOutsideWard({ households: [{ id: 'a', at: at(3) }], boundary, reviews }).insert).toHaveLength(1);
  });

  it('resolves an open item once the household is inside', () => {
    const plan = planOutsideWard({
      households: [{ id: 'a', at: at(0) }],
      boundary,
      reviews: [review('r', 'a', 'outside_ward', 'open', { at: at(2) })],
    });
    expect(plan.resolve).toEqual([{ id: 'r', resolution: 'inside' }]);
  });

  it('runs inside a location import against the new positions', () => {
    const plan = planReviews({
      households: [hh('a', 0)],
      updates: [{ id: 'a', lat: 2, lng: 0 }],
      noLcrLocation: [],
      reviews: [],
      boundary,
    });
    expect(plan.insert.map((r) => r.kind)).toEqual(['moved', 'outside_ward']);
  });
});
