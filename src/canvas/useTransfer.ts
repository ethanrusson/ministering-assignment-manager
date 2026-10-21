// Cross-zone transfer drag for elders and households. A "transfer" is started
// from a chip inside a companionship card or a row inside the sidebars; on
// drop, the drop-zone under the pointer is translated into an assignment
// Destination and handed to lib/assignment. This file owns the *gesture* —
// pointer tracking, the ghost, hover state — and none of the rules about what
// an assignment means.
//
// The drag is tracked at module scope so any component can read isActive /
// preview position to render a ghost or hover state.
//
// The zones themselves are resolved by lib/dropZones.
//
// On a touch device a tap — press and release without moving — picks the
// subject up instead (lib/usePickPlace), because dragging can't reach a
// target that isn't already on screen.

import { reactive, readonly, ref } from "vue";
import { applyAssignment } from "@/lib/assignment";
import { destinationFor, findDropZone } from "@/lib/dropZones";
import { isHolding, pickUp } from "@/lib/usePickPlace";
import { isViewMode } from "./useViewMode";

type Kind = "elder" | "household";

interface DragState {
  active: boolean;
  kind: Kind | null;
  id: string | null;
  cursorX: number;
  cursorY: number;
  hoveredDropZone: { kind: string; id?: string } | null;
}

const state = reactive<DragState>({
  active: false,
  kind: null,
  id: null,
  cursorX: 0,
  cursorY: 0,
  hoveredDropZone: null,
});

const lastError = ref<string | null>(null);

let onMove: ((e: PointerEvent) => void) | null = null;
let onUp: ((e: PointerEvent) => void) | null = null;
let onCancel: ((e: PointerEvent) => void) | null = null;

function endListeners() {
  if (onMove) document.removeEventListener("pointermove", onMove);
  if (onUp) document.removeEventListener("pointerup", onUp);
  if (onCancel) document.removeEventListener("pointercancel", onCancel);
  onMove = onUp = onCancel = null;
}

function reset() {
  state.active = false;
  state.kind = null;
  state.id = null;
  state.hoveredDropZone = null;
}

/** Movement under this (px) counts as a tap rather than a drag. */
const TAP_SLOP = 8;

/**
 * Touch only. On a mouse a click that goes nowhere stays a no-op, the way it
 * has always behaved; flipping this to allow any pointer type would turn
 * pick-and-place on for the desktop canvas too.
 */
function isTapToCarry(e: PointerEvent, travelled: number): boolean {
  return e.pointerType === "touch" && travelled <= TAP_SLOP;
}

function startDrag(e: PointerEvent, kind: Kind, id: string) {
  // View mode is read-only, and a subject already in hand owns the next tap —
  // in both cases no preventDefault, so the gesture falls through to the
  // canvas (pan) or the sidebar (scroll).
  if (isViewMode() || isHolding()) return;
  // Prevent the canvas-pan code from also reacting; bubbling is stopped at the
  // call site, but defensive belt-and-suspenders here too.
  e.preventDefault();
  state.active = true;
  state.kind = kind;
  state.id = id;
  state.cursorX = e.clientX;
  state.cursorY = e.clientY;
  state.hoveredDropZone = null;

  // Capture the pointer on the source element. On iOS Safari this keeps
  // pointermove/up firing even when the finger moves far away from the
  // small source chip. Without this, fast touch drags can be lost mid-flight.
  const source = e.currentTarget as HTMLElement | null;
  const capturedId = e.pointerId;
  const startX = e.clientX;
  const startY = e.clientY;
  let travelled = 0;
  try {
    source?.setPointerCapture?.(capturedId);
  } catch {
    /* setPointerCapture can throw if the pointer is already released */
  }

  onMove = (ev) => {
    state.cursorX = ev.clientX;
    state.cursorY = ev.clientY;
    travelled = Math.max(
      travelled,
      Math.hypot(ev.clientX - startX, ev.clientY - startY),
    );
    state.hoveredDropZone = findDropZone(ev.clientX, ev.clientY);
  };
  onUp = (ev) => {
    const target = findDropZone(ev.clientX, ev.clientY);
    try {
      source?.releasePointerCapture?.(capturedId);
    } catch {
      /* noop */
    }
    endListeners();
    // A touch that never moved is a tap: carry the subject instead, so the
    // user can pan to a destination that was off screen.
    if (isTapToCarry(ev, travelled)) {
      const subject = state.kind && state.id ? { kind: state.kind, id: state.id } : null;
      reset();
      if (subject) pickUp(subject);
      return;
    }
    if (!target) {
      reset();
      return;
    }
    void resolveDrop(target);
  };
  onCancel = () => {
    try {
      source?.releasePointerCapture?.(capturedId);
    } catch {
      /* noop */
    }
    endListeners();
    reset();
  };

  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
  document.addEventListener("pointercancel", onCancel);
}

async function resolveDrop(target: { kind: string; id?: string }) {
  const { kind, id } = state;
  reset();
  if (!kind || !id) return;
  const dest = destinationFor(kind, target);
  if (!dest) return;
  lastError.value = null;
  const result = await applyAssignment({ kind, id }, dest);
  if (!result.ok) lastError.value = result.error;
}

function setHover(kind: string, id?: string) {
  if (!state.active) return;
  state.hoveredDropZone = { kind, id };
}
function clearHover(kind: string, id?: string) {
  if (!state.active) return;
  if (
    state.hoveredDropZone &&
    state.hoveredDropZone.kind === kind &&
    state.hoveredDropZone.id === id
  ) {
    state.hoveredDropZone = null;
  }
}

export function useTransfer() {
  return {
    state: readonly(state),
    lastError,
    startDrag,
    setHover,
    clearHover,
  };
}
