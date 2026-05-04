import { describe, expect, it } from 'vitest';
import { diffImport, summarizeDiff, type ExistingElder, type ExistingHousehold } from './diff';
import { LcrHtmlParserV1 } from './parser';
import { syntheticHtml } from './__fixtures__/synthetic';

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
