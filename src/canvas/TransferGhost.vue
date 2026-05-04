<script setup lang="ts">
import { computed } from 'vue';
import { useTransfer } from './useTransfer';
import { useEldersStore } from '@/stores/elders';
import { useHouseholdsStore } from '@/stores/households';

const transfer = useTransfer();
const elders = useEldersStore();
const households = useHouseholdsStore();

const label = computed(() => {
  if (!transfer.state.active || !transfer.state.kind || !transfer.state.id) return '';
  if (transfer.state.kind === 'elder') {
    return elders.byId.get(transfer.state.id)?.name ?? 'elder';
  }
  return households.byId.get(transfer.state.id)?.name ?? 'household';
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="transfer.state.active"
      class="pointer-events-none fixed z-[100] -translate-x-2 -translate-y-2 rounded-md border border-slate-400 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-lg"
      :style="{
        left: transfer.state.cursorX + 'px',
        top: transfer.state.cursorY + 'px',
      }"
    >
      {{ label }}
    </div>
  </Teleport>
</template>
