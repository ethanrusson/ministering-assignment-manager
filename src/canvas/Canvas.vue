<script setup lang="ts">
// Infinite canvas root: handles pan + zoom for mouse, touchpad, and touch.
// Children render in world space inside the .world layer.
//
// Pointer routing:
//   - Pointer down on an element with [data-card] or [data-district-handle]
//     => let that element handle its own drag (we ignore).
//   - 1 pointer down on empty space, with space held or middle button =>
//     start a pan.
//   - 2 pointers down => start a pinch (always overrides whatever).
//   - Wheel => zoom about cursor (or pan if shift held).
//
// Notes:
//   - touch-action:none is critical so iOS Safari doesn't fight us for gestures.
//   - We use Pointer Events for unified mouse+touch+pen.

import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { usePanZoom, ZOOM_MAX, ZOOM_MIN } from './usePanZoom';

const auth = useAuthStore();
const root = ref<HTMLDivElement | null>(null);
const { state: viewport, panBy, zoomAt, zoomIn, zoomOut, fitTo, reset } = usePanZoom(
  () => auth.wardId,
);

// Active pointers — handled differently for 1 vs 2.
type PointerInfo = { x: number; y: number };
const pointers = new Map<number, PointerInfo>();
let panLast: { x: number; y: number } | null = null;
let pinchLast: { dist: number; centerX: number; centerY: number } | null = null;
let spaceHeld = false;

function isCardTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return !!t.closest('[data-card], [data-district-handle], [data-no-pan]');
}

function localPoint(e: PointerEvent | WheelEvent) {
  const r = root.value!.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function onPointerDown(e: PointerEvent) {
  // Cards/districts handle their own drag. Don't fight them.
  if (isCardTarget(e.target)) return;
  // Right-click: skip (let browser context menu handle it).
  if (e.button === 2) return;

  const p = localPoint(e);
  pointers.set(e.pointerId, p);

  if (pointers.size >= 2) {
    // Start pinch.
    const pts = [...pointers.values()];
    pinchLast = {
      dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
      centerX: (pts[0].x + pts[1].x) / 2,
      centerY: (pts[0].y + pts[1].y) / 2,
    };
    panLast = null;
    return;
  }

  // 1 pointer: pan if mouse-middle, space-drag, or touch (single-finger touch
  // on empty space pans — drag-cards rule above already exits early for cards).
  const isPanIntent =
    e.button === 1 || // middle click
    (e.pointerType === 'mouse' && spaceHeld) ||
    e.pointerType === 'touch' ||
    e.pointerType === 'pen';

  if (isPanIntent) {
    panLast = p;
    root.value?.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
}

function onPointerMove(e: PointerEvent) {
  if (!pointers.has(e.pointerId) && pointers.size === 0) return;
  const p = localPoint(e);
  pointers.set(e.pointerId, p);

  if (pointers.size >= 2 && pinchLast) {
    const pts = [...pointers.values()];
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const centerX = (pts[0].x + pts[1].x) / 2;
    const centerY = (pts[0].y + pts[1].y) / 2;
    if (pinchLast.dist > 0) {
      const factor = dist / pinchLast.dist;
      zoomAt(centerX, centerY, factor);
    }
    // Two-finger drag also pans.
    panBy(centerX - pinchLast.centerX, centerY - pinchLast.centerY);
    pinchLast = { dist, centerX, centerY };
    e.preventDefault();
    return;
  }

  if (panLast && pointers.size === 1) {
    panBy(p.x - panLast.x, p.y - panLast.y);
    panLast = p;
    e.preventDefault();
  }
}

function onPointerUp(e: PointerEvent) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchLast = null;
  if (pointers.size < 1) panLast = null;
  root.value?.releasePointerCapture?.(e.pointerId);
}

function onWheel(e: WheelEvent) {
  // Browsers translate trackpad pinch into wheel + ctrlKey. Cmd/meta+wheel
  // is the conventional explicit zoom modifier on a regular mouse.
  // Everything else (plain mouse wheel, trackpad two-finger scroll) pans.
  if (e.ctrlKey || e.metaKey) {
    const p = localPoint(e);
    const factor = Math.exp(-e.deltaY / 200);
    zoomAt(p.x, p.y, factor);
  } else {
    panBy(-e.deltaX, -e.deltaY);
  }
  e.preventDefault();
}

function onKeyDown(e: KeyboardEvent) {
  if (e.code === 'Space') spaceHeld = true;
}
function onKeyUp(e: KeyboardEvent) {
  if (e.code === 'Space') spaceHeld = false;
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
});

const transform = computed(
  () => `translate(${viewport.tx}px, ${viewport.ty}px) scale(${viewport.scale})`,
);
const zoomPct = computed(() => Math.round(viewport.scale * 100));

function fitToContent() {
  if (!root.value) return;
  // Find world bbox of all districts + companionships from DOM.
  const els = root.value.querySelectorAll<HTMLElement>('[data-bbox]');
  if (!els.length) {
    reset();
    return;
  }
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  els.forEach((el) => {
    const x = Number(el.dataset.x ?? 0);
    const y = Number(el.dataset.y ?? 0);
    const w = Number(el.dataset.w ?? el.offsetWidth);
    const h = Number(el.dataset.h ?? el.offsetHeight);
    if (Number.isFinite(x)) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    }
  });
  if (!Number.isFinite(minX)) {
    reset();
    return;
  }
  const r = root.value.getBoundingClientRect();
  fitTo(
    { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
    { width: r.width, height: r.height },
  );
}

defineExpose({ fitToContent, reset, zoomIn, zoomOut, viewport });
</script>

<template>
  <div
    ref="root"
    class="relative h-full w-full select-none overflow-hidden bg-stone-100"
    style="touch-action: none"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @wheel.prevent="onWheel"
  >
    <!-- World layer -->
    <div
      class="absolute left-0 top-0"
      :style="{ transform, transformOrigin: '0 0' }"
    >
      <slot />
    </div>

    <!-- Floating controls -->
    <div
      class="pointer-events-auto absolute bottom-4 left-1/2 z-10 flex -transtone-x-1/2 items-center gap-1 rounded-full border border-stone-200 bg-white/90 px-2 py-1 shadow"
    >
      <button
        class="rounded p-1 text-sm hover:bg-stone-100 disabled:opacity-50"
        title="Zoom out"
        :disabled="viewport.scale <= ZOOM_MIN + 0.001"
        @click="zoomOut(root!.clientWidth / 2, root!.clientHeight / 2)"
      >
        −
      </button>
      <span class="min-w-[3ch] text-center text-xs tabular-nums text-stone-600">
        {{ zoomPct }}%
      </span>
      <button
        class="rounded p-1 text-sm hover:bg-stone-100 disabled:opacity-50"
        title="Zoom in"
        :disabled="viewport.scale >= ZOOM_MAX - 0.001"
        @click="zoomIn(root!.clientWidth / 2, root!.clientHeight / 2)"
      >
        +
      </button>
      <span class="mx-1 h-4 w-px bg-stone-300"></span>
      <button class="rounded px-2 py-1 text-xs hover:bg-stone-100" @click="fitToContent">
        Fit
      </button>
      <button class="rounded px-2 py-1 text-xs hover:bg-stone-100" @click="reset">
        100%
      </button>
    </div>

    <slot name="overlay" />
  </div>
</template>
