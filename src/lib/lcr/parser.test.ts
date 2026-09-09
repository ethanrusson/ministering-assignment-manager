import { describe, expect, it } from 'vitest';
import { LcrHtmlParserV1, extractNextDataJson } from './parser';
import {
  SYNTHETIC_NEXT_DATA,
  syntheticHtml,
  syntheticRosterHtml,
  syntheticViewSourceHtml,
} from './__fixtures__/synthetic';

const parser = new LcrHtmlParserV1();

describe('LcrHtmlParserV1', () => {
  it('parses saved-page HTML with __NEXT_DATA__', () => {
    const result = parser.parse(syntheticHtml());
    expect(result.districts).toHaveLength(2);
    expect(result.districts[0].name).toBe('District 1');
    expect(result.elders.map((e) => e.name)).toEqual([
      'Alpha, Aaron',
      'Beta, Brian',
      'Echo, Ethan',
      'Foxtrot, Frank',
    ]);
    expect(result.households.map((h) => h.name)).toEqual([
      'Carter, Casey',
      'Delta, Drew',
      'Golf, Greg',
    ]);
    const c1 = result.companionships.find((c) => c.legacyId === 'c-1')!;
    expect(c1.elderLegacyIds).toEqual(['e-1', 'e-2']);
    expect(c1.householdLegacyIds).toEqual(['h-1', 'h-2']);
    expect(c1.districtLegacyId).toBe('d-1');
  });

  it('parses Chrome view-source HTML', () => {
    const result = parser.parse(syntheticViewSourceHtml());
    expect(result.elders).toHaveLength(4);
    expect(result.households).toHaveLength(3);
  });

  it('parses raw __NEXT_DATA__ JSON pasted directly', () => {
    const result = parser.parse(JSON.stringify(SYNTHETIC_NEXT_DATA));
    expect(result.elders).toHaveLength(4);
  });

  it('preserves null age', () => {
    const result = parser.parse(syntheticHtml());
    const frank = result.elders.find((e) => e.name === 'Foxtrot, Frank')!;
    expect(frank.age).toBeNull();
  });

  it('marks 17-year-old elder with age', () => {
    const result = parser.parse(syntheticHtml());
    const brian = result.elders.find((e) => e.name === 'Beta, Brian')!;
    expect(brian.age).toBe(17);
  });

  it('throws a useful message when input has no ministering data', () => {
    expect(() => parser.parse('<html><body>nope</body></html>')).toThrowError(
      /Could not find ministering data/,
    );
  });
});

describe('extractNextDataJson', () => {
  it('finds the script in normal HTML', () => {
    const json = extractNextDataJson(syntheticHtml());
    expect(json).toBeTruthy();
    expect(JSON.parse(json!)).toEqual(SYNTHETIC_NEXT_DATA);
  });

  it('finds the script in view-source HTML', () => {
    const json = extractNextDataJson(syntheticViewSourceHtml());
    expect(json).toBeTruthy();
    expect(JSON.parse(json!)).toEqual(SYNTHETIC_NEXT_DATA);
  });
});

describe('LcrHtmlParserV1 eligible roster', () => {
  it('imports unassigned elders and households from the eligible roster', () => {
    const result = parser.parse(syntheticRosterHtml());
    expect(result.hasEligibleRoster).toBe(true);

    const unassignedElders = result.elders.filter((e) => e.unassigned).map((e) => e.name);
    expect(unassignedElders).toEqual(['Hotel, Hank', 'India, Ivan']);

    const unassignedHouseholds = result.households.filter((h) => h.unassigned).map((h) => h.name);
    expect(unassignedHouseholds).toEqual(['Juliet, Jane', 'Kilo, Kim & Kate']);
  });

  it('keeps assigned people marked as assigned', () => {
    const result = parser.parse(syntheticRosterHtml());
    expect(result.elders.find((e) => e.name === 'Alpha, Aaron')!.unassigned).toBe(false);
    expect(result.households.find((h) => h.name === 'Carter, Casey')!.unassigned).toBe(false);
  });

  it('merges roster data into people already found in a companionship', () => {
    const result = parser.parse(syntheticRosterHtml());
    // Echo is assigned, but LCR flags him as not generally assigned.
    const echo = result.elders.find((e) => e.name === 'Echo, Ethan')!;
    expect(echo.unassigned).toBe(false);
    expect(echo.notGenerallyAssigned).toBe(true);
    // Frank's companionship record has a null age; the roster fills it in.
    const frank = result.elders.find((e) => e.name === 'Foxtrot, Frank')!;
    expect(frank.age).toBe(55);
  });

  it('still finds every assigned companionship link', () => {
    const result = parser.parse(syntheticRosterHtml());
    expect(result.companionships).toHaveLength(3);
    expect(result.districts).toHaveLength(2);
    const c1 = result.companionships.find((c) => c.legacyId === 'c-1')!;
    expect(c1.elderLegacyIds).toEqual(['e-1', 'e-2']);
  });

  it('does not report an unassigned person twice', () => {
    const result = parser.parse(syntheticRosterHtml());
    expect(new Set(result.elders.map((e) => e.legacyId)).size).toBe(result.elders.length);
    expect(result.elders).toHaveLength(6);
    expect(result.households).toHaveLength(5);
  });

  it('warns and imports nothing extra when the page has no roster', () => {
    const result = parser.parse(syntheticHtml());
    expect(result.hasEligibleRoster).toBe(false);
    expect(result.elders.every((e) => !e.unassigned)).toBe(true);
    expect(result.households.every((h) => !h.unassigned)).toBe(true);
    expect(result.warnings.join(' ')).toMatch(/no eligible roster/);
  });
});
