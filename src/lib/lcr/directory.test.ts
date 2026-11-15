import { describe, expect, it } from 'vitest';
import { parseDirectory } from './directory';
import { planLocationImport, type LocationElder, type LocationHousehold } from './locations';
import {
  DIRECTORY_HOUSEHOLDS,
  DIRECTORY_UNMAPPED_HOUSEHOLD,
  directoryJson,
  householdUuid,
  personUuid,
} from './__fixtures__/directory';

describe('parseDirectory', () => {
  it('reads every household with its members and coordinates', () => {
    const { households, warnings } = parseDirectory(directoryJson());
    expect(warnings).toEqual([]);
    expect(households).toHaveLength(DIRECTORY_HOUSEHOLDS.length);
    const alpha = households[0];
    expect(alpha.uuid).toBe(householdUuid(1));
    expect(alpha.name).toBe('Alpha, Aaron & Amy');
    expect(alpha.lat).toBe(0.031234);
    expect(alpha.lng).toBe(0.029877);
    expect(alpha.members.map((m) => [m.uuid, m.head])).toEqual([
      [personUuid(1, 1), true],
      [personUuid(1, 2), true],
      [personUuid(1, 3), false],
      [personUuid(1, 4), false],
      [personUuid(1, 5), false],
    ]);
  });

  it('rounds float noise to 6 decimal places', () => {
    const bravo = parseDirectory(directoryJson()).households[1];
    expect(bravo.lat).toBe(0.033457);
    expect(bravo.lng).toBe(0.031235);
  });

  it('keeps hidden-from-members locations the viewer received', () => {
    const delta = parseDirectory(directoryJson()).households[3];
    expect(delta.lat).not.toBeNull();
  });

  it('gives an unmapped household null coordinates', () => {
    const { households } = parseDirectory(
      directoryJson([...DIRECTORY_HOUSEHOLDS, DIRECTORY_UNMAPPED_HOUSEHOLD]),
    );
    const india = households.at(-1)!;
    expect(india.lat).toBeNull();
    expect(india.lng).toBeNull();
  });

  it('ignores text around the array', () => {
    const { households } = parseDirectory(`pretty print\n${directoryJson()}\n`);
    expect(households).toHaveLength(DIRECTORY_HOUSEHOLDS.length);
  });

  it('rejects a ministering page or other JSON', () => {
    expect(() => parseDirectory('<html><body>no data</body></html>')).toThrow(/Could not find/);
    expect(() => parseDirectory('[{"id": 1}]')).toThrow(/not the directory/);
    expect(() => parseDirectory('[{"uuid": "x", "members": []}, {')).toThrow(/complete JSON/);
  });
});

describe('planLocationImport', () => {
  const parsed = parseDirectory(
    directoryJson([...DIRECTORY_HOUSEHOLDS, DIRECTORY_UNMAPPED_HOUSEHOLD]),
  );
  const hh = (id: string, name: string, lcrUuid: string | null, lat = null, lng = null) =>
    ({ id, name, lcrUuid, lat, lng }) as LocationHousehold;
  const elder = (id: string, name: string, lcrUuid: string | null, homeHouseholdId = null) =>
    ({ id, name, lcrUuid, homeHouseholdId }) as LocationElder;

  it('matches households by any head person UUID and writes their coordinates', () => {
    const plan = planLocationImport(parsed, {
      // The ministering page uses one head's UUID; for Alpha it's the second head.
      households: [hh('a', 'Alpha, Amy', personUuid(1, 2)), hh('b', 'Bravo, Bodhi', personUuid(2, 1))],
      elders: [],
    });
    expect(plan.locationUpdates).toEqual([
      { id: 'a', lat: 0.031234, lng: 0.029877 },
      { id: 'b', lat: 0.033457, lng: 0.031235 },
    ]);
  });

  it('falls back to a unique household or head name when a household has no LCR ID', () => {
    const plan = planLocationImport(parsed, {
      households: [hh('c', 'Charlie, Carl', null), hh('d', 'Delta, Drew & Dana', null)],
      elders: [elder('e', 'Delta, Dax', null)],
    });
    expect(plan.locationUpdates.map((u) => u.id)).toEqual(['c', 'd']);
    expect(plan.homeLinks).toEqual([{ elderId: 'e', householdId: 'd' }]);
  });

  it('counts unchanged, unmapped and missing households', () => {
    const plan = planLocationImport(parsed, {
      households: [
        { id: 'a', name: 'Alpha, Aaron', lcrUuid: personUuid(1, 1), lat: 0.031234, lng: 0.029877 },
        hh('i', 'India, Ivan', personUuid(9, 1)),
        hh('x', 'Moved, Away', '22222222-0000-4000-8000-999999999999'),
      ],
      elders: [],
    });
    expect(plan.locationUpdates).toEqual([]);
    expect(plan.unchanged).toBe(1);
    expect(plan.noLocation).toEqual([{ id: 'i', name: 'India, Ivan' }]);
    expect(plan.notInDirectory).toEqual([{ id: 'x', name: 'Moved, Away' }]);
  });

  it('links elders who are not head of household through the member list', () => {
    const plan = planLocationImport(parsed, {
      households: [hh('a', 'Alpha, Aaron', personUuid(1, 1))],
      elders: [
        elder('e-head', 'Alpha, Aaron', personUuid(1, 1)),
        elder('e-son', 'Alpha, Arlo', personUuid(1, 3)),
        elder('e-byname', 'Alpha, Alex', null),
      ],
    });
    expect(plan.homeLinks).toEqual([
      { elderId: 'e-head', householdId: 'a' },
      { elderId: 'e-son', householdId: 'a' },
      { elderId: 'e-byname', householdId: 'a' },
    ]);
  });

  it('never overwrites an existing home link', () => {
    const plan = planLocationImport(parsed, {
      households: [hh('a', 'Alpha, Aaron', personUuid(1, 1))],
      elders: [{ id: 'e', name: 'Alpha, Arlo', lcrUuid: personUuid(1, 3), homeHouseholdId: 'b' }],
    });
    expect(plan.homeLinks).toEqual([]);
    expect(plan.eldersUnlinked).toEqual([]);
  });

  it('reports elders whose household is not stored here', () => {
    const plan = planLocationImport(parsed, {
      households: [],
      elders: [elder('e', 'Golf, Greg', personUuid(7, 1)), elder('f', 'Gone, Gary', null)],
    });
    expect(plan.homeLinks).toEqual([]);
    expect(plan.eldersUnlinked.map((e) => e.id)).toEqual(['e', 'f']);
  });
});
