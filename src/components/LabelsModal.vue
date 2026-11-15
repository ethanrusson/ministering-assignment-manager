<script setup lang="ts">
import { ref } from 'vue';
import { useLabelsStore, type Label } from '@/stores/labels';
import { LABEL_PALETTE } from '@/lib/labelColors';
import { pushError } from '@/lib/errorToast';

defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const labels = useLabelsStore();

const newName = ref('');
const newColor = ref<string>(LABEL_PALETTE[0].hex);
const newSensitive = ref(false);
/** The label whose color swatches are open. */
const recoloring = ref<string | null>(null);

async function run(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (e) {
    pushError(e);
  }
}

function add() {
  const name = newName.value.trim();
  if (!name) return;
  run(async () => {
    await labels.add(name, newColor.value, newSensitive.value);
    newName.value = '';
    newSensitive.value = false;
  });
}

function rename(l: Label, e: Event) {
  const input = e.target as HTMLInputElement;
  const name = input.value.trim();
  if (!name) input.value = l.name;
  else if (name !== l.name) run(() => labels.update(l.id, { name }));
}

function recolor(l: Label, color: string) {
  recoloring.value = null;
  if (color !== l.color) run(() => labels.update(l.id, { color }));
}

function remove(l: Label) {
  if (!window.confirm(`Delete "${l.name}"? It comes off every household that has it.`)) return;
  run(() => labels.remove(l.id));
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
          <button class="rounded p-1 hover:bg-stone-100" @click="emit('close')">×</button>
        </header>

        <ul class="max-h-80 space-y-1 overflow-y-auto">
          <li
            v-for="l in labels.items"
            :key="l.id"
            class="rounded border border-stone-200 px-2 py-1.5"
          >
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="h-5 w-5 shrink-0 rounded-full ring-1 ring-stone-300"
                :style="{ backgroundColor: l.color }"
                :aria-label="`Change ${l.name} color`"
                @click="recoloring = recoloring === l.id ? null : l.id"
              />
              <input
                :value="l.name"
                class="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-stone-200 focus:border-stone-400 focus:outline-none"
                :aria-label="`${l.name} name`"
                @change="rename(l, $event)"
                @keydown.enter="($event.target as HTMLInputElement).blur()"
              />
              <label class="flex items-center gap-1 text-xs text-stone-600">
                <input
                  type="checkbox"
                  :checked="l.sensitive"
                  @change="run(() => labels.update(l.id, { sensitive: ($event.target as HTMLInputElement).checked }))"
                />
                Sensitive
              </label>
              <button
                class="rounded p-1 text-xs text-danger-600 hover:bg-danger-100"
                @click="remove(l)"
              >
                Delete
              </button>
            </div>
            <div v-if="recoloring === l.id" class="mt-1.5 flex gap-1.5 pl-7">
              <button
                v-for="c in LABEL_PALETTE"
                :key="c.hex"
                type="button"
                class="h-5 w-5 rounded-full"
                :class="c.hex === l.color ? 'ring-2 ring-stone-900 ring-offset-1' : ''"
                :style="{ backgroundColor: c.hex }"
                :aria-label="c.name"
                @click="recolor(l, c.hex)"
              />
            </div>
          </li>
          <li
            v-if="!labels.items.length"
            class="rounded border border-dashed border-stone-200 px-3 py-4 text-center text-xs text-stone-400"
          >
            No labels yet.
          </li>
        </ul>

        <form class="space-y-2 border-t border-stone-200 pt-4" @submit.prevent="add">
          <h3 class="text-sm font-medium text-stone-700">Add label</h3>
          <div class="flex gap-2">
            <input
              v-model="newName"
              required
              placeholder="Name"
              class="min-w-0 flex-1 rounded border border-stone-300 px-2 py-1 text-sm"
            />
            <button class="rounded bg-stone-900 px-3 py-1 text-sm text-white">Add</button>
          </div>
          <div class="flex items-center gap-1.5">
            <button
              v-for="c in LABEL_PALETTE"
              :key="c.hex"
              type="button"
              class="h-5 w-5 rounded-full"
              :class="c.hex === newColor ? 'ring-2 ring-stone-900 ring-offset-1' : ''"
              :style="{ backgroundColor: c.hex }"
              :aria-label="c.name"
              @click="newColor = c.hex"
            />
            <label class="ml-auto flex items-center gap-1 text-xs text-stone-600">
              <input v-model="newSensitive" type="checkbox" />
              Sensitive
            </label>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
