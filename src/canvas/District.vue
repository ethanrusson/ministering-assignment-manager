<script setup lang="ts">
// A district is a labeled, movable rectangle on the canvas. Width is fixed
// (2-column masonry). Height auto-sizes based on the tallest column of
// companionships inside it. Companionships dropped inside snap to a column;
// companionships outside any district move freely.
//
// Districted companionships compute their rendered (x, y) from the district's
// own (x, y) plus the masonry pack — so when the district moves, member cards
// follow automatically without any per-card update.

import { computed, ref } from 'vue';
import { useDistrictsStore } from '@/stores/districts';
import { useCompanionshipsStore } from '@/stores/companionships';
import { useCardDrag } from './useCardDrag';
import { useDragPreview } from './dragPreview';
import {
  CARD_W,
  COL_GAP,
  DISTRICT_HEADER,
  DISTRICT_INNER_PAD_X,
  DISTRICT_INNER_PAD_Y,
  DISTRICT_WIDTH,
  ROW_GAP,
  columnIndexForX,
  columnXForIndex,
  districtRenderHeight,
  packColumn,
} from './layout';
import type { Database } from '@/types/database';

type DistrictRow = Database['public']['Tables']['districts']['Row'];

const props = defineProps<{ district: DistrictRow; scale: number }>();
const districts = useDistrictsStore();
const companionships = useCompanionshipsStore();
const dragPreview = useDragPreview();

// Live-drag visuals: optimistic position while dragging, only persist on drop.
const liveX = ref<number | null>(null);
const liveY = ref<number | null>(null);

const x = computed(() => liveX.value ?? props.district.position_x);
const y = computed(() => liveY.value ?? props.district.position_y);

const w = DISTRICT_WIDTH;

// ─── Column packing ────────────────────────────────────────────────────────

const ourCards = computed(() =>
  companionships.items.filter((c) => c.district_id === props.district.id),
);

function cardsInColumn(col: 0 | 1) {
  return ourCards.value
    .filter((c) => columnIndexForX(props.district, c.position_x) === col)
    .map((c) => ({ id: c.id, position_y: c.position_y }));
}

const previewState = computed(() => {
  const p = dragPreview.state.value;
  if (!p || p.districtId !== props.district.id) return null;
  return p;
});

const packed0 = computed(() => {
  const p = previewState.value;
  return packColumn(cardsInColumn(0), companionships.heightById, {
    placeholderOrdinal: p?.column === 0 ? p.ordinal : undefined,
    placeholderHeight: p?.column === 0 ? p.height : undefined,
    excludeId: p?.cardId,
  });
});
const packed1 = computed(() => {
  const p = previewState.value;
  return packColumn(cardsInColumn(1), companionships.heightById, {
    placeholderOrdinal: p?.column === 1 ? p.ordinal : undefined,
    placeholderHeight: p?.column === 1 ? p.height : undefined,
    excludeId: p?.cardId,
  });
});

const h = computed(() => districtRenderHeight(packed0.value, packed1.value));

// Placeholder rendering position — relative to district top-left.
const placeholderRect = computed(() => {
  const p = previewState.value;
  if (!p) return null;
  const packed = p.column === 0 ? packed0.value : packed1.value;
  // The placeholder yOffset is wherever ROW_GAP-based packing put it. Find it
  // by replaying the pack with the same options and snapping the placeholder
  // index. Easier: the slot at ordinal `p.ordinal` is between the (ordinal-1)th
  // and ordinal-th real card in `packed`.
  let yOffset: number;
  if (packed.length === 0) {
    yOffset = 0;
  } else if (p.ordinal === 0) {
    yOffset = 0;
  } else if (p.ordinal >= packed.length) {
    const last = packed[packed.length - 1];
    yOffset = last.yOffset + last.height + ROW_GAP;
  } else {
    // Real card at index ordinal moved down by p.height + ROW_GAP. Its
    // current yOffset is therefore (placeholder_yOffset + p.height + ROW_GAP).
    yOffset = packed[p.ordinal].yOffset - p.height - ROW_GAP;
  }
  return {
    left: DISTRICT_INNER_PAD_X + p.column * (CARD_W + COL_GAP),
    top: DISTRICT_HEADER + DISTRICT_INNER_PAD_Y + yOffset,
    width: CARD_W,
    height: p.height,
  };
});

// ─── Move drag (district as a whole) ────────────────────────────────────────

const { makeStart } = useCardDrag(() => props.scale);

const startMove = makeStart(
  () => ({ x: props.district.position_x, y: props.district.position_y }),
  {
    onLive: (p) => {
      liveX.value = Math.round(p.x);
      liveY.value = Math.round(p.y);
    },
    onDrop: async (p) => {
      const finalPos = { x: Math.round(p.x), y: Math.round(p.y) };
      liveX.value = null;
      liveY.value = null;
      await districts.update(props.district.id, {
        position_x: finalPos.x,
        position_y: finalPos.y,
      });
      // Member cards follow automatically — their rendered position is computed
      // from district.position_x/y, so no per-card update is needed.
    },
  },
);

async function rename() {
  const next = window.prompt('Rename district', props.district.name);
  if (!next || next === props.district.name) return;
  await districts.update(props.district.id, { name: next.trim() });
}

async function remove() {
  if (
    !window.confirm(
      `Delete district "${props.district.name}"? Companionships in it stay on the canvas (un-districted).`,
    )
  )
    return;
  await districts.remove(props.district.id);
}

// Re-export for the column geometry (used in placeholder math via columnXForIndex).
// Tree-shaking note: prevents "unused import" lint without functional impact.
void columnXForIndex;
</script>

<template>
  <div
    class="absolute rounded-md border-2 border-dashed border-stone-300 bg-stone-200/60"
    :style="{
      left: x + 'px',
      top: y + 'px',
      width: w + 'px',
      height: h + 'px',
    }"
    data-bbox
    :data-x="x"
    :data-y="y"
    :data-w="w"
    :data-h="h"
    :data-district-id="district.id"
  >
    <!-- Title bar (move handle) -->
    <div
      class="flex h-9 cursor-move items-center justify-between gap-2 rounded-t-md border-b border-stone-300 bg-stone-200/80 px-3 text-sm font-medium text-stone-700"
      data-district-handle="move"
      @pointerdown="startMove"
    >
      <span class="truncate">{{ district.name }}</span>
      <div class="flex items-center gap-1" data-no-pan @pointerdown.stop>
        <button class="rounded px-1 text-xs hover:bg-stone-300/60" title="Rename" @click="rename">
          ✎
        </button>
        <button
          class="rounded px-1 text-xs text-danger-600 hover:bg-danger-100"
          title="Delete"
          @click="remove"
        >
          ×
        </button>
      </div>
    </div>

    <!-- Live drag placeholder -->
    <div
      v-if="placeholderRect"
      class="absolute pointer-events-none rounded-2xl border-2 border-dashed border-emerald-400 bg-emerald-50/40 transition-all duration-150"
      :style="{
        left: placeholderRect.left + 'px',
        top: placeholderRect.top + 'px',
        width: placeholderRect.width + 'px',
        height: placeholderRect.height + 'px',
      }"
    />
  </div>
</template>
