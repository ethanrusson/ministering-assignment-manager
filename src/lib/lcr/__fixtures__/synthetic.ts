// Synthesized LCR __NEXT_DATA__ payload — shape mirrors the live page.
// No real PII. Used by parser/diff tests.

export const SYNTHETIC_NEXT_DATA = {
  props: {
    pageProps: {
      initialState: {
        ministeringData: {
          elders: [
            {
              districtUuid: 'd-1',
              districtName: 'District 1',
              companionships: [
                {
                  id: 'c-1',
                  ministers: [
                    { personUuid: 'e-1', name: 'Alpha, Aaron', age: 42 },
                    { personUuid: 'e-2', name: 'Beta, Brian', age: 17 },
                  ],
                  assignments: [
                    { personUuid: 'h-1', name: 'Carter, Casey', age: 60 },
                    { personUuid: 'h-2', name: 'Delta, Drew', age: 35 },
                  ],
                },
                {
                  id: 'c-2',
                  ministers: [{ personUuid: 'e-3', name: 'Echo, Ethan', age: 28 }],
                  assignments: [],
                },
              ],
            },
            {
              districtUuid: 'd-2',
              districtName: 'District 2',
              companionships: [
                {
                  id: 'c-3',
                  ministers: [
                    { personUuid: 'e-4', name: 'Foxtrot, Frank', age: null },
                  ],
                  assignments: [
                    { personUuid: 'h-3', name: 'Golf, Greg' },
                  ],
                },
              ],
            },
          ],
        },
      },
    },
  },
};

export function syntheticHtml(): string {
  return `<!doctype html><html><head><title>x</title></head><body>
    <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(SYNTHETIC_NEXT_DATA)}</script>
  </body></html>`;
}

/** Mimics Chrome's view-source rendering (markup-as-text inside line cells). */
export function syntheticViewSourceHtml(): string {
  const json = JSON.stringify(SYNTHETIC_NEXT_DATA);
  // The body's textContent will be the original markup with the JSON inline.
  return `<!doctype html><html><body><table><tbody><tr>
    <td class="line-content">&lt;script id="__NEXT_DATA__" type="application/json"&gt;${json}&lt;/script&gt;</td>
  </tr></tbody></table></body></html>`;
}

/**
 * Same ward, but with the eligible roster LCR ships alongside the districts.
 * Adds two elders and two households that no companionship references, plus one
 * already-assigned elder flagged `notGenerallyAssigned`.
 */
export const SYNTHETIC_NEXT_DATA_WITH_ROSTER = {
  props: {
    pageProps: {
      initialState: {
        ministeringData: {
          eligibleMinistersAndAssignments: {
            eligibleMinisters: [
              // Already assigned in a companionship.
              { personUuid: 'e-1', name: 'Alpha, Aaron', age: 42, notGenerallyAssigned: false },
              { personUuid: 'e-2', name: 'Beta, Brian', age: 17, notGenerallyAssigned: false },
              { personUuid: 'e-3', name: 'Echo, Ethan', age: 28, notGenerallyAssigned: true },
              // Age missing on the companionship record, present here.
              { personUuid: 'e-4', name: 'Foxtrot, Frank', age: 55, notGenerallyAssigned: false },
              // Never referenced by a companionship — unassigned.
              { personUuid: 'e-5', name: 'Hotel, Hank', age: 33, notGenerallyAssigned: false },
              { personUuid: 'e-6', name: 'India, Ivan', age: null, notGenerallyAssigned: true },
            ],
            eligibleAssignments: [
              { personUuid: 'h-1', name: 'Carter, Casey' },
              { personUuid: 'h-2', name: 'Delta, Drew' },
              { personUuid: 'h-3', name: 'Golf, Greg' },
              // Never referenced by a companionship — unassigned.
              { personUuid: 'h-4', name: 'Juliet, Jane' },
              { personUuid: 'h-5', name: 'Kilo, Kim & Kate' },
            ],
          },
          elders: SYNTHETIC_NEXT_DATA.props.pageProps.initialState.ministeringData.elders,
        },
      },
    },
  },
};

export function syntheticRosterHtml(): string {
  return `<!doctype html><html><head><title>x</title></head><body>
    <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(SYNTHETIC_NEXT_DATA_WITH_ROSTER)}</script>
  </body></html>`;
}
