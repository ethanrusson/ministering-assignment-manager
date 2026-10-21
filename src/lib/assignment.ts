// Ward assignment operations — which elders and households belong to which
// companionship.
//
// This layer is deliberately gesture-free: it knows nothing about pointers,
// drop zones, or the canvas. Drag-and-drop (canvas/useTransfer) translates a
// drop into a Destination and calls applyAssignment; a tap-to-place UI would
// build the same Destination from a tap and call the same function. Every
// membership change should route through here so the rules — what counts as a
// valid target, what a no-op is, how a brand-new companionship gets placed —
// live in one place instead of being restated per gesture.

import { useAuthStore } from '@/stores/auth';
import { useCompanionshipsStore } from '@/stores/companionships';
import { useDistrictsStore } from '@/stores/districts';
import { pushError } from '@/lib/errorToast';
import { findFreeSpot } from '@/canvas/autoNudge';
import {
  CARD_H,
  ROW_GAP,
  SORT_KEY_GAP,
  columnIndexForX,
  columnXForIndex,
  findInsertOrdinalY,
  packColumn,
  renormalizeColumnSortKeys,
} from '@/canvas/layout';

export type SubjectKind = 'elder' | 'household';

/** The thing being moved. */
export interface Subject {
  kind: SubjectKind;
  id: string;
}

/** Where it's going. */
export type Destination =
  /** Into this companionship. */
  | { kind: 'companionship'; id: string }
  /** Paired up with this elder — elder subjects only. */
  | { kind: 'elder'; id: string }
  /** Back to the unassigned pool. */
  | { kind: 'unassigned' };

export type AssignmentResult =
  | { ok: true; changed: boolean }
  | { ok: false; error: string };

// Placement for a companionship created from two loose elders. The footprint
// is only used to spiral away from cards already sitting nearby; it's smaller
// than the rendered CARD_W so a new card can tuck into a gap.
//
// Note: the occupied rects are read from position_x/position_y, which are true
// pixels only for un-districted cards — for districted ones they're a column
// index and a sort key. Carried over from the original drop handler; it makes
// the search sloppy, not wrong, since the result is only a starting position.
const NEW_CARD_ORIGIN = { x: 400, y: 400 };
const NEW_CARD_FOOTPRINT = { w: 320, h: 80 };

// ─── Canvas layout hook ────────────────────────────────────────────────────
//
// The canvas registers a wrapper here that snapshots the viewport anchor
// before a mutation and re-pins it afterward. Assigning/unassigning an elder
// or household changes a card's height, which re-packs its masonry column and
// slides every card below it in world space. Without this, the part of the
// canvas the user was looking at appears to jump; the wrapper keeps it where
// they left it. Lives here rather than in the drag code so every path that
// mutates membership gets it — no-op until the canvas registers, which is
// exactly right for a UI with no canvas mounted.

let layoutPreserver: (<T>(fn: () => Promise<T>) => Promise<T>) | null = null;

export function setLayoutPreserver(
  fn: (<T>(fn: () => Promise<T>) => Promise<T>) | null,
) {
  layoutPreserver = fn;
}

function runPreservingLayout<T>(fn: () => Promise<T>): Promise<T> {
  return layoutPreserver ? layoutPreserver(fn) : fn();
}

// ─── Queries ───────────────────────────────────────────────────────────────

/** The companionship the subject currently belongs to, if any. */
export function currentCompanionshipOf(subject: Subject): string | undefined {
  const companionships = useCompanionshipsStore();
  return subject.kind === 'elder'
    ? companionships.companionshipForElder.get(subject.id)
    : companionships.companionshipForHousehold.get(subject.id);
}

/**
 * Whether sending `subject` to `dest` would actually change anything.
 *
 * Doubles as the no-op guard for applyAssignment and as the predicate a UI
 * uses to decide which targets to light up — dropping a chip back where it
 * came from, or pairing an elder with themselves, are both "not valid".
 */
export function isValidDestination(subject: Subject, dest: Destination): boolean {
  switch (dest.kind) {
    case 'companionship':
      return currentCompanionshipOf(subject) !== dest.id;
    case 'elder':
      // Pairing is an elder-to-elder operation, and not with yourself.
      return subject.kind === 'elder' && dest.id !== subject.id;
    case 'unassigned':
      return currentCompanionshipOf(subject) !== undefined;
  }
}

// ─── Operations ────────────────────────────────────────────────────────────
//
// Each throws on failure; applyAssignment is the entry point that reports.

/** Move an elder or household into a companionship, out of any prior one. */
export async function assignToCompanionship(
  subject: Subject,
  companionshipId: string,
): Promise<void> {
  const companionships = useCompanionshipsStore();
  if (subject.kind === 'elder') {
    await companionships.assignElder(subject.id, companionshipId);
  } else {
    await companionships.assignHousehold(subject.id, companionshipId);
  }
}

/** Return an elder or household to the unassigned pool. */
export async function unassign(subject: Subject): Promise<void> {
  const companionships = useCompanionshipsStore();
  if (subject.kind === 'elder') {
    await companionships.unassignElder(subject.id);
  } else {
    await companionships.unassignHousehold(subject.id);
  }
}

/** Create a companionship holding the given elders, placed clear of others. */
export async function createCompanionshipWith(elderIds: string[]) {
  const companionships = useCompanionshipsStore();
  const auth = useAuthStore();
  if (!auth.wardId) throw new Error('No ward.');
  const occupied = companionships.items.map((c) => ({
    x: c.position_x,
    y: c.position_y,
    ...NEW_CARD_FOOTPRINT,
  }));
  const spot = findFreeSpot(NEW_CARD_ORIGIN, NEW_CARD_FOOTPRINT, occupied);
  return companionships.create({
    elderIds,
    districtId: null,
    position_x: spot.x,
    position_y: spot.y,
  });
}

/**
 * Create an empty companionship on open canvas below everything else, so it
 * comes last in the grid's reading order (loose cards sort after districted
 * ones, top to bottom).
 */
export async function createBlankCardAtEnd() {
  const companionships = useCompanionshipsStore();
  const districts = useDistrictsStore();
  const boxes = [
    ...districts.items.map((d) => ({
      x: d.position_x,
      bottom: d.position_y + (districts.renderedHeightById.get(d.id) ?? d.height),
    })),
    ...companionships.items
      .filter((c) => !c.district_id)
      .map((c) => ({
        x: c.position_x,
        bottom: c.position_y + (companionships.heightById.get(c.id) ?? CARD_H),
      })),
  ];
  return companionships.create({
    elderIds: [],
    districtId: null,
    position_x: boxes.length ? Math.min(...boxes.map((b) => b.x)) : NEW_CARD_ORIGIN.x,
    position_y: boxes.length ? Math.max(...boxes.map((b) => b.bottom)) + ROW_GAP : NEW_CARD_ORIGIN.y,
  });
}

/**
 * Create an empty companionship at a world-space point. Inside a district it
 * slots into the column and position under the point; on open canvas the
 * card's top-left lands on the point.
 */
export async function createBlankCardAt(pt: { x: number; y: number }) {
  const companionships = useCompanionshipsStore();
  const district = useDistrictsStore().districtAt(pt);
  if (!district) {
    return companionships.create({
      elderIds: [],
      districtId: null,
      position_x: Math.round(pt.x),
      position_y: Math.round(pt.y),
    });
  }
  const col = columnIndexForX(district, pt.x);
  const position_x = columnXForIndex(district, col);
  const colCards = companionships.items
    .filter((c) => c.district_id === district.id && columnIndexForX(district, c.position_x) === col)
    .map((c) => ({ id: c.id, position_y: c.position_y }));
  const insert = findInsertOrdinalY(district, colCards, companionships.heightById, pt.y);
  const comp = await companionships.create({
    elderIds: [],
    districtId: district.id,
    position_x,
    position_y: insert.sortY,
  });
  if (insert.needsRenormalize) {
    const renorm = renormalizeColumnSortKeys(colCards, { id: comp.id, atOrdinal: insert.ordinal });
    await companionships.updatePositionsBulk(renorm.map((r) => ({ ...r, position_x })));
  }
  return comp;
}

/**
 * Move a card into a district, or out onto open canvas.
 *
 * Position fields don't survive the move: inside a district position_x is a
 * column x and position_y a sort key, both relative to that district, so
 * carrying them over would land the card in a nonsense column. The card is
 * appended to whichever of the target's two columns is currently shorter.
 */
export async function moveToDistrict(
  companionshipId: string,
  districtId: string | null,
) {
  const companionships = useCompanionshipsStore();
  const card = companionships.byId.get(companionshipId);
  if (!card || card.district_id === districtId) return;

  if (!districtId) {
    // Out onto open canvas: real pixel coords, clear of the other cards.
    const occupied = companionships.items
      .filter((c) => c.id !== companionshipId)
      .map((c) => ({ x: c.position_x, y: c.position_y, ...NEW_CARD_FOOTPRINT }));
    const spot = findFreeSpot(NEW_CARD_ORIGIN, NEW_CARD_FOOTPRINT, occupied);
    return companionships.update(companionshipId, {
      district_id: null,
      position_x: spot.x,
      position_y: spot.y,
    });
  }

  const district = useDistrictsStore().byId.get(districtId);
  if (!district) throw new Error('No such district.');

  const columnCards = (col: 0 | 1) =>
    companionships.items
      .filter(
        (c) =>
          c.district_id === districtId &&
          c.id !== companionshipId &&
          columnIndexForX(district, c.position_x) === col,
      )
      .map((c) => ({ id: c.id, position_y: c.position_y }));

  const packedHeight = (col: 0 | 1) => {
    const packed = packColumn(columnCards(col), companionships.heightById);
    const last = packed[packed.length - 1];
    return last ? last.yOffset + last.height : 0;
  };

  const col: 0 | 1 = packedHeight(1) < packedHeight(0) ? 1 : 0;
  const lastSortKey = columnCards(col).reduce(
    (max, c) => Math.max(max, c.position_y),
    0,
  );
  return companionships.update(companionshipId, {
    district_id: districtId,
    position_x: columnXForIndex(district, col),
    position_y: lastSortKey + SORT_KEY_GAP,
  });
}

/**
 * Put two elders in a companionship together.
 *
 * Whichever elder already has one wins — `moving` joins `other`'s
 * companionship if it exists, otherwise `other` is pulled into `moving`'s. If
 * neither is assigned, a fresh companionship is created holding both.
 */
export async function pairElders(
  movingElderId: string,
  otherElderId: string,
): Promise<void> {
  const companionships = useCompanionshipsStore();
  const otherComp = companionships.companionshipForElder.get(otherElderId);
  const movingComp = companionships.companionshipForElder.get(movingElderId);
  if (otherComp) {
    await companionships.assignElder(movingElderId, otherComp);
  } else if (movingComp) {
    await companionships.assignElder(otherElderId, movingComp);
  } else {
    await createCompanionshipWith([movingElderId, otherElderId]);
  }
}

/**
 * Send `subject` to `dest`. The single entry point every UI should call.
 *
 * Never throws: a failed write is reported as a toast and returned as
 * `{ ok: false }` so the caller can decide whether to keep the subject held.
 * A destination that wouldn't change anything returns `{ ok: true, changed:
 * false }` without touching the database.
 */
export async function applyAssignment(
  subject: Subject,
  dest: Destination,
): Promise<AssignmentResult> {
  if (!isValidDestination(subject, dest)) return { ok: true, changed: false };
  try {
    await runPreservingLayout(async () => {
      switch (dest.kind) {
        case 'companionship':
          await assignToCompanionship(subject, dest.id);
          break;
        case 'elder':
          // isValidDestination has already established subject is an elder.
          await pairElders(subject.id, dest.id);
          break;
        case 'unassigned':
          await unassign(subject);
          break;
      }
    });
    return { ok: true, changed: true };
  } catch (e: unknown) {
    console.error('[assignment] failed', e);
    pushError(e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Assignment failed.',
    };
  }
}
