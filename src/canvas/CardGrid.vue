<script setup lang="ts">
// Every companionship in one static masonry grid. Cards can't be moved here,
// but chips still transfer between them. Order follows the canvas: district by
// district, column by column, then loose cards.
//
// Zooming scales the cards with CSS `zoom`, so the fixed column width shrinks
// on screen and more columns fit across.

import { computed, nextTick, ref } from 'vue';
import { useCompanionshipsStore } from '@/stores/companionships';
import { useDistrictsStore } from '@/stores/districts';
import { useSidebar } from '@/components/sidebar/useSidebar';
import CompanionshipCard from './CompanionshipCard.vue';
import { CARD_W, columnIndexForX } from './layout';
import { useBoardLayout } from './useBoardLayout';
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from './usePanZoom';
import CardContextMenu, { type MenuItem } from './CardContextMenu.vue';
import { createBlankCardAtEnd } from '@/lib/assignment';
import { pushError } from '@/lib/errorToast';
import { PlusIcon } from '@heroicons/vue/24/outline';

const companionships = useCompanionshipsStore();
const districts = useDistrictsStore();
const { open: sidebarOpen } = useSidebar();
const { gridZoom, setGridZoom } = useBoardLayout();

// Same gesture as the canvas: trackpad pinch arrives as ctrl+wheel, and
// cmd/ctrl+wheel zooms on a mouse. Plain wheel scrolls.
function onWheel(e: WheelEvent) {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  setGridZoom(gridZoom.value * Math.exp(-e.deltaY / 200));
}

// ─── New card ──────────────────────────────────────────────────────────────
// Right-click on empty grid space, or the toolbar button for touch. The card
// always lands at the end of the grid, then scrolls into view.

async function addCard() {
  try {
    const comp = await createBlankCardAtEnd();
    await nextTick();
    document
      .querySelector(`[data-companionship-id="${comp.id}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  } catch (e) {
    pushError(e);
  }
}

const menu = ref<{ x: number; y: number } | null>(null);
const menuItems: MenuItem[] = [{ label: 'New card', icon: PlusIcon, onClick: addCard }];

function onContextMenu(e: MouseEvent) {
  // Cards open their own menu.
  if ((e.target as HTMLElement).closest('[data-companionship-id]')) return;
  e.preventDefault();
  menu.value = { x: e.clientX, y: e.clientY };
}

const ordered = computed(() => {
  const districtRank = new Map(districts.items.map((d, i) => [d.id, i]));
  const key = (c: (typeof companionships.items)[number]) => {
    const d = c.district_id ? districts.byId.get(c.district_id) : undefined;
    if (!d) return [districts.items.length, 0, c.position_y, c.position_x];
    return [districtRank.get(d.id)!, columnIndexForX(d, c.position_x), c.position_y, 0];
  };
  return [...companionships.items].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
    return 0;
  });
});
</script>

<template>
  <!-- Left padding clears the floating sidebar (320px + its 16px margins). -->
  <div class="relative h-full">
    <div
      class="h-full overflow-y-auto bg-stone-100 p-8 pb-24 transition-[padding] duration-200"
      :class="sidebarOpen ? 'pl-[368px]' : ''"
      @wheel="onWheel"
      @contextmenu="onContextMenu"
    >
      <div :style="{ columnWidth: CARD_W + 'px', columnGap: '32px', zoom: gridZoom }">
        <div v-for="c in ordered" :key="c.id" class="mb-8 break-inside-avoid">
          <CompanionshipCard :companionship="c" :scale="1" layout="grid" />
        </div>
      </div>
    </div>

    <div
      class="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-stone-200 bg-white/95 px-1.5 py-1 shadow-lg backdrop-blur"
      style="bottom: max(1rem, env(safe-area-inset-bottom))"
    >
      <button
        class="flex h-10 items-center gap-1.5 rounded-full px-3 text-xs font-medium hover:bg-stone-100"
        title="Add a blank card at the end"
        @click="addCard"
      >
        <PlusIcon class="h-4 w-4 shrink-0" />
        <span>New card</span>
      </button>

      <span class="mx-1 h-5 w-px bg-stone-300"></span>

      <button
        class="h-10 w-10 rounded-full text-lg leading-none hover:bg-stone-100 disabled:opacity-40"
        title="Zoom out"
        aria-label="Zoom out"
        :disabled="gridZoom <= ZOOM_MIN + 0.001"
        @click="setGridZoom(gridZoom / ZOOM_STEP)"
      >
        −
      </button>
      <span class="min-w-[4ch] text-center text-xs tabular-nums text-stone-600">
        {{ Math.round(gridZoom * 100) }}%
      </span>
      <button
        class="h-10 w-10 rounded-full text-lg leading-none hover:bg-stone-100 disabled:opacity-40"
        title="Zoom in"
        aria-label="Zoom in"
        :disabled="gridZoom >= ZOOM_MAX - 0.001"
        @click="setGridZoom(gridZoom * ZOOM_STEP)"
      >
        +
      </button>
    </div>

    <CardContextMenu
      :open="!!menu"
      :x="menu?.x ?? 0"
      :y="menu?.y ?? 0"
      :items="menuItems"
      @close="menu = null"
    />
  </div>
</template>
