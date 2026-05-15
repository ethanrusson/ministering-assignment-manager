// Pan/zoom controller for the infinite canvas. Single source of truth for
// (tx, ty, scale). Composable so it can be unit-tested or swapped out.
//
// Coordinate spaces:
//   - "screen" pixels: relative to the canvas root element's top-left.
//   - "world" units:   what cards/districts use for their position_x/position_y.
//
//   world = (screen - translate) / scale
//   screen = world * scale + translate
//
// Persists viewport to localStorage keyed by ward id so reloading returns
// the user to the same view.

import { reactive, watch } from 'vue';

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 2.0;
const ZOOM_STEP = 1.1;

interface Viewport {
  tx: number;
  ty: number;
  scale: number;
}

export function usePanZoom(wardIdRef: () => string | null) {
  const state = reactive<Viewport>({ tx: 0, ty: 0, scale: 1 });

  // Hydrate from localStorage when the ward becomes known.
  watch(wardIdRef, (wid) => {
    if (!wid) return;
    const raw = localStorage.getItem(`viewport:${wid}`);
    if (!raw) return;
    try {
      const v = JSON.parse(raw) as Partial<Viewport>;
      if (
        typeof v.tx === 'number' &&
        typeof v.ty === 'number' &&
        typeof v.scale === 'number'
      ) {
        state.tx = v.tx;
        state.ty = v.ty;
        state.scale = clampZoom(v.scale);
      }
    } catch {
      /* noop */
    }
  });

  // Persist on change. Throttle is fine to skip — localStorage is fast.
  watch(
    () => [state.tx, state.ty, state.scale, wardIdRef()] as const,
    ([, , , wid]) => {
      if (!wid) return;
      localStorage.setItem(
        `viewport:${wid}`,
        JSON.stringify({ tx: state.tx, ty: state.ty, scale: state.scale }),
      );
    },
  );

  function clampZoom(s: number) {
    return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, s));
  }

  function panBy(dx: number, dy: number) {
    state.tx += dx;
    state.ty += dy;
  }

  /** Zoom about a screen-space point, keeping that point stable on screen. */
  function zoomAt(screenX: number, screenY: number, factor: number) {
    const next = clampZoom(state.scale * factor);
    if (next === state.scale) return;
    // World point under cursor before zoom:
    const wx = (screenX - state.tx) / state.scale;
    const wy = (screenY - state.ty) / state.scale;
    state.scale = next;
    // Adjust translate so (wx, wy) maps to the same screen point after zoom.
    state.tx = screenX - wx * next;
    state.ty = screenY - wy * next;
  }

  function zoomIn(centerX: number, centerY: number) {
    zoomAt(centerX, centerY, ZOOM_STEP);
  }
  function zoomOut(centerX: number, centerY: number) {
    zoomAt(centerX, centerY, 1 / ZOOM_STEP);
  }

  function reset() {
    state.tx = 0;
    state.ty = 0;
    state.scale = 1;
  }

  /** Center & scale view to fit a world bounding box inside a screen viewport. */
  function fitTo(
    bbox: { x: number; y: number; w: number; h: number },
    screenViewport: { width: number; height: number },
    padding = 80,
    maxScale: number = ZOOM_MAX,
  ) {
    const availW = Math.max(1, screenViewport.width - padding * 2);
    const availH = Math.max(1, screenViewport.height - padding * 2);
    const scale = clampZoom(Math.min(availW / bbox.w, availH / bbox.h, maxScale));
    state.scale = scale;
    state.tx = padding + (availW - bbox.w * scale) / 2 - bbox.x * scale;
    state.ty = padding + (availH - bbox.h * scale) / 2 - bbox.y * scale;
  }

  function screenToWorld(x: number, y: number) {
    return {
      x: (x - state.tx) / state.scale,
      y: (y - state.ty) / state.scale,
    };
  }

  return {
    state,
    panBy,
    zoomAt,
    zoomIn,
    zoomOut,
    reset,
    fitTo,
    screenToWorld,
    clampZoom,
  };
}
