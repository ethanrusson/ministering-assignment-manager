import { describe, expect, it } from 'vitest';
import { LcrHtmlParserV1 } from '@/lib/lcr/parser';

// Excerpt using the exact key names from the live LCR ministering page.
const REAL = {
  props: { pageProps: { initialState: { ministeringData: {
    loading: false,
    eligibleMinistersAndAssignments: {
      eligibleMinisters: [
        { personUuid: '9155201d', legacyCmisId: 2250957938, name: 'Alba, Joel', nameOrder: 3,
          priesthoodOffice: 'ELDER', age: 40, unitOrgs: ['x'], email: 'a@b.c',
          notGenerallyAssigned: false, spouse: { name: 'Alba, Jessica' } },
        { personUuid: 'd75024ab', legacyCmisId: 8159440650, name: 'Byington, Kutler',
          priesthoodOffice: 'ELDER', age: 27, email: null, notGenerallyAssigned: false },
        { personUuid: 'f44d6b39', legacyCmisId: 463571987, name: 'Gull, Cameron',
          priesthoodOffice: 'HIGH_PRIEST', age: 54, email: null, notGenerallyAssigned: true },
      ],
      eligibleAssignments: [
        { personUuid: '9155201d', legacyCmisId: 2250957938, name: 'Alba, Joel & Jessica', nameOrder: 3, email: 'a@b.c' },
        { personUuid: '40ba2706', legacyCmisId: 8414491796, name: 'Byington, Kutler & Brooklyn', nameOrder: 82, email: null },
        { personUuid: '9dd89ff8', legacyCmisId: 1630454916, name: 'Byram, Jane', nameOrder: 84, email: null },
      ],
    },
    elders: [{
      districtName: 'District 1', districtUuid: '381fbd5a',
      supervisorName: 'Russon, Ethan Neal',
      companionships: [{
        id: 'e4de5805',
        ministers: [
          { age: 40, assignType: 'EQ', email: 'a@b.c', legacyCmisId: 2250957938,
            name: 'Alba, Joel', personUuid: '9155201d', priesthoodOffice: 'ELDER' },
        ],
        assignments: [
          { age: 78, assignType: 'EQ', legacyCmisId: 1630454916, name: 'Byram, Jane',
            personUuid: '9dd89ff8' },
        ],
      }],
    }],
  } } } },
};

describe('real LCR page shape', () => {
  it('separates assigned from unassigned using the live key names', () => {
    const r = new LcrHtmlParserV1().parse(JSON.stringify(REAL));
    expect(r.hasEligibleRoster).toBe(true);
    expect(r.warnings).toEqual([]);

    // Joel is a minister -> assigned. Kutler & Cameron are roster-only -> unassigned.
    expect(r.elders.filter((e) => e.unassigned).map((e) => e.name).sort())
      .toEqual(['Byington, Kutler', 'Gull, Cameron']);
    expect(r.elders.find((e) => e.name === 'Alba, Joel')!.unassigned).toBe(false);
    expect(r.elders.find((e) => e.name === 'Gull, Cameron')!.notGenerallyAssigned).toBe(true);

    // Jane Byram is an assignment -> assigned. The two households are roster-only.
    expect(r.households.filter((h) => h.unassigned).map((h) => h.name).sort())
      .toEqual(['Alba, Joel & Jessica', 'Byington, Kutler & Brooklyn']);
    expect(r.households.find((h) => h.name === 'Byram, Jane')!.unassigned).toBe(false);

    // A person can be an elder AND a household head under different uuids.
    expect(r.elders).toHaveLength(3);
    expect(r.households).toHaveLength(3);
    expect(r.companionships).toHaveLength(1);
  });
});
