<script setup lang="ts">
import { computed, ref } from 'vue';
import { householdArea, MAP_AREA_MARGIN_M, type LatLng } from '@/map/geo';
import { parseHouses } from '@/map/homes';
import { useHouseholdsStore } from '@/stores/households';
import { useHomesStore } from '@/stores/homes';

defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const households = useHouseholdsStore();
const homes = useHomesStore();

const text = ref('');
const found = ref<LatLng[] | null>(null);
const phase = ref<'paste' | 'saving' | 'done'>('paste');
const errorMsg = ref<string | null>(null);

const command = computed(() => {
  const b = householdArea(
    households.visible
      .filter((h) => h.lat !== null && h.lng !== null)
      .map((h) => ({ lat: h.lat!, lng: h.lng! })),
    MAP_AREA_MARGIN_M,
  );
  return b
    ? `node scripts/footprints.ts ${[b.south, b.west, b.north, b.east].map((n) => n.toFixed(5)).join(',')} | pbcopy`
    : null;
});
const importedCount = computed(() => homes.items.filter((h) => h.source === 'footprint').length);

function close() {
  text.value = '';
  found.value = null;
  phase.value = 'paste';
  errorMsg.value = null;
  emit('close');
}

function read() {
  errorMsg.value = null;
  try {
    found.value = parseHouses(text.value);
  } catch (e: unknown) {
    found.value = null;
    errorMsg.value = e instanceof Error ? e.message : 'Could not read that.';
  }
}

async function save() {
  if (!found.value) return;
  phase.value = 'saving';
  errorMsg.value = null;
  try {
    await homes.replaceFootprints(found.value);
    phase.value = 'done';
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : 'Save failed.';
    phase.value = 'paste';
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
      <div class="flex w-full max-w-lg flex-col rounded-lg bg-white shadow-xl">
        <header class="flex items-center justify-between border-b border-stone-200 px-5 py-3">
          <h2 class="text-lg font-semibold">Import houses</h2>
          <button class="rounded p-1 hover:bg-stone-100" @click="close">×</button>
        </header>

        <div class="space-y-3 p-5 text-sm">
          <template v-if="phase !== 'done'">
            <p v-if="!command" class="text-stone-600">Import household locations first.</p>
            <template v-else>
              <p class="text-stone-600">
                In the project folder, run this, then paste the result below:
              </p>
              <code class="block select-all break-all rounded bg-stone-100 px-2 py-1.5 text-xs">
                {{ command }}
              </code>
              <textarea
                v-model="text"
                rows="5"
                spellcheck="false"
                class="w-full rounded border border-stone-300 px-3 py-2 font-mono text-xs"
                placeholder="[{&quot;lat&quot;:…"
                @input="read"
              />
            </template>
            <p v-if="found">
              {{ found.length }} houses.
              <span v-if="importedCount" class="text-stone-500">
                Replaces the {{ importedCount }} imported before; hand-placed houses stay.
              </span>
            </p>
            <p v-if="errorMsg && text.trim()" class="text-danger-600">{{ errorMsg }}</p>
            <div class="flex justify-end gap-2">
              <button
                class="rounded border border-stone-300 px-3 py-1 hover:bg-stone-50"
                @click="close"
              >
                Cancel
              </button>
              <button
                class="rounded bg-stone-900 px-3 py-1 text-white disabled:opacity-50"
                :disabled="!found || phase === 'saving'"
                @click="save"
              >
                {{ phase === 'saving' ? 'Saving…' : 'Save' }}
              </button>
            </div>
          </template>

          <template v-else>
            <p>Saved {{ found?.length }} houses.</p>
            <div class="flex justify-end">
              <button class="rounded bg-stone-900 px-3 py-1 text-white" @click="close">Done</button>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>
