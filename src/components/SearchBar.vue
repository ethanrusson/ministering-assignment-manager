<script setup lang="ts">
// Cmd+F search overlay. Matches elder & household names that appear on the
// canvas (companionship cards). The first match is auto-focused; arrow keys
// and on-screen buttons step through matches. Esc closes.
//
// The parent passes us:
//   - the indexed list of "targets" (elder/household entries with their card)
//   - a callback to zoom + highlight a target
// Search filtering and navigation live here; nothing about Canvas internals.

import { computed, nextTick, ref, watch } from 'vue';
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from '@heroicons/vue/24/outline';

export interface SearchTarget {
  kind: 'elder' | 'household';
  id: string;
  name: string;
  companionshipId: string;
}

const props = defineProps<{
  open: boolean;
  targets: SearchTarget[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'goto', target: SearchTarget): void;
}>();

const query = ref('');
const cursor = ref(0);
const inputEl = ref<HTMLInputElement | null>(null);

const matches = computed<SearchTarget[]>(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return [];
  return props.targets.filter((t) => t.name.toLowerCase().includes(q));
});

watch(matches, (m) => {
  cursor.value = 0;
  if (m.length) emit('goto', m[0]);
});

watch(
  () => props.open,
  async (open) => {
    if (open) {
      await nextTick();
      inputEl.value?.focus();
      inputEl.value?.select();
    } else {
      query.value = '';
      cursor.value = 0;
    }
  },
);

function next() {
  if (!matches.value.length) return;
  cursor.value = (cursor.value + 1) % matches.value.length;
  emit('goto', matches.value[cursor.value]);
}
function prev() {
  if (!matches.value.length) return;
  cursor.value = (cursor.value - 1 + matches.value.length) % matches.value.length;
  emit('goto', matches.value[cursor.value]);
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
    emit('close');
  } else if (e.key === 'Enter' || e.key === 'ArrowDown') {
    e.preventDefault();
    next();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    prev();
  }
}
</script>

<template>
  <div
    v-if="open"
    class="absolute right-4 top-4 z-30 flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2 py-1.5 shadow-lg"
  >
    <MagnifyingGlassIcon class="h-4 w-4 text-stone-400" />
    <input
      ref="inputEl"
      v-model="query"
      type="text"
      placeholder="Search elders & households"
      class="w-56 bg-transparent text-sm focus:outline-none"
      @keydown="onKey"
    />
    <span class="min-w-[3rem] text-right text-xs tabular-nums text-stone-500">
      <template v-if="query.trim()">
        {{ matches.length ? `${cursor + 1}/${matches.length}` : '0/0' }}
      </template>
    </span>
    <button
      class="rounded p-1 text-stone-500 hover:bg-stone-100 disabled:opacity-30"
      title="Previous match"
      :disabled="!matches.length"
      @click="prev"
    >
      <ChevronUpIcon class="h-4 w-4" />
    </button>
    <button
      class="rounded p-1 text-stone-500 hover:bg-stone-100 disabled:opacity-30"
      title="Next match"
      :disabled="!matches.length"
      @click="next"
    >
      <ChevronDownIcon class="h-4 w-4" />
    </button>
    <button
      class="rounded p-1 text-stone-500 hover:bg-stone-100"
      title="Close (Esc)"
      @click="emit('close')"
    >
      <XMarkIcon class="h-4 w-4" />
    </button>
  </div>
</template>
