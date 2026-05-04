<script setup lang="ts">
import { computed, ref } from 'vue';
import { useEldersStore } from '@/stores/elders';
import { useCompanionshipsStore } from '@/stores/companionships';
import { useTransfer } from '@/canvas/useTransfer';
import AgeBadge from '@/components/AgeBadge.vue';

const elders = useEldersStore();
const companionships = useCompanionshipsStore();
const transfer = useTransfer();

const showHidden = ref(false);
const search = ref('');
const adding = ref(false);
const newName = ref('');
const newAge = ref<string>('');

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  const assigned = companionships.companionshipForElder;
  return elders.items
    .filter((e) => !assigned.has(e.id))
    .filter((e) => (showHidden.value ? true : !e.hidden))
    .filter((e) => (q ? e.name.toLowerCase().includes(q) : true));
});

async function commitAdd() {
  if (!newName.value.trim()) return;
  const ageNum = newAge.value === '' ? null : Number(newAge.value);
  await elders.add(newName.value.trim(), Number.isFinite(ageNum) ? ageNum : null);
  newName.value = '';
  newAge.value = '';
  adding.value = false;
}

async function toggleHidden(id: string, hidden: boolean) {
  await elders.update(id, { hidden: !hidden });
}

async function rename(id: string, current: string) {
  const next = window.prompt('Rename elder', current);
  if (!next || next.trim() === current) return;
  await elders.update(id, { name: next.trim() });
}

async function setAge(id: string, current: number | null) {
  const next = window.prompt('Age (blank to clear)', current?.toString() ?? '');
  if (next === null) return;
  const ageNum = next.trim() === '' ? null : Number(next);
  await elders.update(id, { age: Number.isFinite(ageNum) ? ageNum : null });
}

async function remove(id: string, name: string) {
  if (!window.confirm(`Delete elder "${name}"? This cannot be undone.`)) return;
  await elders.remove(id);
}

const isHovered = computed(() => transfer.state.hoveredDropZone?.kind === 'sidebar-elders');
</script>

<template>
  <section
    class="flex h-full flex-col border-r border-slate-200 bg-white transition-colors"
    :class="isHovered && 'bg-emerald-50'"
    data-drop-zone="sidebar-elders"
  >
    <header class="flex items-center justify-between border-b border-slate-200 px-3 py-2">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-600">
        Unassigned Elders
      </h2>
      <button
        class="rounded px-2 py-1 text-xs hover:bg-slate-100"
        @click="adding = !adding"
      >
        {{ adding ? 'Cancel' : '+ Add' }}
      </button>
    </header>

    <div class="space-y-2 border-b border-slate-200 px-3 py-2">
      <input
        v-model="search"
        type="search"
        placeholder="Search elders…"
        class="w-full rounded border border-slate-300 px-2 py-1 text-sm"
      />
      <label class="flex items-center gap-2 text-xs text-slate-600">
        <input v-model="showHidden" type="checkbox" />
        Show hidden
      </label>
    </div>

    <form
      v-if="adding"
      @submit.prevent="commitAdd"
      class="space-y-2 border-b border-slate-200 bg-slate-50 px-3 py-2"
    >
      <input
        v-model="newName"
        placeholder="Full name"
        required
        class="w-full rounded border border-slate-300 px-2 py-1 text-sm"
      />
      <input
        v-model="newAge"
        type="number"
        min="0"
        placeholder="Age (optional)"
        class="w-full rounded border border-slate-300 px-2 py-1 text-sm"
      />
      <button type="submit" class="w-full rounded bg-slate-900 px-2 py-1 text-xs text-white">
        Add elder
      </button>
    </form>

    <ul class="flex-1 divide-y divide-slate-100 overflow-y-auto">
      <li
        v-for="elder in filtered"
        :key="elder.id"
        class="group flex items-center gap-2 px-3 py-2 transition-colors"
        :class="[
          elder.hidden && 'opacity-50',
          transfer.state.hoveredDropZone?.kind === 'elder-item' &&
            transfer.state.hoveredDropZone.id === elder.id
            ? 'bg-emerald-100'
            : '',
        ]"
        data-drop-zone="elder-item"
        :data-elder-id="elder.id"
        @pointerdown.stop="transfer.startDrag($event, 'elder', elder.id, null)"
      >
        <span class="flex-1 truncate text-sm">{{ elder.name }}</span>
        <AgeBadge :age="elder.age" />
        <div class="hidden gap-1 group-hover:flex">
          <button
            class="rounded p-1 text-xs text-slate-500 hover:bg-slate-100"
            title="Rename"
            @pointerdown.stop
            @click="rename(elder.id, elder.name)"
          >
            ✎
          </button>
          <button
            class="rounded p-1 text-xs text-slate-500 hover:bg-slate-100"
            title="Set age"
            @pointerdown.stop
            @click="setAge(elder.id, elder.age)"
          >
            #
          </button>
          <button
            class="rounded p-1 text-xs text-slate-500 hover:bg-slate-100"
            :title="elder.hidden ? 'Unhide' : 'Hide'"
            @pointerdown.stop
            @click="toggleHidden(elder.id, elder.hidden)"
          >
            {{ elder.hidden ? '◐' : '○' }}
          </button>
          <button
            class="rounded p-1 text-xs text-danger-600 hover:bg-danger-100"
            title="Delete"
            @pointerdown.stop
            @click="remove(elder.id, elder.name)"
          >
            ×
          </button>
        </div>
      </li>
      <li
        v-if="!filtered.length"
        class="px-3 py-6 text-center text-xs text-slate-400"
      >
        No unassigned elders.
      </li>
    </ul>
  </section>
</template>
