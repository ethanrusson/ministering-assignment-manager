<script setup lang="ts">
// How the map looks (docs/ward-map-prd.md, Phases 3 and 6): colour, what's
// drawn, and filters. Filters combine with AND across types and OR within a type.

import { computed } from 'vue';
import { XMarkIcon } from '@heroicons/vue/24/outline';
import { useDistrictsStore } from '@/stores/districts';
import { useLabelsStore } from '@/stores/labels';
import { districtLabel } from '@/canvas/districtColors';
import { labelChipStyle } from '@/lib/labelColors';
import { HOUSEHOLD_FLAG_LABELS } from '@/lib/flags';
import { STATUS_PAINT, type ColorBy, type MapFilters } from './mapFilters';

const props = defineProps<{
  filters: MapFilters;
  colorBy: ColorBy;
  matchCount: number | null;
  showAreas: boolean;
  showAll: boolean;
}>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'update:filters', v: MapFilters): void;
  (e: 'update:colorBy', v: ColorBy): void;
  (e: 'update:showAreas', v: boolean): void;
  (e: 'update:showAll', v: boolean): void;
}>();

const labels = useLabelsStore();
const districts = useDistrictsStore();

const v = (name: string) => `rgb(var(--c-${name}))`;

function toggle<K extends keyof MapFilters>(key: K, value: MapFilters[K] extends Set<infer T> ? T : never) {
  const next = new Set(props.filters[key] as Set<unknown>);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  emit('update:filters', { ...props.filters, [key]: next });
}

const anyFilter = computed(
  () => props.filters.labels.size + props.filters.flags.size + props.filters.districts.size > 0,
);

function clear() {
  emit('update:filters', { labels: new Set(), flags: new Set(), districts: new Set() });
}
</script>

<template>
  <div
    data-no-pan
    class="absolute bottom-24 right-4 top-16 z-20 flex w-80 cursor-default flex-col rounded-xl border border-stone-200 bg-white text-sm shadow-xl"
  >
    <header class="flex items-center justify-between border-b border-stone-200 px-3 py-2">
      <h2 class="font-semibold">Display</h2>
      <button
        type="button"
        class="rounded-md p-1 text-stone-500 hover:bg-stone-100"
        aria-label="Close"
        @click="emit('close')"
      >
        <XMarkIcon class="h-4 w-4" />
      </button>
    </header>

    <div class="flex-1 space-y-4 overflow-y-auto p-3">
      <section>
        <h3 class="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">Color by</h3>
        <div class="flex flex-wrap gap-1">
          <button
            v-for="opt in [{ value: 'district', label: 'District' }, { value: 'status', label: 'Status' }, ...labels.shown.map((l) => ({ value: l.id, label: l.name }))]"
            :key="opt.value"
            type="button"
            class="rounded-full border px-2.5 py-0.5 text-xs"
            :class="colorBy === opt.value ? 'border-stone-800 bg-stone-800 text-white' : 'border-stone-300 hover:bg-stone-50'"
            :aria-pressed="colorBy === opt.value"
            @click="emit('update:colorBy', opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
        <ul v-if="colorBy === 'status'" class="mt-2 space-y-1 text-xs text-stone-600">
          <li v-for="(p, key) in STATUS_PAINT" :key="key" class="flex items-center gap-2">
            <span
              class="h-3.5 w-3.5 rounded"
              :style="{ backgroundColor: v(p.fill), border: `2px solid ${v(p.border)}` }"
            />
            {{ p.label }}
          </li>
        </ul>
      </section>

      <section>
        <h3 class="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">Show</h3>
        <div class="flex flex-wrap gap-1">
          <button
            type="button"
            class="rounded-full border px-2.5 py-0.5 text-xs"
            :class="showAll ? 'border-stone-800 bg-stone-800 text-white' : 'border-stone-300 hover:bg-stone-50'"
            :aria-pressed="showAll"
            @click="emit('update:showAll', !showAll)"
          >
            All connections
          </button>
          <button
            type="button"
            class="rounded-full border px-2.5 py-0.5 text-xs"
            :class="showAreas ? 'border-stone-800 bg-stone-800 text-white' : 'border-stone-300 hover:bg-stone-50'"
            :aria-pressed="showAreas"
            @click="emit('update:showAreas', !showAreas)"
          >
            District shapes
          </button>
        </div>
      </section>

      <section>
        <div class="mb-1.5 flex items-baseline gap-2">
          <h3 class="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Show only</h3>
          <span v-if="matchCount !== null" class="text-xs text-stone-500">{{ matchCount }} households</span>
          <button v-if="anyFilter" type="button" class="ml-auto text-xs text-blue-700 hover:underline" @click="clear">
            Clear
          </button>
        </div>
        <div class="space-y-1.5">
          <div v-if="labels.shown.length" class="flex flex-wrap gap-1">
            <button
              v-for="l in labels.shown"
              :key="l.id"
              type="button"
              class="rounded-full border px-2 py-0.5 text-xs"
              :class="filters.labels.has(l.id) ? 'font-semibold' : ''"
              :style="labelChipStyle(l.color, filters.labels.has(l.id))"
              :aria-pressed="filters.labels.has(l.id)"
              @click="toggle('labels', l.id)"
            >
              {{ l.name }}
            </button>
          </div>
          <div class="flex flex-wrap gap-1">
            <button
              v-for="(label, flag) in HOUSEHOLD_FLAG_LABELS"
              :key="flag"
              type="button"
              class="rounded-full border px-2 py-0.5 text-xs"
              :class="filters.flags.has(flag) ? 'border-stone-800 bg-stone-800 text-white' : 'border-stone-200 hover:bg-stone-50'"
              :aria-pressed="filters.flags.has(flag)"
              @click="toggle('flags', flag)"
            >
              {{ label }}
            </button>
          </div>
          <div class="flex flex-wrap gap-1">
            <button
              v-for="(d, i) in districts.items"
              :key="d.id"
              type="button"
              class="rounded-full border px-2 py-0.5 text-xs"
              :class="filters.districts.has(i) ? 'border-stone-800 bg-stone-800 text-white' : 'border-stone-200 hover:bg-stone-50'"
              :aria-pressed="filters.districts.has(i)"
              @click="toggle('districts', i)"
            >
              {{ districtLabel(i) }} · {{ d.name }}
            </button>
          </div>
        </div>
      </section>


    </div>
  </div>
</template>
