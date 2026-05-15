// Cross-zone transfer drag for elders and households. A "transfer" is started
// from a chip inside a companionship card or a row inside the sidebars; on
// drop, the source identity + target drop-zone determines what happens.
//
// The drag is tracked at module scope so any component can read isActive /
// preview position to render a ghost or hover state.
//
// Drop zones (mark elements with [data-drop-zone="<kind>"]):
//   companionship       — assign elder/household into the companionship
//                         (data-companionship-id required)
//   sidebar-elders      — unassign elder
//   sidebar-households  — unassign household
//   elder-item          — when dropping an elder onto another unassigned elder
//                         row, form a new companionship with both. Requires
//                         data-elder-id.

import { reactive, readonly, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useCompanionshipsStore } from '@/stores/companionships';
import { pushError } from '@/lib/errorToast';
import { findFreeSpot } from './autoNudge';

type Kind = 'elder' | 'household';

interface DragState {
  active: boolean;
  kind: Kind | null;
  id: string | null;
  fromCompanionshipId: string | null;
  cursorX: number;
  cursorY: number;
  hoveredDropZone: { kind: string; id?: string } | null;
}

const state = reactive<DragState>({
  active: false,
  kind: null,
  id: null,
  fromCompanionshipId: null,
  cursorX: 0,
  cursorY: 0,
  hoveredDropZone: null,
});

const lastError = ref<string | null>(null);

function findDropZone(x: number, y: number): { kind: string; id?: string } | null {
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

let onMove: ((e: PointerEvent) => void) | null = null;
let onUp: ((e: PointerEvent) => void) | null = null;
let onCancel: ((e: PointerEvent) => void) | null = null;

function endListeners() {
  if (onMove) document.removeEventListener('pointermove', onMove);
  if (onUp) document.removeEventListener('pointerup', onUp);
  if (onCancel) document.removeEventListener('pointercancel', onCancel);
  onMove = onUp = onCancel = null;
}

function reset() {
  state.active = false;
  state.kind = null;
  state.id = null;
  state.fromCompanionshipId = null;
  state.hoveredDropZone = null;
}

function startDrag(
  e: PointerEvent,
  kind: Kind,
  id: string,
  fromCompanionshipId: string | null = null,
) {
  // Prevent the canvas-pan code from also reacting; bubbling is stopped at the
  // call site, but defensive belt-and-suspenders here too.
  e.preventDefault();
  state.active = true;
  state.kind = kind;
  state.id = id;
  state.fromCompanionshipId = fromCompanionshipId;
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

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onCancel);
}

async function resolveDrop(target: { kind: string; id?: string }) {
  const companionships = useCompanionshipsStore();
  const auth = useAuthStore();
  const { kind, id, fromCompanionshipId } = state;
  reset();
  if (!kind || !id) return;
  lastError.value = null;
  try {
    if (kind === 'elder') {
      if (target.kind === 'companionship' && target.id) {
        if (target.id === fromCompanionshipId) return; // dropped on same comp
        await companionships.assignElder(id, target.id);
      } else if (target.kind === 'sidebar-elders') {
        if (fromCompanionshipId) await companionships.unassignElder(id);
      } else if (target.kind === 'elder-item' && target.id && target.id !== id) {
        // Create a new companionship with both elders if the other is unassigned.
        const otherAssigned = companionships.companionshipForElder.get(target.id);
        const myAssigned = companionships.companionshipForElder.get(id);
        if (otherAssigned) {
          // Move the dragged elder into the other's companionship.
          await companionships.assignElder(id, otherAssigned);
        } else if (myAssigned) {
          // The dragged elder has a comp already; pull the other into it.
          await companionships.assignElder(target.id, myAssigned);
        } else {
          // Both unassigned — create a fresh companionship near canvas center,
          // auto-nudged off any existing card.
          if (!auth.wardId) throw new Error('No ward.');
          const existingRects = companionships.items.map((c) => ({
            x: c.position_x,
            y: c.position_y,
            w: 320,
            h: 80,
          }));
          const spot = findFreeSpot(
            { x: 400, y: 400 },
            { w: 320, h: 80 },
            existingRects,
          );
          await companionships.create({
            elderIds: [id, target.id],
            districtId: null,
            position_x: spot.x,
            position_y: spot.y,
          });
        }
      }
    } else if (kind === 'household') {
      if (target.kind === 'companionship' && target.id) {
        if (target.id === fromCompanionshipId) return;
        await companionships.assignHousehold(id, target.id);
      } else if (target.kind === 'sidebar-households') {
        if (fromCompanionshipId) await companionships.unassignHousehold(id);
      }
    }
  } catch (e: unknown) {
    lastError.value = e instanceof Error ? e.message : 'Transfer failed.';
    console.error('[transfer] failed', e);
    pushError(e);
  }
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
