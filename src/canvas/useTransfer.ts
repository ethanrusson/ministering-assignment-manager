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
// Drop zones (mark elements with [data-drop-zone="<kind>"]):
//   companionship       — assign elder/household into the companionship
//                         (data-companionship-id required)
//   sidebar-elders      — unassign elder
//   sidebar-households  — unassign household
//   elder-item          — pair the dragged elder up with this one. Requires
//                         data-elder-id.
//   canvas              — bare canvas; a drop here means "nowhere"

import { reactive, readonly, ref } from "vue";
import { applyAssignment, type Destination } from "@/lib/assignment";
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

function findDropZone(
  x: number,
  y: number,
): { kind: string; id?: string } | null {
  const els = document.elementsFromPoint(x, y);
  for (const el of els) {
    if (!(el instanceof HTMLElement)) continue;
    const zone = el.closest<HTMLElement>("[data-drop-zone]");
    if (!zone) continue;
    const kind = zone.dataset.dropZone!;
    if (kind === "companionship") {
      return { kind, id: zone.dataset.companionshipId };
    }
    if (kind === "elder-item") {
      return { kind, id: zone.dataset.elderId };
    }
    return { kind };
  }
  return null;
}

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

function startDrag(e: PointerEvent, kind: Kind, id: string) {
  // View mode is read-only — no transfers, and no preventDefault, so the
  // gesture falls through to the canvas (pan) or the sidebar (scroll).
  if (isViewMode()) return;
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
  try {
    source?.setPointerCapture?.(capturedId);
  } catch {
    /* setPointerCapture can throw if the pointer is already released */
  }

  onMove = (ev) => {
    state.cursorX = ev.clientX;
    state.cursorY = ev.clientY;
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

/**
 * Translate a drop zone into an assignment destination.
 *
 * Returns null when the drop means nothing — the bare canvas, or a zone that
 * doesn't accept this kind of subject (an elder dropped on the households
 * list, say). The rules about whether a *valid* destination would actually
 * change anything live in lib/assignment, not here.
 */
export function destinationFor(
  kind: Kind,
  target: { kind: string; id?: string },
): Destination | null {
  switch (target.kind) {
    case "companionship":
      return target.id ? { kind: "companionship", id: target.id } : null;
    case "sidebar-elders":
      return kind === "elder" ? { kind: "unassigned" } : null;
    case "sidebar-households":
      return kind === "household" ? { kind: "unassigned" } : null;
    case "elder-item":
      return kind === "elder" && target.id
        ? { kind: "elder", id: target.id }
        : null;
    default:
      return null;
  }
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
