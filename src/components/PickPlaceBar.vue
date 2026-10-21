<script setup lang="ts">
// What you're carrying, and the way to put it back down. Sits above the
// canvas zoom controls; data-no-pan keeps a tap on it from being read as a
// destination.
import { computed } from 'vue';
import { usePickPlace } from '@/lib/usePickPlace';
import { useEldersStore } from '@/stores/elders';
import { useHouseholdsStore } from '@/stores/households';
import { XMarkIcon } from '@heroicons/vue/24/outline';

const { held, holding, cancel } = usePickPlace();
const elders = useEldersStore();
const households = useHouseholdsStore();

const label = computed(() => {
  const h = held.value;
  if (!h) return '';
  return h.kind === 'elder'
    ? (elders.byId.get(h.id)?.name ?? 'elder')
    : (households.byId.get(h.id)?.name ?? 'household');
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="holding"
      class="pointer-events-auto fixed left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-emerald-300 bg-emerald-600 py-1 pl-4 pr-1 text-sm text-white shadow-lg"
      style="bottom: calc(max(1rem, env(safe-area-inset-bottom)) + 3.5rem)"
      data-no-pan
    >
      <span class="truncate">Moving {{ label }}</span>
      <button
        class="flex h-8 w-8 items-center justify-center rounded-full hover:bg-emerald-500"
        title="Cancel"
        aria-label="Cancel move"
        @click="cancel"
      >
        <XMarkIcon class="h-4 w-4" />
      </button>
    </div>
  </Teleport>
</template>
