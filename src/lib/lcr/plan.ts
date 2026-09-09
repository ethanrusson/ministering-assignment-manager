// Turns a diff + a chosen import mode into an explicit list of writes.
// Kept pure so the preview and the apply step can never disagree about what
// an import is going to do.

import type { DiffResult } from './diff';
import type { ParsedElder, ParsedHousehold, ParseResult } from './parser';

export type ImportMode =
  /** People + replace districts and companionships from LCR. */
  | 'full'
  /** Every person, but leave the board exactly as it is. */
  | 'people'
  /** Only people LCR shows with no companionship. Touches nothing else. */
  | 'unassigned';

export interface ElderAgeUpdate {
  id: string;
  name: string;
  prevAge: number | null;
  age: number | null;
}

export interface ImportPlan {
  mode: ImportMode;
  eldersToAdd: ParsedElder[];
  householdsToAdd: ParsedHousehold[];
  elderAgeUpdates: ElderAgeUpdate[];
  /** True only for 'full' — the one mode that deletes and rebuilds the board. */
  replaceStructure: boolean;
  /** New-to-us people this mode deliberately leaves behind, so the UI can say so. */
  skipped: {
    assignedElders: number;
    assignedHouseholds: number;
    ageUpdates: number;
  };
}

export function planImport(diff: DiffResult, mode: ImportMode): ImportPlan {
  const unassignedOnly = mode === 'unassigned';

  const elderAdds = diff.elders.filter((c) => c.kind === 'add');
  const householdAdds = diff.households.filter((c) => c.kind === 'add');
  const ageChanges = diff.elders.filter((c) => c.kind === 'age-change');

  const eldersToAdd = (
    unassignedOnly ? elderAdds.filter((c) => c.parsed.unassigned) : elderAdds
  ).map((c) => c.parsed);

  const householdsToAdd = (
    unassignedOnly ? householdAdds.filter((c) => c.parsed.unassigned) : householdAdds
  ).map((c) => c.parsed);

  const elderAgeUpdates: ElderAgeUpdate[] = unassignedOnly
    ? []
    : ageChanges.map((c) => ({
        id: c.existing!.id,
        name: c.parsed.name,
        prevAge: c.prevAge ?? null,
        age: c.parsed.age,
      }));

  return {
    mode,
    eldersToAdd,
    householdsToAdd,
    elderAgeUpdates,
    replaceStructure: mode === 'full',
    skipped: {
      assignedElders: unassignedOnly
        ? elderAdds.filter((c) => !c.parsed.unassigned).length
        : 0,
      assignedHouseholds: unassignedOnly
        ? householdAdds.filter((c) => !c.parsed.unassigned).length
        : 0,
      ageUpdates: unassignedOnly ? ageChanges.length : 0,
    },
  };
}

/** True when a plan would write nothing at all. */
export function isPlanEmpty(plan: ImportPlan): boolean {
  return (
    !plan.replaceStructure &&
    plan.eldersToAdd.length === 0 &&
    plan.householdsToAdd.length === 0 &&
    plan.elderAgeUpdates.length === 0
  );
}

/**
 * 'unassigned' mode is only meaningful when the page carried the eligible
 * roster — without it nothing is ever marked unassigned.
 */
export function modeUnavailableReason(
  mode: ImportMode,
  parsed: Pick<ParseResult, 'hasEligibleRoster'>,
): string | null {
  if (mode === 'unassigned' && !parsed.hasEligibleRoster) {
    return 'This paste has no eligible roster, so no one is marked unassigned. Copy the LCR ministering page again from the Unassigned tab.';
  }
  return null;
}
