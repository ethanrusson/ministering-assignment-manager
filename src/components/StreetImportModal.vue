<script setup lang="ts">
import { computed, ref } from 'vue';
import { householdArea, MAP_AREA_MARGIN_M } from '@/map/geo';
import { OVERPASS_URL, overpassQuery, parseOverpass, type ImportedStreet } from '@/map/streets';
import { useHouseholdsStore } from '@/stores/households';
import { useStreetsStore } from '@/stores/streets';

defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const households = useHouseholdsStore();
const streets = useStreetsStore();

const phase = ref<'start' | 'fetching' | 'preview' | 'saving' | 'done'>('start');
const errorMsg = ref<string | null>(null);
const found = ref<ImportedStreet[]>([]);

const area = computed(() =>
  householdArea(
    households.visible
      .filter((h) => h.lat !== null && h.lng !== null)
      .map((h) => ({ lat: h.lat!, lng: h.lng! })),
    MAP_AREA_MARGIN_M,
  ),
);
const importedCount = computed(() => streets.items.filter((s) => s.source === 'osm').length);
const byKind = computed(() => ({
  main: found.value.filter((s) => s.kind === 'main').length,
  residential: found.value.filter((s) => s.kind === 'residential').length,
  lane: found.value.filter((s) => s.kind === 'lane').length,
}));

function close() {
  phase.value = 'start';
  errorMsg.value = null;
  found.value = [];
  emit('close');
}

async function download() {
  if (!area.value) return;
  phase.value = 'fetching';
  errorMsg.value = null;
  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(overpassQuery(area.value))}`,
    });
    if (!res.ok) {
      throw new Error(
        [429, 502, 503, 504].includes(res.status)
          ? 'OpenStreetMap is busy. Try again in a minute.'
          : `OpenStreetMap returned an error (${res.status}).`,
      );
    }
    found.value = parseOverpass(await res.json());
    phase.value = 'preview';
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : 'Download failed.';
    phase.value = 'start';
  }
}

async function save() {
  phase.value = 'saving';
  errorMsg.value = null;
  try {
    await streets.replaceImported(found.value);
    phase.value = 'done';
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : 'Save failed.';
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
      <div class="flex w-full max-w-md flex-col rounded-lg bg-white shadow-xl">
        <header class="flex items-center justify-between border-b border-stone-200 px-5 py-3">
          <h2 class="text-lg font-semibold">Import streets</h2>
          <button class="rounded p-1 hover:bg-stone-100" @click="close">×</button>
        </header>

        <div class="space-y-3 p-5 text-sm">
          <template v-if="phase === 'start' || phase === 'fetching'">
            <p v-if="!area" class="text-stone-600">Import household locations first.</p>
            <p v-else class="text-stone-600">
              Downloads the streets around your households from OpenStreetMap. Only the map's
              rectangle is sent.
            </p>
            <p v-if="importedCount" class="text-stone-500">
              Replaces the {{ importedCount }} streets imported before.
            </p>
            <p v-if="errorMsg" class="text-danger-600">{{ errorMsg }}</p>
            <div class="flex justify-end gap-2">
              <button
                class="rounded border border-stone-300 px-3 py-1 hover:bg-stone-50"
                @click="close"
              >
                Cancel
              </button>
              <button
                class="rounded bg-stone-900 px-3 py-1 text-white disabled:opacity-50"
                :disabled="!area || phase === 'fetching'"
                @click="download"
              >
                {{ phase === 'fetching' ? 'Downloading…' : 'Download' }}
              </button>
            </div>
          </template>

          <template v-else-if="phase === 'preview' || phase === 'saving'">
            <ul class="space-y-1 rounded border border-stone-200 bg-stone-50 p-3">
              <li>{{ byKind.main }} main roads</li>
              <li>{{ byKind.residential }} residential streets</li>
              <li>{{ byKind.lane }} lanes</li>
            </ul>
            <p v-if="importedCount" class="text-stone-500">
              Replaces the {{ importedCount }} streets imported before.
            </p>
            <p v-if="errorMsg" class="text-danger-600">{{ errorMsg }}</p>
            <div class="flex justify-end gap-2">
              <button
                class="rounded border border-stone-300 px-3 py-1 hover:bg-stone-50"
                @click="close"
              >
                Cancel
              </button>
              <button
                class="rounded bg-stone-900 px-3 py-1 text-white disabled:opacity-50"
                :disabled="!found.length || phase === 'saving'"
                @click="save"
              >
                {{ phase === 'saving' ? 'Saving…' : 'Save' }}
              </button>
            </div>
          </template>

          <template v-else>
            <p>Saved {{ found.length }} streets.</p>
            <div class="flex justify-end">
              <button class="rounded bg-stone-900 px-3 py-1 text-white" @click="close">Done</button>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>
