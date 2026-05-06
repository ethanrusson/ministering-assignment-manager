<script setup lang="ts">
import { computed, ref } from 'vue';
import { useCompanionshipsStore } from '@/stores/companionships';
import { useEldersStore } from '@/stores/elders';
import { useHouseholdsStore } from '@/stores/households';
import { useDistrictsStore } from '@/stores/districts';
import { useSnapshot } from '@/canvas/useSnapshot';
import { generateChangeList, changeListToText } from '@/lib/changeList';

defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const companionships = useCompanionshipsStore();
const elders = useEldersStore();
const households = useHouseholdsStore();
const districts = useDistrictsStore();
const snap = useSnapshot();

const copied = ref(false);

const groups = computed(() => {
  if (!snap.snapshot.value) return [];
  return generateChangeList(
    snap.snapshot.value,
    companionships.elderLinks,
    companionships.householdLinks,
    elders.byId,
    households.byId,
    companionships.items,
    companionships.eldersInCompanionship,
    districts.items,
  );
});

const hasChanges = computed(() => groups.value.length > 0);

async function copyToClipboard() {
  const text = changeListToText(groups.value);
  await navigator.clipboard.writeText(text);
  copied.value = true;
  setTimeout(() => { copied.value = false; }, 2000);
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="emit('close')"
    >
      <div class="flex w-full max-w-lg flex-col rounded-lg bg-white shadow-xl" style="max-height: 80vh">
        <!-- Header -->
        <header class="flex shrink-0 items-center justify-between border-b border-stone-200 px-5 py-4">
          <h2 class="text-lg font-semibold">Changes since snapshot</h2>
          <div class="flex items-center gap-2">
            <button
              v-if="hasChanges"
              class="rounded border border-stone-300 px-3 py-1 text-sm hover:bg-stone-50"
              :class="copied ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : ''"
              @click="copyToClipboard"
            >
              {{ copied ? 'Copied!' : 'Copy' }}
            </button>
            <button class="rounded p-1 hover:bg-stone-100 text-lg leading-none" @click="emit('close')">×</button>
          </div>
        </header>

        <!-- Body -->
        <div class="overflow-y-auto px-5 py-4">
          <!-- No changes -->
          <p v-if="!hasChanges" class="text-center text-sm text-stone-400 py-8">
            No changes since the snapshot was saved.
          </p>

          <!-- Change groups -->
          <div v-else class="space-y-5">
            <div v-for="group in groups" :key="group.companionshipId ?? 'unassigned'">
              <!-- Group header -->
              <div class="mb-2">
                <p v-if="group.districtName" class="text-xs font-medium uppercase tracking-wide text-stone-400">
                  {{ group.districtName }}
                </p>
                <p class="text-sm font-semibold text-stone-800">{{ group.title }}</p>
              </div>
              <!-- Entries -->
              <ul class="space-y-1">
                <li
                  v-for="(entry, i) in group.entries"
                  :key="i"
                  class="flex items-center gap-2 text-sm text-stone-700"
                >
                  <span class="text-stone-400">•</span>
                  <span>
                    <span class="font-medium">{{ entry.name }}</span>
                    <span class="text-stone-400"> moved to </span>
                    <span class="font-medium">{{ group.title }}</span>
                  </span>
                  <span
                    class="ml-auto shrink-0 rounded-full px-2 py-0.5 text-xs"
                    :class="entry.kind === 'elder'
                      ? 'bg-stone-100 text-stone-500'
                      : 'bg-amber-50 text-amber-600'"
                  >
                    {{ entry.kind }}
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
