<script setup lang="ts">
import { labelChipStyle } from '@/lib/labelColors';

defineProps<{ name: string; color: string }>();
</script>

<template>
  <span
    class="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium"
    :style="labelChipStyle(color)"
  >
    {{ name }}
  </span>
</template>
