// Pure validation rules for a companionship. Same function will drive both
// the card-chrome warning indicators (Phase 2) and the worklist's per-comp
// warning section (Phase 3). Keep it data-only — no DB access.

export interface ValidationElder {
  id: string;
  name: string;
  age: number | null;
}

export interface ValidationCompanionship {
  id: string;
  districtId: string | null;
  elders: ValidationElder[];
  householdCount: number;
}

export type WarningSeverity = 'warn' | 'danger';

export interface CompanionshipWarning {
  rule: 'no-households' | 'too-many-households' | 'multi-minor' | 'no-district' | 'singleton';
  severity: WarningSeverity;
  message: string;
}

const HOUSEHOLD_LIMIT = 5;

export function validateCompanionship(
  c: ValidationCompanionship,
): CompanionshipWarning[] {
  const out: CompanionshipWarning[] = [];

  if (c.elders.length < 2) {
    out.push({
      rule: 'singleton',
      severity: 'warn',
      message: 'Companionship has fewer than 2 elders.',
    });
  }

  const minors = c.elders.filter((e) => e.age != null && e.age < 18);
  if (minors.length >= 2 && minors.length === c.elders.length) {
    out.push({
      rule: 'multi-minor',
      severity: 'danger',
      message: `${minors.length} elders under 18 — needs at least one adult.`,
    });
  }

  if (c.householdCount === 0) {
    out.push({
      rule: 'no-households',
      severity: 'warn',
      message: 'No households assigned.',
    });
  } else if (c.householdCount > HOUSEHOLD_LIMIT) {
    out.push({
      rule: 'too-many-households',
      severity: 'warn',
      message: `${c.householdCount} households (limit ${HOUSEHOLD_LIMIT}).`,
    });
  }

  if (c.districtId === null) {
    out.push({
      rule: 'no-district',
      severity: 'warn',
      message: 'Not in any district.',
    });
  }

  return out;
}

export function highestSeverity(
  warnings: CompanionshipWarning[],
): WarningSeverity | null {
  if (warnings.some((w) => w.severity === 'danger')) return 'danger';
  if (warnings.some((w) => w.severity === 'warn')) return 'warn';
  return null;
}

/** Surname-derived display title for a companionship. PRD §4. */
export function companionshipTitle(elderNames: string[]): string {
  if (!elderNames.length) return '(empty)';
  const surnames = elderNames.map((n) => n.split(',')[0].trim()).filter(Boolean);
  if (surnames.length === 1) return surnames[0];
  if (surnames.length === 2) return `${surnames[0]} & ${surnames[1]}`;
  // 3+: "A, B & C"
  return `${surnames.slice(0, -1).join(', ')} & ${surnames[surnames.length - 1]}`;
}
