import { describe, expect, it } from 'vitest';
import { diffImport, type ExistingElder, type ExistingHousehold } from './diff';
import { isPlanEmpty, modeUnavailableReason, planImport } from './plan';
import { LcrHtmlParserV1 } from './parser';
import { syntheticHtml, syntheticRosterHtml } from './__fixtures__/synthetic';

const parser = new LcrHtmlParserV1();

// Local state: one assigned elder already known (with a stale age), one household
// already known, plus a person LCR no longer lists.
function existing(): { elders: ExistingElder[]; households: ExistingHousehold[] } {
  return {
    elders: [
      { id: 'db-1', name: 'Alpha, Aaron', age: 41, hidden: false }, // assigned, age stale
      { id: 'db-2', name: 'Hotel, Hank', age: 33, hidden: false }, // unassigned, already here
      { id: 'db-3', name: 'Zulu, Zach', age: 50, hidden: false }, // orphan
    ],
    households: [{ id: 'hd-1', name: 'Carter, Casey', hidden: false }],
  };
}

const rosterDiff = () => diffImport(parser.parse(syntheticRosterHtml()), existing());

describe('planImport', () => {
  it('full mode adds everyone and replaces the board', () => {
    const p = planImport(rosterDiff(), 'full');
    expect(p.replaceStructure).toBe(true);
    expect(p.eldersToAdd.map((e) => e.name)).toEqual([
      'Beta, Brian',
      'Echo, Ethan',
      'Foxtrot, Frank',
      'India, Ivan',
    ]);
    expect(p.householdsToAdd.map((h) => h.name)).toEqual([
      'Delta, Drew',
      'Golf, Greg',
      'Juliet, Jane',
      'Kilo, Kim & Kate',
    ]);
    expect(p.elderAgeUpdates.map((u) => u.name)).toEqual(['Alpha, Aaron']);
  });

  it('people mode adds everyone but leaves the board alone', () => {
    const p = planImport(rosterDiff(), 'people');
    expect(p.replaceStructure).toBe(false);
    expect(p.eldersToAdd).toHaveLength(4);
    expect(p.householdsToAdd).toHaveLength(4);
    expect(p.elderAgeUpdates).toHaveLength(1);
  });

  it('unassigned mode adds only unassigned people and nothing else', () => {
    const p = planImport(rosterDiff(), 'unassigned');
    expect(p.replaceStructure).toBe(false);
    expect(p.eldersToAdd.map((e) => e.name)).toEqual(['India, Ivan']);
    expect(p.householdsToAdd.map((h) => h.name)).toEqual(['Juliet, Jane', 'Kilo, Kim & Kate']);
    expect(p.elderAgeUpdates).toEqual([]);
    expect(p.eldersToAdd.every((e) => e.unassigned)).toBe(true);
    expect(p.householdsToAdd.every((h) => h.unassigned)).toBe(true);
  });

  it('unassigned mode reports what it deliberately skipped', () => {
    const p = planImport(rosterDiff(), 'unassigned');
    // Beta, Echo, Foxtrot are new but assigned in LCR.
    expect(p.skipped.assignedElders).toBe(3);
    // Delta and Golf are new but assigned in LCR.
    expect(p.skipped.assignedHouseholds).toBe(2);
    expect(p.skipped.ageUpdates).toBe(1);
  });

  it('other modes report nothing skipped', () => {
    for (const mode of ['full', 'people'] as const) {
      const p = planImport(rosterDiff(), mode);
      expect(p.skipped).toEqual({ assignedElders: 0, assignedHouseholds: 0, ageUpdates: 0 });
    }
  });

  it('never re-adds a person who already exists locally', () => {
    const p = planImport(rosterDiff(), 'unassigned');
    // Hank is unassigned in LCR but already in the DB — leave him alone.
    expect(p.eldersToAdd.map((e) => e.name)).not.toContain('Hotel, Hank');
  });

  it('unassigned mode plans no writes when the page had no roster', () => {
    const d = diffImport(parser.parse(syntheticHtml()), existing());
    const p = planImport(d, 'unassigned');
    expect(p.eldersToAdd).toEqual([]);
    expect(p.householdsToAdd).toEqual([]);
    expect(isPlanEmpty(p)).toBe(true);
  });
});

describe('isPlanEmpty', () => {
  it('is false when the board would be replaced even with no people to add', () => {
    const d = diffImport(parser.parse(syntheticRosterHtml()), {
      elders: parser.parse(syntheticRosterHtml()).elders.map((e, i) => ({
        id: `x${i}`,
        name: e.name,
        age: e.age,
        hidden: false,
      })),
      households: parser.parse(syntheticRosterHtml()).households.map((h, i) => ({
        id: `y${i}`,
        name: h.name,
        hidden: false,
      })),
    });
    expect(isPlanEmpty(planImport(d, 'full'))).toBe(false);
    expect(isPlanEmpty(planImport(d, 'people'))).toBe(true);
  });
});

describe('modeUnavailableReason', () => {
  it('blocks unassigned mode when the roster is missing', () => {
    expect(modeUnavailableReason('unassigned', { hasEligibleRoster: false })).toMatch(
      /no eligible roster/,
    );
  });

  it('allows every mode when the roster is present', () => {
    for (const mode of ['full', 'people', 'unassigned'] as const) {
      expect(modeUnavailableReason(mode, { hasEligibleRoster: true })).toBeNull();
    }
  });

  it('does not block the other modes without a roster', () => {
    expect(modeUnavailableReason('full', { hasEligibleRoster: false })).toBeNull();
    expect(modeUnavailableReason('people', { hasEligibleRoster: false })).toBeNull();
  });
});
