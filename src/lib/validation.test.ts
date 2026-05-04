import { describe, expect, it } from 'vitest';
import {
  companionshipTitle,
  highestSeverity,
  validateCompanionship,
} from './validation';

const e = (id: string, name: string, age: number | null = 30) => ({ id, name, age });

describe('validateCompanionship', () => {
  it('returns no warnings for a healthy 2-elder, 3-household, in-district companionship', () => {
    const w = validateCompanionship({
      id: 'c1',
      districtId: 'd1',
      elders: [e('1', 'Smith, John'), e('2', 'Jones, Mike')],
      householdCount: 3,
    });
    expect(w).toEqual([]);
  });

  it('warns when there are no households', () => {
    const w = validateCompanionship({
      id: 'c1',
      districtId: 'd1',
      elders: [e('1', 'A, A'), e('2', 'B, B')],
      householdCount: 0,
    });
    expect(w.map((x) => x.rule)).toContain('no-households');
  });

  it('warns when there are too many households', () => {
    const w = validateCompanionship({
      id: 'c1',
      districtId: 'd1',
      elders: [e('1', 'A, A'), e('2', 'B, B')],
      householdCount: 6,
    });
    expect(w.map((x) => x.rule)).toContain('too-many-households');
  });

  it('flags 2+ minors as danger', () => {
    const w = validateCompanionship({
      id: 'c1',
      districtId: 'd1',
      elders: [e('1', 'A, A', 16), e('2', 'B, B', 17)],
      householdCount: 2,
    });
    const minor = w.find((x) => x.rule === 'multi-minor');
    expect(minor?.severity).toBe('danger');
  });

  it('does not flag a single minor', () => {
    const w = validateCompanionship({
      id: 'c1',
      districtId: 'd1',
      elders: [e('1', 'A, A', 35), e('2', 'B, B', 17)],
      householdCount: 2,
    });
    expect(w.map((x) => x.rule)).not.toContain('multi-minor');
  });

  it('warns when not in a district', () => {
    const w = validateCompanionship({
      id: 'c1',
      districtId: null,
      elders: [e('1', 'A, A'), e('2', 'B, B')],
      householdCount: 2,
    });
    expect(w.map((x) => x.rule)).toContain('no-district');
  });

  it('flags singleton companionships', () => {
    const w = validateCompanionship({
      id: 'c1',
      districtId: 'd1',
      elders: [e('1', 'A, A')],
      householdCount: 2,
    });
    expect(w.map((x) => x.rule)).toContain('singleton');
  });
});

describe('highestSeverity', () => {
  it('returns danger if any danger present', () => {
    expect(
      highestSeverity([
        { rule: 'no-households', severity: 'warn', message: '' },
        { rule: 'multi-minor', severity: 'danger', message: '' },
      ]),
    ).toBe('danger');
  });
  it('returns warn if only warns', () => {
    expect(
      highestSeverity([{ rule: 'no-households', severity: 'warn', message: '' }]),
    ).toBe('warn');
  });
  it('returns null if no warnings', () => {
    expect(highestSeverity([])).toBeNull();
  });
});

describe('companionshipTitle', () => {
  it('two surnames joined with &', () => {
    expect(companionshipTitle(['Smith, John', 'Jones, Mike'])).toBe('Smith & Jones');
  });
  it('three surnames: comma list with & before last', () => {
    expect(
      companionshipTitle(['Smith, John', 'Jones, Mike', 'Brown, Bob']),
    ).toBe('Smith, Jones & Brown');
  });
  it('one elder', () => {
    expect(companionshipTitle(['Smith, John'])).toBe('Smith');
  });
  it('handles names without commas', () => {
    expect(companionshipTitle(['SmithJohn'])).toBe('SmithJohn');
  });
});
