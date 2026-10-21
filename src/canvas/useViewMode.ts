// Canvas interaction mode — "view" vs "edit".
//
// On a touch device every drag affordance on the canvas (card handles, elder
// chips, household rows, district title bars) sits directly under the finger
// you'd use to pan, so scrolling around the board constantly picks something
// up and moves it instead. View mode turns all of those off: the canvas
// becomes read-only and a single finger anywhere — including on top of a
// card — pans.
//
// Module scope (like useTransfer) so the guards can live in the drag
// primitives themselves rather than being threaded through every component.
//
// Defaults to view mode on coarse-pointer devices, edit mode on mouse.
// The choice is remembered per-device, not per-ward.

import { readonly, ref, watch } from 'vue';

const STORAGE_KEY = 'canvasMode';

function isCoarsePointer(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  );
}

function initialLocked(): boolean {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'view') return true;
    if (saved === 'edit') return false;
  } catch {
    /* private browsing / storage disabled */
  }
  return isCoarsePointer();
}

const locked = ref(initialLocked());

watch(locked, (v) => {
  try {
    localStorage.setItem(STORAGE_KEY, v ? 'view' : 'edit');
  } catch {
    /* noop */
  }
});

function setLocked(v: boolean) {
  locked.value = v;
}

function toggle() {
  locked.value = !locked.value;
}

/** True when the canvas is read-only — every drag/edit affordance is off. */
export function isViewMode(): boolean {
  return locked.value;
}

export function useViewMode() {
  return { locked: readonly(locked), setLocked, toggle };
}
