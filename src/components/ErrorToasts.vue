<script setup lang="ts">
import { useToasts } from '@/lib/errorToast';
import { XMarkIcon } from '@heroicons/vue/24/outline';

const { toasts } = useToasts();

function dismiss(id: number) {
  toasts.value = toasts.value.filter((t) => t.id !== id);
}

function act(id: number, run: () => unknown) {
  dismiss(id);
  run();
}
</script>

<template>
  <Teleport to="body">
    <div class="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="pointer-events-auto flex max-w-sm items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg"
        :class="
          t.kind === 'error'
            ? 'border-danger-400 bg-danger-100 text-danger-600'
            : 'border-stone-300 bg-white text-stone-800'
        "
      >
        <span class="flex-1 break-words">{{ t.message }}</span>
        <button
          v-if="t.action"
          class="rounded px-1 font-semibold underline"
          @click="act(t.id, t.action.run)"
        >
          {{ t.action.label }}
        </button>
        <button
          class="rounded p-0.5"
          :class="t.kind === 'error' ? 'hover:bg-danger-400/20' : 'hover:bg-stone-100'"
          aria-label="Dismiss"
          @click="dismiss(t.id)"
        >
          <XMarkIcon class="h-4 w-4" />
        </button>
      </div>
    </div>
  </Teleport>
</template>
