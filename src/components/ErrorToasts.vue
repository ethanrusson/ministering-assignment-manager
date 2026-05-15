<script setup lang="ts">
import { useToasts, pushError } from '@/lib/errorToast';
import { XMarkIcon } from '@heroicons/vue/24/outline';

const { toasts } = useToasts();

function dismiss(id: number) {
  toasts.value = toasts.value.filter((t) => t.id !== id);
}

// Re-export pushError for convenience (other modules import from errorToast).
void pushError;
</script>

<template>
  <Teleport to="body">
    <div class="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="pointer-events-auto flex max-w-sm items-start gap-2 rounded-lg border border-danger-400 bg-danger-100 px-3 py-2 text-sm text-danger-600 shadow-lg"
      >
        <span class="flex-1 break-words">{{ t.message }}</span>
        <button
          class="rounded p-0.5 hover:bg-danger-400/20"
          aria-label="Dismiss"
          @click="dismiss(t.id)"
        >
          <XMarkIcon class="h-4 w-4" />
        </button>
      </div>
    </div>
  </Teleport>
</template>
