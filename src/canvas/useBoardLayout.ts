// Board layout — the free-form district canvas, every card in a static
// masonry grid, or the ward map — plus the grid's zoom. Remembered per-device,
// like useViewMode.

import { readonly, ref, watch } from 'vue';
import { ZOOM_MAX, ZOOM_MIN } from './usePanZoom';

export type BoardLayout = 'canvas' | 'grid' | 'map';

const STORAGE_KEY = 'boardLayout';
const ZOOM_KEY = 'gridZoom';

function initial(): BoardLayout {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'grid' || saved === 'map') return saved;
  } catch {
    /* private browsing / storage disabled */
  }
  return 'canvas';
}

function initialZoom(): number {
  try {
    const z = Number(localStorage.getItem(ZOOM_KEY));
    if (z) return clampZoom(z);
  } catch {
    /* noop */
  }
  return 1;
}

function clampZoom(z: number) {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
}

const layout = ref<BoardLayout>(initial());
const gridZoom = ref(initialZoom());

function persist(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* noop */
  }
}

watch(layout, (v) => persist(STORAGE_KEY, v));
watch(gridZoom, (v) => persist(ZOOM_KEY, String(v)));

function setLayout(v: BoardLayout) {
  layout.value = v;
}

function setGridZoom(z: number) {
  gridZoom.value = clampZoom(z);
}

export function useBoardLayout() {
  return { layout: readonly(layout), setLayout, gridZoom: readonly(gridZoom), setGridZoom };
}
