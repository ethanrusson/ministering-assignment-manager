import { describe, expect, it } from 'vitest';
import { computeFlags, type FlagInput } from './flags';

// 0.001° latitude ≈ 110 m. Companionship c1: elders e1 (home h1) and e2 (home h2).
function input(over: Partial<FlagInput> = {}): FlagInput {
  return {
    households: [
      { id: 'h1', lat: 0, lng: 0, lcrUuid: 'p1', createdAt: '2026-01-01', districtId: null },
      { id: 'h2', lat: 0.002, lng: 0, lcrUuid: 'p2', createdAt: '2026-01-01', districtId: null },
      { id: 'near', lat: 0.003, lng: 0, lcrUuid: 'p3', createdAt: '2026-01-01', districtId: null },
      { id: 'far', lat: 0.01, lng: 0, lcrUuid: 'p4', createdAt: '2026-01-01', districtId: null },
      { id: 'alone', lat: 0.001, lng: 0, lcrUuid: 'p5', createdAt: '2026-01-01', districtId: null },
      { id: 'nowhere', lat: null, lng: null, lcrUuid: 'p6', createdAt: '2026-01-01', districtId: null },
    ],
    elders: [
      { id: 'e1', homeHouseholdId: 'h1', notGenerallyAssigned: false, lcrUuid: 'p1', createdAt: '2026-01-01', districtId: null },
      { id: 'e2', homeHouseholdId: 'h2', notGenerallyAssigned: false, lcrUuid: 'p2', createdAt: '2026-01-01', districtId: null },
      { id: 'free', homeHouseholdId: null, notGenerallyAssigned: false, lcrUuid: 'p7', createdAt: '2026-01-01', districtId: null },
      { id: 'bishop', homeHouseholdId: null, notGenerallyAssigned: true, lcrUuid: 'p8', createdAt: '2026-01-01', districtId: null },
    ],
    companionshipForHousehold: new Map([
      ['near', 'c1'],
      ['far', 'c1'],
      ['nowhere', 'c1'],
      ['h1', 'c2'],
      ['h2', 'c2'],
    ]),
    companionshipForElder: new Map([
      ['e1', 'c1'],
      ['e2', 'c1'],
    ]),
    eldersInCompanionship: new Map([
      ['c1', ['e1', 'e2']],
      ['c2', []],
    ]),
    movedHouseholdIds: new Set(),
    lastImportAt: null,
    acknowledgements: [],
    districtOfCompanionship: new Map([
      ['c1', 'dA'],
      ['c2', null],
    ]),
    boundary: null,
    ...over,
  };
}

describe('household flags', () => {
  it('flags a household with no companionship', () => {
    expect(computeFlags(input()).households.get('alone')).toEqual(['no_companionship']);
  });

  it('flags a household more than 0.5 mi from its ministers’ midpoint', () => {
    const f = computeFlags(input()).households;
    // Midpoint is 0.001° (≈110 m) north; "near" is ≈220 m away, "far" ≈1 km.
    expect(f.has('near')).toBe(false);
    expect(f.get('far')).toEqual(['far_from_ministers']);
  });

  it('skips the distance when no minister home is located', () => {
    // h1 and h2 are ministered by c2, which has no elders.
    const f = computeFlags(input()).households;
    expect(f.has('h1')).toBe(false);
  });

  it('honours an acknowledgement only while the companionship is the same', () => {
    const ack = [{ householdId: 'far', flag: 'far_from_ministers', companionshipId: 'c1' }];
    expect(computeFlags(input({ acknowledgements: ack })).households.has('far')).toBe(false);
    const stale = [{ householdId: 'far', flag: 'far_from_ministers', companionshipId: 'old' }];
    expect(computeFlags(input({ acknowledgements: stale })).households.get('far')).toEqual([
      'far_from_ministers',
    ]);
  });

  it('flags no location and an open "moved" review', () => {
    const f = computeFlags(input({ movedHouseholdIds: new Set(['near']) })).households;
    expect(f.get('nowhere')).toEqual(['no_location']);
    expect(f.get('near')).toEqual(['location_changed']);
  });

  it('marks rows created by the latest import as new, until the next one', () => {
    const rows = input().households.map((h) =>
      h.id === 'near' ? { ...h, createdAt: '2026-11-15T10:00:00Z' } : h,
    );
    const latest = computeFlags(input({ households: rows, lastImportAt: '2026-11-15T09:59:00Z' }));
    expect(latest.households.get('near')).toEqual(['new_since_import']);
    const later = computeFlags(input({ households: rows, lastImportAt: '2026-11-20T00:00:00Z' }));
    expect(later.households.has('near')).toBe(false);
  });

  it('never marks a hand-made household as new', () => {
    const rows = [{ id: 'x', lat: 0, lng: 0, lcrUuid: null, createdAt: '2026-11-16', districtId: null }];
    const f = computeFlags(input({ households: rows, lastImportAt: '2026-11-15' }));
    expect(f.households.get('x')).toEqual(['no_companionship']);
  });
});

describe('district and boundary flags', () => {
  const withDistrict = (id: string, districtId: string | null) =>
    input().households.map((h) => (h.id === id ? { ...h, districtId } : h));

  it('flags a household in a different district from its companionship', () => {
    expect(computeFlags(input({ households: withDistrict('near', 'dB') })).households.get('near')).toEqual([
      'other_district',
    ]);
    expect(computeFlags(input({ households: withDistrict('near', 'dA') })).households.has('near')).toBe(false);
  });

  it('skips it when either district is missing, or it is acknowledged for this companionship', () => {
    // c2 (h1's companionship) has no district.
    expect(computeFlags(input({ households: withDistrict('h1', 'dB') })).households.has('h1')).toBe(false);
    const ack = [{ householdId: 'near', flag: 'other_district', companionshipId: 'c1' }];
    expect(
      computeFlags(input({ households: withDistrict('near', 'dB'), acknowledgements: ack })).households.has('near'),
    ).toBe(false);
  });

  it('flags households outside the saved boundary, only once one exists', () => {
    // A box around latitudes 0–0.005: "far" (0.01) is outside.
    const boundary = [
      { lat: -0.001, lng: -0.001 },
      { lat: -0.001, lng: 0.001 },
      { lat: 0.005, lng: 0.001 },
      { lat: 0.005, lng: -0.001 },
    ];
    const f = computeFlags(input({ boundary })).households;
    expect(f.get('far')).toEqual(['far_from_ministers', 'outside_ward']);
    expect(f.get('near')).toBeUndefined();
    expect(computeFlags(input()).households.get('far')).toEqual(['far_from_ministers']);
  });
});

describe('elder flags', () => {
  it('flags an elder without a companionship, unless not generally assigned', () => {
    const f = computeFlags(input()).elders;
    expect(f.get('free')).toEqual(['no_companionship']);
    expect(f.get('bishop')).toEqual(['not_generally_assigned']);
    expect(f.has('e1')).toBe(false);
  });
});
