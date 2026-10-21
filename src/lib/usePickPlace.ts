// Tap to pick up, tap to place.
//
// The touch counterpart to dragging. A drag can only reach a target that's
// already on screen — there's no auto-pan at the canvas edge, and on a phone
// the sidebar overlays the canvas, so source and destination often can't be
// visible at once. Holding a subject across pans removes that constraint:
// pick it up, pan anywhere, tap the destination.
//
// Module scope, like useTransfer, so any component can ask whether it's a
// valid target for whatever is currently held.

import { computed, readonly, ref } from 'vue';
import {
  applyAssignment,
  isValidDestination,
  type Destination,
  type Subject,
} from './assignment';
import { destinationAt } from './dropZones';

/** Movement under this (px) is a tap, not a pan. */
const TAP_SLOP = 8;

const held = ref<Subject | null>(null);
const placing = ref(false);

let downAt: { x: number; y: number; pointerId: number } | null = null;
let onDown: ((e: PointerEvent) => void) | null = null;
let onUp: ((e: PointerEvent) => void) | null = null;

// Listeners run on the capture phase so a tap is seen wherever it lands —
// on a card, in the sidebar, on empty canvas — without every target needing
// its own handler.
function listen() {
  if (onDown) return;
  onDown = (e) => {
    downAt = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
  };
  onUp = (e) => {
    const start = downAt;
    downAt = null;
    if (!start || start.pointerId !== e.pointerId) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_SLOP) return;
    // Floating chrome (the held-item bar, zoom controls) isn't a destination.
    const t = e.target;
    if (t instanceof HTMLElement && t.closest('[data-no-pan]')) return;
    void placeAt(e.clientX, e.clientY);
  };
  document.addEventListener('pointerdown', onDown, true);
  document.addEventListener('pointerup', onUp, true);
}

function unlisten() {
  if (onDown) document.removeEventListener('pointerdown', onDown, true);
  if (onUp) document.removeEventListener('pointerup', onUp, true);
  onDown = onUp = null;
  downAt = null;
}

/** Start carrying an elder or household. */
export function pickUp(subject: Subject) {
  held.value = subject;
  listen();
}

/** Put it back down without assigning. */
export function cancel() {
  held.value = null;
  placing.value = false;
  unlisten();
}

/**
 * Place the held subject on whatever is at this screen point.
 *
 * A point that isn't a valid destination is ignored and the subject stays
 * held — tapping empty canvas while carrying something is how you pan to find
 * the right card, not a reason to drop it.
 */
export async function placeAt(x: number, y: number) {
  const subject = held.value;
  if (!subject || placing.value) return;
  const dest = destinationAt(subject.kind, x, y);
  if (!dest || !isValidDestination(subject, dest)) return;
  placing.value = true;
  const result = await applyAssignment(subject, dest);
  placing.value = false;
  if (result.ok) cancel();
}

/** True while a subject is being carried. */
export function isHolding(): boolean {
  return held.value !== null;
}

/** Whether the held subject could be placed here — drives target highlights. */
export function canAccept(dest: Destination): boolean {
  return held.value ? isValidDestination(held.value, dest) : false;
}

export function usePickPlace() {
  return {
    held: readonly(held),
    holding: computed(() => held.value !== null),
    pickUp,
    cancel,
    canAccept,
  };
}
