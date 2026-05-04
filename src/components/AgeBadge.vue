<script setup lang="ts">
defineProps<{ age: number | null | undefined }>();
</script>

<template>
  <span
    v-if="age != null"
    class="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[10px] font-semibold"
    :class="age < 18 ? 'bg-warn-200 text-warn-600' : 'bg-slate-200 text-slate-700'"
    :title="age < 18 ? 'Under 18' : undefined"
  >
    {{ age }}
  </span>
</template>
