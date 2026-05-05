// Live drag-preview state for companionship card moves into a district.
// While a card is being dragged over a district, this state describes where
// it would land on drop: which district, which column, and at what ordinal.
//
// Other cards in the target column read this state and render shifted-down
// to make room for a phantom slot. The District component renders a dashed
// placeholder at the projected slot position.
//
// Cleared on drop / cancel.

import { ref, readonly } from 'vue';

export interface DragPreviewState {
  cardId: string;          // dragged card id
  districtId: string;      // target district id
  column: 0 | 1;
  ordinal: number;         // insert position (0 = top of column)
  height: number;          // dragged card's measured height — placeholder size
}

const state = ref<DragPreviewState | null>(null);

function setPreview(s: DragPreviewState | null) {
  state.value = s;
}

function clearPreview() {
  state.value = null;
}

export function useDragPreview() {
  return {
    state: readonly(state),
    setPreview,
    clearPreview,
  };
}
