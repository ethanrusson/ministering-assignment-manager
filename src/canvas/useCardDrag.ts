// Pointer-based drag for an absolutely-positioned card on the world layer.
// Returns onPointerDown to attach to the draggable surface. Calls onLive during
// drag (cheap, for visual feedback), onDrop at the end (DB write).
//
// Coordinate handling: pointer events are in screen pixels. The world layer is
// transformed with translate + scale, so we divide screen deltas by scale to
// get world-space deltas. Initial card position is in world units.

import { ref } from 'vue';

export interface DragHandlers {
  /** Called on pointerdown. Return false to skip starting the drag. */
  shouldStart?: (e: PointerEvent) => boolean;
  onLive?: (pos: { x: number; y: number }) => void;
  onDrop: (pos: { x: number; y: number }) => void | Promise<void>;
  onCancel?: () => void;
}

export function useCardDrag(scaleRef: () => number) {
  const dragging = ref(false);

  function makeStart(initialPosFn: () => { x: number; y: number }, h: DragHandlers) {
    return (e: PointerEvent) => {
      if (h.shouldStart && !h.shouldStart(e)) return;
      // Only react to primary pointer; ignore right-clicks.
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.stopPropagation();
      e.preventDefault();

      const startScreen = { x: e.clientX, y: e.clientY };
      const startWorld = initialPosFn();
      let last = startWorld;
      dragging.value = true;
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);

      const onMove = (ev: PointerEvent) => {
        const s = scaleRef();
        const dx = (ev.clientX - startScreen.x) / s;
        const dy = (ev.clientY - startScreen.y) / s;
        last = { x: startWorld.x + dx, y: startWorld.y + dy };
        h.onLive?.(last);
      };
      const cleanup = () => {
        target.removeEventListener('pointermove', onMove);
        target.removeEventListener('pointerup', onUp);
        target.removeEventListener('pointercancel', onCancel);
        dragging.value = false;
      };
      const onUp = (ev: PointerEvent) => {
        cleanup();
        target.releasePointerCapture?.(ev.pointerId);
        void h.onDrop(last);
      };
      const onCancel = () => {
        cleanup();
        h.onCancel?.();
      };
      target.addEventListener('pointermove', onMove);
      target.addEventListener('pointerup', onUp);
      target.addEventListener('pointercancel', onCancel);
    };
  }

  return { dragging, makeStart };
}
