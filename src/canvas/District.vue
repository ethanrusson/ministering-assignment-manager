<script setup lang="ts">
// A district is a labeled, movable rectangle on the canvas. Width is fixed
// (2-column grid). Height auto-sizes to fit the number of companionships
// currently assigned to it (with a minimum). Companionships dropped inside
// snap to the grid; companionships outside any district move freely.

import { computed, ref } from 'vue';
import { useDistrictsStore } from '@/stores/districts';
import { useCompanionshipsStore } from '@/stores/companionships';
import { useCardDrag } from './useCardDrag';
import {
  DISTRICT_WIDTH,
  cellOf,
  districtHeightForRows,
} from './layout';
import type { Database } from '@/types/database';

type DistrictRow = Database['public']['Tables']['districts']['Row'];

const props = defineProps<{ district: DistrictRow; scale: number }>();
const districts = useDistrictsStore();
const companionships = useCompanionshipsStore();

// Live-drag visuals: optimistic position while dragging, only persist on drop.
const liveX = ref<number | null>(null);
const liveY = ref<number | null>(null);

const x = computed(() => liveX.value ?? props.district.position_x);
const y = computed(() => liveY.value ?? props.district.position_y);

// Width is fixed at the 2-column standard.
const w = DISTRICT_WIDTH;

// Auto-fit height. Use both the count and the highest-occupied row so a card
// dropped near the bottom still fits cleanly. Always shows at least one row
// of empty space when the district has no companionships.
const autoHeight = computed(() => {
  const occupants = companionships.items.filter(
    (c) => c.district_id === props.district.id,
  );
  let maxRow = -1;
  for (const c of occupants) {
    const { row } = cellOf(props.district, c);
    if (row > maxRow) maxRow = row;
  }
  const rowsFromCount = Math.ceil(occupants.length / 2);
  const rows = Math.max(1, rowsFromCount, maxRow + 1);
  return districtHeightForRows(rows);
});

const h = computed(() => autoHeight.value);

const { makeStart } = useCardDrag(() => props.scale);

// Move
const startMove = makeStart(
  () => ({ x: props.district.position_x, y: props.district.position_y }),
  {
    onLive: (p) => {
      liveX.value = Math.round(p.x);
      liveY.value = Math.round(p.y);
    },
    onDrop: async (p) => {
      const finalPos = { x: Math.round(p.x), y: Math.round(p.y) };
      const dx = finalPos.x - props.district.position_x;
      const dy = finalPos.y - props.district.position_y;
      liveX.value = null;
      liveY.value = null;
      await districts.update(props.district.id, {
        position_x: finalPos.x,
        position_y: finalPos.y,
      });
      // Move all contained companionships by the same delta so they stay in
      // their grid cells.
      const containedComps = companionships.items.filter(
        (c) => c.district_id === props.district.id,
      );
      for (const c of containedComps) {
        await companionships.update(c.id, {
          position_x: c.position_x + dx,
          position_y: c.position_y + dy,
        });
      }
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
</script>

<template>
  <div
    class="absolute rounded-md border-2 border-dashed border-slate-300 bg-slate-200/40"
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
      class="flex h-9 cursor-move items-center justify-between gap-2 rounded-t-md border-b border-slate-300 bg-slate-200/80 px-3 text-sm font-medium text-slate-700 backdrop-blur"
      data-district-handle="move"
      @pointerdown="startMove"
    >
      <span class="truncate">{{ district.name }}</span>
      <div class="flex items-center gap-1" data-no-pan @pointerdown.stop>
        <button class="rounded px-1 text-xs hover:bg-slate-300/60" title="Rename" @click="rename">
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
  </div>
</template>
