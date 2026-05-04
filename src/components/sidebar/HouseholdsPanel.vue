<script setup lang="ts">
import { computed, ref } from 'vue';
import { useHouseholdsStore } from '@/stores/households';
import { useLabelsStore } from '@/stores/labels';
import { useCompanionshipsStore } from '@/stores/companionships';
import { useTransfer } from '@/canvas/useTransfer';
import LabelChip from '@/components/LabelChip.vue';

const households = useHouseholdsStore();
const labels = useLabelsStore();
const companionships = useCompanionshipsStore();
const transfer = useTransfer();

const showHidden = ref(false);
const search = ref('');
const adding = ref(false);
const newName = ref('');
const filterLabelIds = ref<Set<string>>(new Set());

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  const linkMap = households.labelsForHousehold;
  const assigned = companionships.companionshipForHousehold;
  return households.items.filter((h) => {
    if (assigned.has(h.id)) return false;
    if (!showHidden.value && h.hidden) return false;
    if (q && !h.name.toLowerCase().includes(q)) return false;
    if (filterLabelIds.value.size) {
      const hLabels = linkMap.get(h.id) ?? [];
      const all = [...filterLabelIds.value].every((id) => hLabels.includes(id));
      if (!all) return false;
    }
    return true;
  });
});

function toggleFilter(id: string) {
  const next = new Set(filterLabelIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  filterLabelIds.value = next;
}

async function commitAdd() {
  if (!newName.value.trim()) return;
  await households.add(newName.value.trim());
  newName.value = '';
  adding.value = false;
}

async function rename(id: string, current: string) {
  const next = window.prompt('Rename household', current);
  if (!next || next.trim() === current) return;
  await households.update(id, { name: next.trim() });
}

async function toggleHidden(id: string, hidden: boolean) {
  await households.update(id, { hidden: !hidden });
}

async function editLabels(id: string) {
  if (!labels.items.length) {
    window.alert('No labels yet. Open "Manage Labels" to create some.');
    return;
  }
  const current = households.labelsForHousehold.get(id) ?? [];
  const list = labels.items
    .map((l, i) => `${i + 1}. ${current.includes(l.id) ? '[x]' : '[ ]'} ${l.name}`)
    .join('\n');
  const input = window.prompt(
    `Toggle labels for "${households.byId.get(id)?.name ?? ''}". Comma-separated numbers (e.g. "1,3"):\n\n${list}`,
    current.length
      ? labels.items
          .map((l, i) => (current.includes(l.id) ? `${i + 1}` : null))
          .filter(Boolean)
          .join(',')
      : '',
  );
  if (input === null) return;
  const indices = input
    .split(',')
    .map((s) => Number(s.trim()) - 1)
    .filter((n) => Number.isInteger(n) && n >= 0 && n < labels.items.length);
  const labelIds = indices.map((i) => labels.items[i].id);
  await households.setLabels(id, labelIds);
}

async function remove(id: string, name: string) {
  if (!window.confirm(`Delete household "${name}"? This cannot be undone.`)) return;
  await households.remove(id);
}

const isHovered = computed(
  () => transfer.state.hoveredDropZone?.kind === 'sidebar-households',
);
</script>

<template>
  <section
    class="flex h-full flex-col border-l border-slate-200 bg-white transition-colors"
    :class="isHovered && 'bg-emerald-50'"
    data-drop-zone="sidebar-households"
  >
    <header class="flex items-center justify-between border-b border-slate-200 px-3 py-2">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-600">
        Unassigned Households
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
        placeholder="Search households…"
        class="w-full rounded border border-slate-300 px-2 py-1 text-sm"
      />
      <div v-if="labels.items.length" class="flex flex-wrap gap-1">
        <button
          v-for="l in labels.items"
          :key="l.id"
          class="rounded-full border px-2 py-0.5 text-[10px]"
          :class="filterLabelIds.has(l.id) ? 'border-slate-700 bg-slate-100' : 'border-slate-200'"
          :style="{ color: l.color }"
          @click="toggleFilter(l.id)"
        >
          {{ l.name }}
        </button>
      </div>
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
        placeholder="Family name"
        required
        class="w-full rounded border border-slate-300 px-2 py-1 text-sm"
      />
      <button type="submit" class="w-full rounded bg-slate-900 px-2 py-1 text-xs text-white">
        Add household
      </button>
    </form>

    <ul class="flex-1 divide-y divide-slate-100 overflow-y-auto">
      <li
        v-for="h in filtered"
        :key="h.id"
        class="group flex flex-col gap-1 px-3 py-2"
        :class="h.hidden && 'opacity-50'"
        @pointerdown.stop="transfer.startDrag($event, 'household', h.id, null)"
      >
        <div class="flex items-center gap-2">
          <span class="flex-1 truncate text-sm">{{ h.name }}</span>
          <div class="hidden gap-1 group-hover:flex">
            <button
              class="rounded p-1 text-xs text-slate-500 hover:bg-slate-100"
              title="Rename"
              @pointerdown.stop
              @click="rename(h.id, h.name)"
            >
              ✎
            </button>
            <button
              class="rounded p-1 text-xs text-slate-500 hover:bg-slate-100"
              title="Edit labels"
              @pointerdown.stop
              @click="editLabels(h.id)"
            >
              ⌘
            </button>
            <button
              class="rounded p-1 text-xs text-slate-500 hover:bg-slate-100"
              :title="h.hidden ? 'Unhide' : 'Hide'"
              @pointerdown.stop
              @click="toggleHidden(h.id, h.hidden)"
            >
              {{ h.hidden ? '◐' : '○' }}
            </button>
            <button
              class="rounded p-1 text-xs text-danger-600 hover:bg-danger-100"
              title="Delete"
              @pointerdown.stop
              @click="remove(h.id, h.name)"
            >
              ×
            </button>
          </div>
        </div>
        <div
          v-if="(households.labelsForHousehold.get(h.id) ?? []).length"
          class="flex flex-wrap gap-1"
        >
          <LabelChip
            v-for="lid in households.labelsForHousehold.get(h.id) ?? []"
            :key="lid"
            :name="labels.byId.get(lid)?.name ?? '?'"
            :color="labels.byId.get(lid)?.color ?? '#888'"
          />
        </div>
      </li>
      <li v-if="!filtered.length" class="px-3 py-6 text-center text-xs text-slate-400">
        No unassigned households.
      </li>
    </ul>
  </section>
</template>
