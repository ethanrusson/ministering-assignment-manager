<script setup lang="ts">
// Gaps on the map (docs/ward-map-prd.md, Phase 3): households and elders by
// flag, and companionships breaking a board rule. Counts come from the same
// flags as the map's coloring, so they agree.

import { computed } from 'vue';
import { XMarkIcon } from '@heroicons/vue/24/outline';
import { useCompanionshipsStore } from '@/stores/companionships';
import { useEldersStore } from '@/stores/elders';
import { useHouseholdsStore } from '@/stores/households';
import { validateCompanionship } from '@/lib/validation';
import {
  ELDER_FLAG_LABELS,
  HOUSEHOLD_FLAG_LABELS,
  type ElderFlag,
  type Flags,
  type HouseholdFlag,
} from '@/lib/flags';

const props = defineProps<{ flags: Flags }>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'focusHousehold', id: string): void;
}>();

const households = useHouseholdsStore();
const elders = useEldersStore();
const companionships = useCompanionshipsStore();

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
      <h2 class="font-semibold">Gaps</h2>
      <button
        type="button"
        class="rounded-md p-1 text-stone-500 hover:bg-stone-100"
        aria-label="Close"
        @click="emit('close')"
      >
        <XMarkIcon class="h-4 w-4" />
      </button>
    </header>

    <div class="flex-1 overflow-y-auto p-3">
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
    </div>
  </div>
</template>
