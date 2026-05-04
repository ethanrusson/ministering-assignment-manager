<script setup lang="ts">
import { ref } from 'vue';
import { useLabelsStore } from '@/stores/labels';

defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const labels = useLabelsStore();

const newName = ref('');
const newColor = ref('#2563eb');
const errorMsg = ref<string | null>(null);

async function add() {
  errorMsg.value = null;
  const name = newName.value.trim();
  if (!name) return;
  try {
    await labels.add(name, newColor.value);
    newName.value = '';
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : 'Failed to add label.';
  }
}

async function rename(id: string, current: string) {
  const next = window.prompt('Rename label', current);
  if (!next || next.trim() === current) return;
  await labels.update(id, { name: next.trim() });
}

async function recolor(id: string, current: string) {
  const next = window.prompt('Color (hex like #ff0000)', current);
  if (!next) return;
  await labels.update(id, { color: next.trim() });
}

async function remove(id: string, name: string) {
  if (
    !window.confirm(
      `Delete label "${name}"? This will remove it from any households tagged with it.`,
    )
  )
    return;
  await labels.remove(id);
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="emit('close')"
    >
      <div class="w-full max-w-md space-y-4 rounded-lg bg-white p-5 shadow-xl">
        <header class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">Manage Labels</h2>
          <button class="rounded p-1 hover:bg-slate-100" @click="emit('close')">×</button>
        </header>

        <ul class="max-h-64 space-y-1 overflow-y-auto">
          <li
            v-for="l in labels.items"
            :key="l.id"
            class="flex items-center gap-2 rounded border border-slate-200 px-2 py-1"
          >
            <span
              class="h-4 w-4 shrink-0 rounded-full border border-slate-300"
              :style="{ backgroundColor: l.color }"
            />
            <span class="flex-1 text-sm">{{ l.name }}</span>
            <button class="rounded p-1 text-xs hover:bg-slate-100" @click="rename(l.id, l.name)">
              Rename
            </button>
            <button class="rounded p-1 text-xs hover:bg-slate-100" @click="recolor(l.id, l.color)">
              Color
            </button>
            <button
              class="rounded p-1 text-xs text-danger-600 hover:bg-danger-100"
              @click="remove(l.id, l.name)"
            >
              Delete
            </button>
          </li>
          <li
            v-if="!labels.items.length"
            class="rounded border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400"
          >
            No labels yet.
          </li>
        </ul>

        <form @submit.prevent="add" class="space-y-2 border-t border-slate-200 pt-4">
          <h3 class="text-sm font-medium text-slate-700">Add label</h3>
          <div class="flex gap-2">
            <input
              v-model="newName"
              required
              placeholder="Name (e.g. Widow)"
              class="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
            />
            <input
              v-model="newColor"
              type="color"
              class="h-8 w-12 rounded border border-slate-300"
            />
            <button class="rounded bg-slate-900 px-3 py-1 text-sm text-white">Add</button>
          </div>
          <p v-if="errorMsg" class="text-xs text-danger-600">{{ errorMsg }}</p>
        </form>
      </div>
    </div>
  </Teleport>
</template>
