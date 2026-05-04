<script setup lang="ts">
defineProps<{ name: string; color: string }>();
</script>

<template>
  <span
    class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
    :style="{ backgroundColor: color + '22', color }"
  >
    {{ name }}
  </span>
</template>
