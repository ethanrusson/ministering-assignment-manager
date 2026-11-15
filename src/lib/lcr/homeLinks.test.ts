import { describe, expect, it } from 'vitest';
import { homeLinksByHeadOfHousehold } from './homeLinks';

describe('homeLinksByHeadOfHousehold', () => {
  const households = [
    { id: 'hh-a', lcrUuid: 'p-1' },
    { id: 'hh-b', lcrUuid: 'p-2' },
    { id: 'hh-c', lcrUuid: null },
  ];

  it('links an elder to the household they head', () => {
    expect(
      homeLinksByHeadOfHousehold([{ id: 'e-1', lcrUuid: 'p-1', homeHouseholdId: null }], households),
    ).toEqual([{ elderId: 'e-1', householdId: 'hh-a' }]);
  });

  it('never overrides an existing home', () => {
    expect(
      homeLinksByHeadOfHousehold([{ id: 'e-1', lcrUuid: 'p-1', homeHouseholdId: 'hh-b' }], households),
    ).toEqual([]);
  });

  it('skips elders who head no household or have no LCR ID', () => {
    expect(
      homeLinksByHeadOfHousehold(
        [
          { id: 'e-2', lcrUuid: 'p-9', homeHouseholdId: null },
          { id: 'e-3', lcrUuid: null, homeHouseholdId: null },
        ],
        households,
      ),
    ).toEqual([]);
  });
});
