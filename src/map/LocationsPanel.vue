<script setup lang="ts">
// The locations review queue (docs/ward-map-prd.md, Phase 2): households with
// no location, households that moved, and elders not yet linked to a home.
// Placing and picking happen on the map, so this panel only asks the map to
// start them.

import { computed } from 'vue';
import { XMarkIcon } from '@heroicons/vue/24/outline';
import { useEldersStore } from '@/stores/elders';
import { useHouseholdsStore } from '@/stores/households';
import { useLocationReviewsStore } from '@/stores/locationReviews';
import { pushError } from '@/lib/errorToast';
import { distance, formatMiles, project } from './geo';
import type { MovedData } from '@/lib/lcr/reviews';

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'focus', householdId: string): void;
  (e: 'place', householdId: string): void;
  (e: 'pickHome', elderId: string): void;
}>();

const elders = useEldersStore();
const households = useHouseholdsStore();
const reviews = useLocationReviewsStore();

const openFor = (kind: 'no_location' | 'moved') =>
  reviews.open.filter((r) => r.kind === kind && households.byId.get(r.household_id)?.hidden === false);

const unplaced = computed(() =>
  openFor('no_location').map((r) => ({ review: r, name: households.byId.get(r.household_id)!.name })),
);
const moved = computed(() =>
  openFor('moved').map((r) => {
    const d = r.data as MovedData;
    return {
      review: r,
      name: households.byId.get(r.household_id)!.name,
      far: formatMiles(distance({ x: 0, y: 0 }, project(d.to, d.from))),
    };
  }),
);
const homeless = computed(() => elders.visible.filter((e) => !e.home_household_id));

async function run(action: () => Promise<void>) {
  try {
    await action();
  } catch (e) {
    pushError(e);
  }
}
</script>

<template>
  <div
    data-no-pan
    class="absolute bottom-24 right-4 top-16 z-20 flex w-72 cursor-default flex-col rounded-xl border border-stone-200 bg-white text-sm shadow-xl"
  >
    <header class="flex items-center justify-between border-b border-stone-200 px-3 py-2">
      <h2 class="font-semibold">Locations</h2>
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
      <p v-if="!unplaced.length && !moved.length && !homeless.length" class="text-stone-500">
        Nothing to review.
      </p>

      <section v-if="unplaced.length">
        <h3 class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
          No location ({{ unplaced.length }})
        </h3>
        <ul class="space-y-1">
          <li v-for="u in unplaced" :key="u.review.id" class="flex items-center gap-2">
            <span class="min-w-0 flex-1 truncate">{{ u.name }}</span>
            <button
              type="button"
              class="rounded border border-stone-300 px-2 py-0.5 text-xs hover:bg-stone-50"
              @click="emit('place', u.review.household_id)"
            >
              Place
            </button>
            <button
              type="button"
              class="rounded px-1.5 py-0.5 text-xs text-stone-500 hover:bg-stone-100"
              @click="run(() => reviews.dismiss(u.review.id, 'left unplaced'))"
            >
              Leave
            </button>
          </li>
        </ul>
      </section>

      <section v-if="moved.length">
        <h3 class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
          Moved ({{ moved.length }})
        </h3>
        <ul class="space-y-1">
          <li v-for="m in moved" :key="m.review.id" class="flex items-center gap-2">
            <button
              type="button"
              class="min-w-0 flex-1 truncate text-left hover:underline"
              @click="emit('focus', m.review.household_id)"
            >
              {{ m.name }} <span class="text-stone-500">· {{ m.far }}</span>
            </button>
            <button
              type="button"
              class="rounded border border-stone-300 px-2 py-0.5 text-xs hover:bg-stone-50"
              @click="run(() => reviews.resolve(m.review.id, 'accepted'))"
            >
              Accept
            </button>
          </li>
        </ul>
      </section>

      <section v-if="homeless.length">
        <h3 class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
          Elders without a home ({{ homeless.length }})
        </h3>
        <ul class="space-y-1">
          <li v-for="e in homeless" :key="e.id" class="flex items-center gap-2">
            <span class="min-w-0 flex-1 truncate">{{ e.name }}</span>
            <button
              type="button"
              class="rounded border border-stone-300 px-2 py-0.5 text-xs hover:bg-stone-50"
              @click="emit('pickHome', e.id)"
            >
              Pick home
            </button>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
