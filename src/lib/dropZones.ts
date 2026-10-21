// Drop-zone hit testing: which assignment destination, if any, sits under a
// given screen point.
//
// Shared by both input models — the drag in canvas/useTransfer and the tap in
// lib/usePickPlace — so "what's under the pointer" is answered the same way
// regardless of how the pointer got there.
//
// Zones are marked in templates with [data-drop-zone="<kind>"]:
//   companionship       — assign into the companionship (data-companionship-id)
//   sidebar-elders      — unassign elder
//   sidebar-households  — unassign household
//   elder-item          — pair with this elder (data-elder-id)
//   canvas              — bare canvas; means "nowhere"

import type { Destination, SubjectKind } from './assignment';

export interface DropZone {
  kind: string;
  id?: string;
}

/** The innermost marked drop zone at a screen point. */
export function findDropZone(x: number, y: number): DropZone | null {
  const els = document.elementsFromPoint(x, y);
  for (const el of els) {
    if (!(el instanceof HTMLElement)) continue;
    const zone = el.closest<HTMLElement>('[data-drop-zone]');
    if (!zone) continue;
    const kind = zone.dataset.dropZone!;
    if (kind === 'companionship') {
      return { kind, id: zone.dataset.companionshipId };
    }
    if (kind === 'elder-item') {
      return { kind, id: zone.dataset.elderId };
    }
    return { kind };
  }
  return null;
}

/**
 * Translate a drop zone into an assignment destination.
 *
 * Returns null when the zone means nothing — the bare canvas, or a zone that
 * doesn't accept this kind of subject (an elder dropped on the households
 * list, say). Whether a *valid* destination would actually change anything is
 * assignment.isValidDestination's question, not this one.
 */
export function destinationFor(
  kind: SubjectKind,
  zone: DropZone,
): Destination | null {
  switch (zone.kind) {
    case 'companionship':
      return zone.id ? { kind: 'companionship', id: zone.id } : null;
    case 'sidebar-elders':
      return kind === 'elder' ? { kind: 'unassigned' } : null;
    case 'sidebar-households':
      return kind === 'household' ? { kind: 'unassigned' } : null;
    case 'elder-item':
      return kind === 'elder' && zone.id ? { kind: 'elder', id: zone.id } : null;
    default:
      return null;
  }
}

/** findDropZone + destinationFor, for callers that only have a point. */
export function destinationAt(
  kind: SubjectKind,
  x: number,
  y: number,
): Destination | null {
  const zone = findDropZone(x, y);
  return zone ? destinationFor(kind, zone) : null;
}
