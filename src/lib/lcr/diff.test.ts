import { describe, expect, it } from 'vitest';
import { diffImport, summarizeDiff, type ExistingElder, type ExistingHousehold } from './diff';
import { LcrHtmlParserV1 } from './parser';
import { syntheticHtml, syntheticRosterHtml } from './__fixtures__/synthetic';

const parser = new LcrHtmlParserV1();

function existing(): { elders: ExistingElder[]; households: ExistingHousehold[] } {
  return {
    elders: [
      { id: 'db-1', name: 'Alpha, Aaron', age: 41, hidden: false }, // age changed
      { id: 'db-2', name: 'Echo, Ethan', age: 28, hidden: false }, // unchanged
      { id: 'db-3', name: 'Zulu, Zach', age: 50, hidden: false }, // orphan
      { id: 'db-4', name: 'Hidden, Hank', age: 30, hidden: true }, // orphan but hidden
    ],
    households: [
      { id: 'hd-1', name: 'Carter, Casey', hidden: false }, // unchanged
      { id: 'hd-2', name: 'Old, Otis', hidden: false }, // orphan
    ],
  };
}

describe('diffImport', () => {
  it('classifies adds, age changes, unchanged, and orphans', () => {
    const parsed = parser.parse(syntheticHtml());
    const d = diffImport(parsed, existing());

    const adds = d.elders.filter((e) => e.kind === 'add').map((e) => e.parsed.name);
    expect(adds).toEqual(['Beta, Brian', 'Foxtrot, Frank']);

    const ageChange = d.elders.find((e) => e.kind === 'age-change')!;
    expect(ageChange.parsed.name).toBe('Alpha, Aaron');
    expect(ageChange.prevAge).toBe(41);
    expect(ageChange.parsed.age).toBe(42);

    expect(d.orphans.elders.map((e) => e.name)).toEqual(['Zulu, Zach']);
    expect(d.orphans.households.map((h) => h.name)).toEqual(['Old, Otis']);
  });

  it('matches by case-insensitive trimmed name', () => {
    const parsed = parser.parse(syntheticHtml());
    const ex = existing();
    ex.elders[0].name = '  alpha, aaron '; // sloppy whitespace + casing
    const d = diffImport(parsed, ex);
    const a = d.elders.find((e) => e.parsed.name === 'Alpha, Aaron')!;
    expect(a.kind).toBe('age-change');
  });

  it('summarize counts each bucket', () => {
    const parsed = parser.parse(syntheticHtml());
    const stats = summarizeDiff(diffImport(parsed, existing()));
    expect(stats.eldersAdded).toBe(2);
    expect(stats.eldersAgeChanged).toBe(1);
    expect(stats.eldersUnchanged).toBe(1);
    expect(stats.householdsAdded).toBe(2);
    expect(stats.householdsUnchanged).toBe(1);
    expect(stats.orphanElders).toBe(1);
    expect(stats.orphanHouseholds).toBe(1);
  });
});

describe('diffImport with LCR IDs', () => {
  const parsed = () => parser.parse(syntheticHtml());
  const rosterParsed = () => parser.parse(syntheticRosterHtml());

  it('matches by LCR ID even after a rename, and carries the new name', () => {
    const d = diffImport(parsed(), {
      elders: [{ id: 'db-1', name: 'Alpha, Aaron (old)', age: 42, hidden: false, lcrUuid: 'e-1' }],
      households: [],
    });
    const a = d.elders.find((e) => e.parsed.legacyId === 'e-1')!;
    expect(a.kind).toBe('unchanged');
    expect(a.matchedBy).toBe('uuid');
    expect(a.identity).toEqual({ name: 'Alpha, Aaron' });
    expect(d.orphans.elders).toEqual([]);
  });

  it('links an existing row by name and stores its LCR ID', () => {
    const d = diffImport(parsed(), {
      elders: [{ id: 'db-1', name: 'Alpha, Aaron', age: 42, hidden: false }],
      households: [{ id: 'hd-1', name: 'Carter, Casey', hidden: false, lcrUuid: null }],
    });
    const a = d.elders.find((e) => e.parsed.legacyId === 'e-1')!;
    expect(a.matchedBy).toBe('name');
    expect(a.identity).toEqual({ lcr_uuid: 'e-1' });
    const h = d.households.find((x) => x.parsed.legacyId === 'h-1')!;
    expect(h.identity).toEqual({ lcr_uuid: 'h-1' });
  });

  it('writes nothing for a row already linked with the same name', () => {
    const d = diffImport(parsed(), {
      elders: [{ id: 'db-1', name: 'Alpha, Aaron', age: 42, hidden: false, lcrUuid: 'e-1' }],
      households: [],
    });
    expect(d.elders.find((e) => e.parsed.legacyId === 'e-1')!.identity).toBeUndefined();
  });

  it('does not name-match a namesake who is already linked to a different ID', () => {
    const d = diffImport(parsed(), {
      elders: [{ id: 'db-9', name: 'Alpha, Aaron', age: 70, hidden: false, lcrUuid: 'someone-else' }],
      households: [],
    });
    expect(d.elders.find((e) => e.parsed.legacyId === 'e-1')!.kind).toBe('add');
    expect(d.orphans.elders.map((e) => e.id)).toEqual(['db-9']);
  });

  it('leaves a name alone when it matches several unlinked rows', () => {
    const d = diffImport(parsed(), {
      elders: [
        { id: 'db-1', name: 'Alpha, Aaron', age: 42, hidden: false },
        { id: 'db-2', name: 'alpha, aaron', age: 12, hidden: false },
      ],
      households: [],
    });
    const a = d.elders.find((e) => e.parsed.legacyId === 'e-1')!;
    expect(a.kind).toBe('ambiguous');
    expect(a.identity).toBeUndefined();
    // Neither duplicate is reported as missing from LCR.
    expect(d.orphans.elders).toEqual([]);
    expect(summarizeDiff(d).ambiguous).toBe(1);
  });

  it('records "not generally assigned" only when the page has the roster', () => {
    const ex = () => ({
      elders: [{ id: 'db-3', name: 'Echo, Ethan', age: 28, hidden: false, lcrUuid: 'e-3' }],
      households: [],
    });
    const withRoster = diffImport(rosterParsed(), ex());
    expect(withRoster.elders.find((e) => e.parsed.legacyId === 'e-3')!.identity).toEqual({
      not_generally_assigned: true,
    });

    // Without the roster every elder parses as false; a stored true must survive.
    const stored = ex();
    (stored.elders[0] as ExistingElder).notGenerallyAssigned = true;
    const noRoster = diffImport(parsed(), stored);
    expect(noRoster.elders.find((e) => e.parsed.legacyId === 'e-3')!.identity).toBeUndefined();
  });

  it('counts newly linked and renamed people', () => {
    const d = diffImport(parsed(), {
      elders: [
        { id: 'db-1', name: 'Alpha, Aaron', age: 42, hidden: false },
        { id: 'db-3', name: 'Echo, E.', age: 28, hidden: false, lcrUuid: 'e-3' },
      ],
      households: [{ id: 'hd-1', name: 'Carter, Casey', hidden: false }],
    });
    const s = summarizeDiff(d);
    expect(s.newlyLinked).toBe(2);
    expect(s.renamed).toBe(1);
  });
});
