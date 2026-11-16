<script setup lang="ts">
import { computed, ref } from 'vue';
import { parseDirectory } from '@/lib/lcr/directory';
import { planLocationImport, type LocationPlan } from '@/lib/lcr/locations';
import { MOVED_THRESHOLD_M, planReviews, type ReviewPlan } from '@/lib/lcr/reviews';
import { useLocationReviewsStore } from '@/stores/locationReviews';
import { useAuthStore } from '@/stores/auth';
import { boundaryRing } from '@/map/boundary';
import { useEldersStore } from '@/stores/elders';
import { useHouseholdsStore } from '@/stores/households';

defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const elders = useEldersStore();
const households = useHouseholdsStore();
const reviews = useLocationReviewsStore();
const auth = useAuthStore();

const text = ref('');
const found = ref(0);
const warnings = ref<string[]>([]);
const plan = ref<LocationPlan | null>(null);
const reviewPlan = ref<ReviewPlan | null>(null);
const phase = ref<'paste' | 'preview' | 'applying' | 'done'>('paste');
const errorMsg = ref<string | null>(null);
const applyLog = ref<string[]>([]);

function reset() {
  text.value = '';
  found.value = 0;
  warnings.value = [];
  plan.value = null;
  reviewPlan.value = null;
  phase.value = 'paste';
  errorMsg.value = null;
  applyLog.value = [];
}

function close() {
  reset();
  emit('close');
}

function preview() {
  errorMsg.value = null;
  try {
    const parsed = parseDirectory(text.value);
    // The paste holds contact details; drop it as soon as it's parsed.
    text.value = '';
    found.value = parsed.households.length;
    warnings.value = parsed.warnings;
    plan.value = planLocationImport(parsed, {
      households: households.visible.map((h) => ({
        id: h.id,
        name: h.name,
        lcrUuid: h.lcr_uuid,
        lat: h.lat,
        lng: h.lng,
      })),
      elders: elders.visible.map((e) => ({
        id: e.id,
        name: e.name,
        lcrUuid: e.lcr_uuid,
        homeHouseholdId: e.home_household_id,
      })),
    });
    reviewPlan.value = planReviews({
      households: households.visible.map((h) => ({
        id: h.id,
        lat: h.lat,
        lng: h.lng,
        source: h.location_source,
      })),
      updates: plan.value.locationUpdates,
      noLcrLocation: [...plan.value.noLocation, ...plan.value.notInDirectory].map((h) => h.id),
      boundary: auth.wardBoundary ? boundaryRing(auth.wardBoundary) : null,
      reviews: reviews.items.map((r) => ({
        id: r.id,
        householdId: r.household_id,
        kind: r.kind,
        status: r.status,
        data: r.data,
      })),
    });
    phase.value = 'preview';
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : 'Failed to parse.';
  }
}

const movedCount = computed(
  () =>
    (reviewPlan.value?.insert.filter((r) => r.kind === 'moved').length ?? 0) +
    (reviewPlan.value?.update.length ?? 0),
);

async function apply() {
  const p = plan.value;
  const r = reviewPlan.value;
  if (!p || !r) return;
  phase.value = 'applying';
  errorMsg.value = null;
  try {
    await households.setLocations(p.locationUpdates);
    applyLog.value.push(`Updated ${p.locationUpdates.length} household locations.`);
    for (const l of p.homeLinks) {
      await elders.update(l.elderId, { home_household_id: l.householdId });
    }
    applyLog.value.push(`Linked ${p.homeLinks.length} elders to their home.`);
    await reviews.apply(r);
    if (r.manualReplaced.length) {
      applyLog.value.push(`Replaced ${r.manualReplaced.length} hand-placed locations with LCR's.`);
    }
    const added = r.insert.length + r.update.length;
    if (added) applyLog.value.push(`${added} to review under Locations on the map.`);
    phase.value = 'done';
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : 'Apply failed.';
    phase.value = 'preview';
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="close"
    >
      <div class="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl">
        <header class="flex items-center justify-between border-b border-stone-200 px-5 py-3">
          <h2 class="text-lg font-semibold">Import locations</h2>
          <button class="rounded p-1 hover:bg-stone-100" @click="close">×</button>
        </header>

        <div class="flex-1 overflow-y-auto p-5">
          <div v-if="phase === 'paste'" class="space-y-3">
            <p class="text-sm text-stone-600">
              Sign in to the Member Directory, then open
              <span class="font-mono text-xs">
                directory.churchofjesuschrist.org/api/v4/households?unit=</span
              ><span class="font-mono text-xs italic">your unit number</span>
              (the number in the directory's address bar). Select all, copy, and paste below.
            </p>
            <textarea
              v-model="text"
              rows="10"
              spellcheck="false"
              class="w-full rounded border border-stone-300 px-3 py-2 font-mono text-xs"
              placeholder="[{&quot;uuid&quot;:…"
            />
            <p v-if="errorMsg" class="text-sm text-danger-600">{{ errorMsg }}</p>
            <div class="flex justify-end gap-2">
              <button
                class="rounded border border-stone-300 px-3 py-1 text-sm hover:bg-stone-50"
                @click="close"
              >
                Cancel
              </button>
              <button
                class="rounded bg-stone-900 px-3 py-1 text-sm text-white disabled:opacity-50"
                :disabled="!text.trim()"
                @click="preview"
              >
                Parse &amp; Preview
              </button>
            </div>
          </div>

          <div v-else-if="phase === 'preview' && plan" class="space-y-4">
            <ul class="space-y-1 rounded border border-stone-200 bg-stone-50 p-3 text-sm">
              <li>{{ found }} households in the directory</li>
              <li>
                {{ plan.locationUpdates.length }} locations to update
                <span class="text-stone-500">({{ plan.unchanged }} already match)</span>
              </li>
              <li>{{ plan.homeLinks.length }} elders to link to their home</li>
              <li v-if="movedCount">
                {{ movedCount }} moved more than {{ MOVED_THRESHOLD_M }} m (to review)
              </li>
              <li v-if="reviewPlan?.manualReplaced.length">
                {{ reviewPlan.manualReplaced.length }} hand-placed locations replaced by LCR's
              </li>
            </ul>

            <div
              v-if="warnings.length"
              class="rounded border border-warn-200 bg-warn-50 px-3 py-2 text-xs text-warn-600"
            >
              <p v-for="(w, i) in warnings" :key="i">⚠️ {{ w }}</p>
            </div>

            <details v-if="plan.noLocation.length" class="rounded border border-stone-200">
              <summary class="cursor-pointer px-3 py-2 text-sm font-medium">
                No location in the directory ({{ plan.noLocation.length }})
              </summary>
              <ul class="max-h-40 space-y-0.5 overflow-y-auto px-3 py-2 text-xs">
                <li v-for="h in plan.noLocation" :key="h.id">{{ h.name }}</li>
              </ul>
            </details>

            <details v-if="plan.notInDirectory.length" class="rounded border border-stone-200">
              <summary class="cursor-pointer px-3 py-2 text-sm font-medium">
                Households not found in the directory ({{ plan.notInDirectory.length }})
              </summary>
              <ul class="max-h-40 space-y-0.5 overflow-y-auto px-3 py-2 text-xs">
                <li v-for="h in plan.notInDirectory" :key="h.id">{{ h.name }}</li>
              </ul>
            </details>

            <details v-if="plan.eldersUnlinked.length" class="rounded border border-stone-200">
              <summary class="cursor-pointer px-3 py-2 text-sm font-medium">
                Elders without a home ({{ plan.eldersUnlinked.length }})
              </summary>
              <ul class="max-h-40 space-y-0.5 overflow-y-auto px-3 py-2 text-xs">
                <li v-for="e in plan.eldersUnlinked" :key="e.id">{{ e.name }}</li>
              </ul>
            </details>

            <p v-if="errorMsg" class="text-sm text-danger-600">{{ errorMsg }}</p>

            <div class="flex justify-end gap-2">
              <button
                class="rounded border border-stone-300 px-3 py-1 text-sm hover:bg-stone-50"
                @click="reset"
              >
                Back
              </button>
              <button
                class="rounded bg-stone-900 px-3 py-1 text-sm text-white disabled:opacity-50"
                :disabled="
                  !plan.locationUpdates.length &&
                  !plan.homeLinks.length &&
                  !reviewPlan?.insert.length &&
                  !reviewPlan?.resolve.length
                "
                @click="apply"
              >
                Apply
              </button>
            </div>
          </div>

          <div v-else-if="phase === 'applying'" class="py-12 text-center">
            <p class="text-sm text-stone-600">Writing changes…</p>
          </div>

          <div v-else-if="phase === 'done'" class="space-y-3">
            <ul class="space-y-1 rounded border border-stone-200 bg-stone-50 p-3 text-sm">
              <li v-for="(line, i) in applyLog" :key="i">{{ line }}</li>
            </ul>
            <div class="flex justify-end">
              <button class="rounded bg-stone-900 px-3 py-1 text-sm text-white" @click="close">
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
