<script setup lang="ts">
// Toggle a household's labels. Only labels that may be shown right now are
// listed; a hidden sensitive label stays on the household untouched.

import { computed } from 'vue';
import { useHouseholdsStore } from '@/stores/households';
import { useLabelsStore } from '@/stores/labels';
import { pushError } from '@/lib/errorToast';
import { labelChipStyle } from '@/lib/labelColors';

const props = defineProps<{ householdId: string }>();

const households = useHouseholdsStore();
const labels = useLabelsStore();

const current = computed(() => new Set(households.labelsForHousehold.get(props.householdId) ?? []));

async function toggle(labelId: string) {
  const next = new Set(current.value);
  if (next.has(labelId)) next.delete(labelId);
  else next.add(labelId);
  try {
    await households.setLabels(props.householdId, [...next]);
  } catch (e) {
    pushError(e);
  }
}
</script>

<template>
  <div class="flex flex-wrap gap-1">
    <button
      v-for="l in labels.shown"
      :key="l.id"
      type="button"
      class="rounded-full border px-2 py-0.5 text-[11px] font-medium"
      :style="labelChipStyle(l.color, current.has(l.id))"
      :aria-pressed="current.has(l.id)"
      @pointerdown.stop
      @click.stop="toggle(l.id)"
    >
      {{ l.name }}
    </button>
    <span v-if="!labels.shown.length" class="text-xs text-stone-400">
      No labels yet (Settings → Manage Labels).
    </span>
  </div>
</template>
