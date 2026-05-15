<script setup lang="ts">
// Floating menu popover for a companionship card. Teleported to body so it
// can render above the card's overflow:hidden clip.
//
// Position is given in screen pixels. The menu auto-flips against viewport
// edges so it never spills off-screen.

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

export interface MenuItem {
  label: string;
  /** Tailwind class for an optional accent (e.g. 'text-danger-600'). */
  variant?: 'default' | 'danger';
  onClick: () => void | Promise<void>;
}

const props = defineProps<{
  open: boolean;
  x: number;
  y: number;
  items: MenuItem[];
}>();

const emit = defineEmits<{ (e: 'close'): void }>();

const MENU_W = 200;
const ITEM_H = 32;

const menuEl = ref<HTMLDivElement | null>(null);

const adjustedPos = computed(() => {
  const margin = 8;
  const h = props.items.length * ITEM_H + 8;
  let left = props.x;
  let top = props.y;
  if (typeof window !== 'undefined') {
    if (left + MENU_W + margin > window.innerWidth) left = window.innerWidth - MENU_W - margin;
    if (top + h + margin > window.innerHeight) top = props.y - h;
    if (left < margin) left = margin;
    if (top < margin) top = margin;
  }
  return { left, top };
});

function onDocPointerDown(e: PointerEvent) {
  if (!props.open) return;
  if (menuEl.value && e.target instanceof Node && menuEl.value.contains(e.target)) return;
  emit('close');
}
function onKey(e: KeyboardEvent) {
  if (props.open && e.key === 'Escape') emit('close');
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      document.addEventListener('pointerdown', onDocPointerDown, true);
      document.addEventListener('keydown', onKey);
    } else {
      document.removeEventListener('pointerdown', onDocPointerDown, true);
      document.removeEventListener('keydown', onKey);
    }
  },
);

onMounted(() => {
  if (props.open) {
    document.addEventListener('pointerdown', onDocPointerDown, true);
    document.addEventListener('keydown', onKey);
  }
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true);
  document.removeEventListener('keydown', onKey);
});

async function pick(item: MenuItem) {
  emit('close');
  await item.onClick();
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      ref="menuEl"
      class="fixed z-50 min-w-[200px] overflow-hidden rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
      :style="{ left: adjustedPos.left + 'px', top: adjustedPos.top + 'px' }"
      data-no-pan
      @pointerdown.stop
      @contextmenu.prevent
    >
      <button
        v-for="(item, i) in items"
        :key="i"
        class="block w-full px-3 py-1.5 text-left text-sm hover:bg-stone-100"
        :class="item.variant === 'danger' ? 'text-danger-600' : 'text-stone-700'"
        @click="pick(item)"
      >
        {{ item.label }}
      </button>
    </div>
  </Teleport>
</template>
