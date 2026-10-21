import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useCompanionshipsStore } from '@/stores/companionships';
import { destinationFor } from './dropZones';
import {
  currentCompanionshipOf,
  isValidDestination,
  type Destination,
} from './assignment';

const IN_C1 = { kind: 'companionship', id: 'c1' } as const satisfies Destination;
const IN_C2 = { kind: 'companionship', id: 'c2' } as const satisfies Destination;
const POOL = { kind: 'unassigned' } as const satisfies Destination;

describe('destinationFor', () => {
  it('maps a companionship drop to that companionship', () => {
    expect(destinationFor('elder', { kind: 'companionship', id: 'c1' })).toEqual(IN_C1);
    expect(destinationFor('household', { kind: 'companionship', id: 'c1' })).toEqual(IN_C1);
  });

  it('ignores a companionship zone with no id', () => {
    expect(destinationFor('elder', { kind: 'companionship' })).toBeNull();
  });

  it('maps a matching sidebar drop to the unassigned pool', () => {
    expect(destinationFor('elder', { kind: 'sidebar-elders' })).toEqual(POOL);
    expect(destinationFor('household', { kind: 'sidebar-households' })).toEqual(POOL);
  });

  it('rejects a sidebar drop of the wrong kind', () => {
    expect(destinationFor('household', { kind: 'sidebar-elders' })).toBeNull();
    expect(destinationFor('elder', { kind: 'sidebar-households' })).toBeNull();
  });

  it('maps an elder dropped on an elder row to a pairing', () => {
    expect(destinationFor('elder', { kind: 'elder-item', id: 'e2' })).toEqual({
      kind: 'elder',
      id: 'e2',
    });
  });

  it('does not pair a household with an elder row', () => {
    expect(destinationFor('household', { kind: 'elder-item', id: 'e2' })).toBeNull();
  });

  it('treats the bare canvas and unknown zones as nowhere', () => {
    expect(destinationFor('elder', { kind: 'canvas' })).toBeNull();
    expect(destinationFor('elder', { kind: 'something-else' })).toBeNull();
  });
});

describe('assignment destinations', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const companionships = useCompanionshipsStore();
    // e1 and h1 are assigned to c1; e2 and h2 are loose.
    companionships.elderLinks = [{ companionship_id: 'c1', elder_id: 'e1' }];
    companionships.householdLinks = [{ companionship_id: 'c1', household_id: 'h1' }];
  });

  it('reports the current companionship of each subject', () => {
    expect(currentCompanionshipOf({ kind: 'elder', id: 'e1' })).toBe('c1');
    expect(currentCompanionshipOf({ kind: 'elder', id: 'e2' })).toBeUndefined();
    expect(currentCompanionshipOf({ kind: 'household', id: 'h1' })).toBe('c1');
    expect(currentCompanionshipOf({ kind: 'household', id: 'h2' })).toBeUndefined();
  });

  it('treats a drop back on the current companionship as no change', () => {
    expect(isValidDestination({ kind: 'elder', id: 'e1' }, IN_C1)).toBe(false);
    expect(isValidDestination({ kind: 'household', id: 'h1' }, IN_C1)).toBe(false);
  });

  it('accepts a move to a different companionship', () => {
    expect(isValidDestination({ kind: 'elder', id: 'e1' }, IN_C2)).toBe(true);
    expect(isValidDestination({ kind: 'household', id: 'h1' }, IN_C2)).toBe(true);
  });

  it('accepts assigning a loose subject', () => {
    expect(isValidDestination({ kind: 'elder', id: 'e2' }, IN_C1)).toBe(true);
    expect(isValidDestination({ kind: 'household', id: 'h2' }, IN_C1)).toBe(true);
  });

  it('only unassigns something that is currently assigned', () => {
    expect(isValidDestination({ kind: 'elder', id: 'e1' }, POOL)).toBe(true);
    expect(isValidDestination({ kind: 'elder', id: 'e2' }, POOL)).toBe(false);
    expect(isValidDestination({ kind: 'household', id: 'h1' }, POOL)).toBe(true);
    expect(isValidDestination({ kind: 'household', id: 'h2' }, POOL)).toBe(false);
  });

  it('pairs an elder with another elder, but not with themselves', () => {
    const e1 = { kind: 'elder', id: 'e1' } as const;
    expect(isValidDestination(e1, { kind: 'elder', id: 'e2' })).toBe(true);
    expect(isValidDestination(e1, { kind: 'elder', id: 'e1' })).toBe(false);
  });

  it('never pairs a household with an elder', () => {
    expect(
      isValidDestination({ kind: 'household', id: 'h1' }, { kind: 'elder', id: 'e2' }),
    ).toBe(false);
  });
});
