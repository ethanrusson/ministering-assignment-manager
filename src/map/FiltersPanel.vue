<script setup lang="ts">
// Color, filter and gaps for the map (docs/ward-map-prd.md, Phase 3). Counts
// come from the same flags as the map's fading and coloring, so they agree.
// Filters combine with AND across types and OR within a type.

import { computed } from 'vue';
import { XMarkIcon } from '@heroicons/vue/24/outline';
import { useCompanionshipsStore } from '@/stores/companionships';
import { useAuthStore } from '@/stores/auth';
import { useDistrictsStore } from '@/stores/districts';
import { useEldersStore } from '@/stores/elders';
import { useHouseholdsStore } from '@/stores/households';
import { useLabelsStore } from '@/stores/labels';
import { districtFamily, districtLabel } from '@/canvas/districtColors';
import { HOUSEHOLD_LIMIT, validateCompanionship } from '@/lib/validation';
import { labelChipStyle } from '@/lib/labelColors';
import {
  ELDER_FLAG_LABELS,
  HOUSEHOLD_FLAG_LABELS,
  type ElderFlag,
  type Flags,
  type HouseholdFlag,
} from '@/lib/flags';
import { STATUS_PAINT, type ColorBy, type MapFilters } from './mapFilters';

const props = defineProps<{
  flags: Flags;
  filters: MapFilters;
  colorBy: ColorBy;
  matchCount: number | null;
  showAreas: boolean;
  /** Districts whose area is in more than one piece. */
  splitDistricts: string[];
}>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'update:filters', v: MapFilters): void;
  (e: 'update:colorBy', v: ColorBy): void;
  (e: 'update:showAreas', v: boolean): void;
  (e: 'editBoundary'): void;
  (e: 'focusHousehold', id: string): void;
}>();

const households = useHouseholdsStore();
const auth = useAuthStore();
const elders = useEldersStore();
const labels = useLabelsStore();
const districts = useDistrictsStore();
const companionships = useCompanionshipsStore();

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

const householdGaps = computed(() =>
  (Object.keys(HOUSEHOLD_FLAG_LABELS) as HouseholdFlag[])
    .map((flag) => ({
      flag,
      label: HOUSEHOLD_FLAG_LABELS[flag],
      items: [...props.flags.households]
        .filter(([, f]) => f.includes(flag))
        .map(([id]) => ({ id, name: households.byId.get(id)?.name ?? '' }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter((g) => g.items.length),
);

const elderGaps = computed(() =>
  (Object.keys(ELDER_FLAG_LABELS) as ElderFlag[])
    .map((flag) => ({
      flag,
      label: ELDER_FLAG_LABELS[flag],
      items: [...props.flags.elders]
        .filter(([, f]) => f.includes(flag))
        .map(([id]) => elders.byId.get(id))
        .filter((e) => !!e)
        .map((e) => ({ id: e.id, name: e.name, home: e.home_household_id }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter((g) => g.items.length),
);

/**
 * Per district: households (by their companionship's district until Phase 6),
 * companionships, and slots at HOUSEHOLD_LIMIT each.
 */
const districtRows = computed(() =>
  districts.items.map((d, i) => {
    const comps = companionships.items.filter((c) => c.district_id === d.id);
    const homes = comps.reduce(
      (n, c) =>
        n +
        (companionships.householdsInCompanionship.get(c.id) ?? []).filter(
          (h) => households.byId.get(h)?.hidden === false,
        ).length,
      0,
    );
    const slots = comps.length * HOUSEHOLD_LIMIT;
    return { id: d.id, label: `${districtLabel(i)} · ${d.name}`, family: districtFamily(i), homes, comps: comps.length, slots, open: slots - homes };
  }),
);

/** Companionships breaking a board validation rule (over capacity, no district, …). */
const companionshipGaps = computed(() =>
  companionships.items
    .map((c) => {
      const ids = companionships.eldersInCompanionship.get(c.id) ?? [];
      const warnings = validateCompanionship({
        id: c.id,
        districtId: c.district_id,
        elders: ids.map((id) => elders.byId.get(id)).filter((e) => !!e).map((e) => ({ id: e.id, name: e.name, age: e.age })),
        householdCount: companionships.householdsInCompanionship.get(c.id)?.length ?? 0,
      });
      const first = ids.map((id) => elders.byId.get(id)?.home_household_id).find((h) => !!h) ?? null;
      return { id: c.id, names: ids.map((id) => elders.byId.get(id)?.name.split(',')[0]).join(' & ') || '(empty)', warnings, first };
    })
    .filter((c) => c.warnings.length),
);
</script>

<template>
  <div
    data-no-pan
    class="absolute bottom-24 right-4 top-16 z-20 flex w-80 cursor-default flex-col rounded-xl border border-stone-200 bg-white text-sm shadow-xl"
  >
    <header class="flex items-center justify-between border-b border-stone-200 px-3 py-2">
      <h2 class="font-semibold">Filters &amp; gaps</h2>
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

      <section v-if="districtRows.length">
        <div class="mb-1.5 flex items-center gap-2">
          <h3 class="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Districts</h3>
          <button
            v-if="auth.wardRole === 'admin'"
            type="button"
            class="ml-auto rounded-full border border-stone-300 px-2.5 py-0.5 text-xs hover:bg-stone-50"
            @click="emit('editBoundary')"
          >
            Edit boundary
          </button>
          <button
            type="button"
            class="rounded-full border px-2.5 py-0.5 text-xs"
            :class="[
              showAreas ? 'border-stone-800 bg-stone-800 text-white' : 'border-stone-300 hover:bg-stone-50',
              auth.wardRole === 'admin' ? '' : 'ml-auto',
            ]"
            :aria-pressed="showAreas"
            @click="emit('update:showAreas', !showAreas)"
          >
            District areas
          </button>
        </div>
        <p
          v-for="name in showAreas ? splitDistricts : []"
          :key="name"
          class="mb-1 rounded-md bg-amber-100 px-2 py-1 text-xs text-amber-800"
        >
          {{ name }} is in more than one piece.
        </p>
        <table class="w-full text-xs">
          <thead class="text-stone-500">
            <tr>
              <th class="text-left font-normal"></th>
              <th class="text-right font-normal">Homes</th>
              <th class="text-right font-normal">Comps</th>
              <th class="text-right font-normal">Slots</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in districtRows" :key="r.id">
              <td class="py-0.5">
                <span
                  class="rounded-full px-2 py-px font-semibold"
                  :style="{ backgroundColor: v(`${r.family}-100`), color: v(`${r.family}-700`) }"
                >
                  {{ r.label }}
                </span>
                <span class="ml-1" :class="r.open < 0 ? 'font-semibold text-red-700' : 'text-stone-500'">
                  {{ r.open < 0 ? `short ${-r.open}` : `${r.open} open` }}
                </span>
              </td>
              <td class="text-right tabular-nums">{{ r.homes }}</td>
              <td class="text-right tabular-nums">{{ r.comps }}</td>
              <td class="text-right tabular-nums">{{ r.slots }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h3 class="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">Gaps</h3>
        <p
          v-if="!householdGaps.length && !elderGaps.length && !companionshipGaps.length"
          class="text-stone-500"
        >
          Nothing flagged.
        </p>
        <details v-for="g in householdGaps" :key="'h-' + g.flag" class="mb-1">
          <summary class="cursor-pointer py-0.5">
            {{ g.label }} <span class="text-stone-500">({{ g.items.length }})</span>
          </summary>
          <ul class="ml-3 space-y-0.5 py-1">
            <li v-for="h in g.items" :key="h.id">
              <button type="button" class="text-left hover:underline" @click="emit('focusHousehold', h.id)">
                {{ h.name }}
              </button>
            </li>
          </ul>
        </details>
        <details v-for="g in elderGaps" :key="'e-' + g.flag" class="mb-1">
          <summary class="cursor-pointer py-0.5">
            {{ g.label }} <span class="text-stone-500">({{ g.items.length }})</span>
          </summary>
          <ul class="ml-3 space-y-0.5 py-1">
            <li v-for="e in g.items" :key="e.id">
              <button
                v-if="e.home"
                type="button"
                class="text-left hover:underline"
                @click="emit('focusHousehold', e.home)"
              >
                {{ e.name }}
              </button>
              <span v-else>{{ e.name }}</span>
            </li>
          </ul>
        </details>
        <details v-if="companionshipGaps.length" class="mb-1">
          <summary class="cursor-pointer py-0.5">
            Companionship warnings <span class="text-stone-500">({{ companionshipGaps.length }})</span>
          </summary>
          <ul class="ml-3 space-y-1 py-1">
            <li v-for="c in companionshipGaps" :key="c.id">
              <button
                v-if="c.first"
                type="button"
                class="text-left hover:underline"
                @click="emit('focusHousehold', c.first)"
              >
                {{ c.names }}
              </button>
              <span v-else>{{ c.names }}</span>
              <span class="block text-xs text-stone-500">{{ c.warnings.map((w) => w.message).join(' ') }}</span>
            </li>
          </ul>
        </details>
      </section>
    </div>
  </div>
</template>
