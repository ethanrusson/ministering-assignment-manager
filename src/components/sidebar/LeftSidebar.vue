<script setup lang="ts">
import { computed, ref } from 'vue';
import { useEldersStore } from '@/stores/elders';
import { useHouseholdsStore } from '@/stores/households';
import { useLabelsStore } from '@/stores/labels';
import { useCompanionshipsStore } from '@/stores/companionships';
import { useTransfer } from '@/canvas/useTransfer';
import AgeBadge from '@/components/AgeBadge.vue';
import LabelChip from '@/components/LabelChip.vue';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  PencilIcon,
  HashtagIcon,
  TagIcon,
  EyeIcon,
  EyeSlashIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline';

const elders = useEldersStore();
const households = useHouseholdsStore();
const labels = useLabelsStore();
const companionships = useCompanionshipsStore();
const transfer = useTransfer();

const sidebarOpen = ref(true);
const eldersOpen = ref(true);
const householdsOpen = ref(true);

// ── Elders ────────────────────────────────────────────────────────────────

const elderSearch = ref('');
const elderShowHidden = ref(false);
const elderAdding = ref(false);
const newElderName = ref('');
const newElderAge = ref<string>('');

const filteredElders = computed(() => {
  const q = elderSearch.value.trim().toLowerCase();
  const assigned = companionships.companionshipForElder;
  return elders.items
    .filter((e) => !assigned.has(e.id))
    .filter((e) => (elderShowHidden.value ? true : !e.hidden))
    .filter((e) => (q ? e.name.toLowerCase().includes(q) : true));
});

async function commitAddElder() {
  if (!newElderName.value.trim()) return;
  const ageNum = newElderAge.value === '' ? null : Number(newElderAge.value);
  await elders.add(newElderName.value.trim(), Number.isFinite(ageNum) ? ageNum : null);
  newElderName.value = '';
  newElderAge.value = '';
  elderAdding.value = false;
}

async function renameElder(id: string, current: string) {
  const next = window.prompt('Rename elder', current);
  if (!next || next.trim() === current) return;
  await elders.update(id, { name: next.trim() });
}

async function setElderAge(id: string, current: number | null) {
  const next = window.prompt('Age (blank to clear)', current?.toString() ?? '');
  if (next === null) return;
  const ageNum = next.trim() === '' ? null : Number(next);
  await elders.update(id, { age: Number.isFinite(ageNum) ? ageNum : null });
}

async function toggleElderHidden(id: string, hidden: boolean) {
  await elders.update(id, { hidden: !hidden });
}

async function removeElder(id: string, name: string) {
  if (!window.confirm(`Delete elder "${name}"? This cannot be undone.`)) return;
  await elders.remove(id);
}

const eldersHovered = computed(() => transfer.state.hoveredDropZone?.kind === 'sidebar-elders');

// ── Households ────────────────────────────────────────────────────────────

const householdSearch = ref('');
const householdShowHidden = ref(false);
const householdAdding = ref(false);
const newHouseholdName = ref('');
const filterLabelIds = ref<Set<string>>(new Set());

const filteredHouseholds = computed(() => {
  const q = householdSearch.value.trim().toLowerCase();
  const linkMap = households.labelsForHousehold;
  const assigned = companionships.companionshipForHousehold;
  return households.items.filter((h) => {
    if (assigned.has(h.id)) return false;
    if (!householdShowHidden.value && h.hidden) return false;
    if (q && !h.name.toLowerCase().includes(q)) return false;
    if (filterLabelIds.value.size) {
      const hLabels = linkMap.get(h.id) ?? [];
      if (![...filterLabelIds.value].every((id) => hLabels.includes(id))) return false;
    }
    return true;
  });
});

function toggleLabelFilter(id: string) {
  const next = new Set(filterLabelIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  filterLabelIds.value = next;
}

async function commitAddHousehold() {
  if (!newHouseholdName.value.trim()) return;
  await households.add(newHouseholdName.value.trim());
  newHouseholdName.value = '';
  householdAdding.value = false;
}

async function renameHousehold(id: string, current: string) {
  const next = window.prompt('Rename household', current);
  if (!next || next.trim() === current) return;
  await households.update(id, { name: next.trim() });
}

async function toggleHouseholdHidden(id: string, hidden: boolean) {
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
  await households.setLabels(id, indices.map((i) => labels.items[i].id));
}

async function removeHousehold(id: string, name: string) {
  if (!window.confirm(`Delete household "${name}"? This cannot be undone.`)) return;
  await households.remove(id);
}

const householdsHovered = computed(
  () => transfer.state.hoveredDropZone?.kind === 'sidebar-households',
);
</script>

<template>
  <!--
    Outer wrapper: controls the grid column width and is the positioning
    context for the floating toggle button. overflow:visible so the button
    can straddle the sidebar/canvas border.

    Inner div: absolute inset-0 + overflow-hidden clips the panel content
    during the width transition without clipping the button.
  -->
  <div
    class="fixed h-[calc(100%-79px)] flex-shrink-0 transition-[width] duration-200 bg-white box-shadow-lg m-4 rounded-lg z-20"
    :class="sidebarOpen ? 'w-[320px] border border-stone-200' : 'w-0'"
  >
    <!-- Content pane (clips at the wrapper boundary) -->
    <div class="absolute inset-0 flex flex-col overflow-hidden">
      <template v-if="sidebarOpen">
    <!-- ── Elders section ──────────────────────────────────────────────── -->
    <div
      class="flex flex-col transition-colors"
      :class="[eldersOpen ? 'flex-1 min-h-0' : 'shrink-0', eldersHovered && 'bg-emerald-50']"
      data-drop-zone="sidebar-elders"
    >
      <!-- Header -->
      <div class="flex shrink-0 items-center border-b border-stone-200 px-3 py-2">
        <button
          class="flex flex-1 items-center gap-1.5 text-left"
          @click="eldersOpen = !eldersOpen"
          @pointerdown.stop
        >
          <component
            :is="eldersOpen ? ChevronDownIcon : ChevronRightIcon"
            class="h-3 w-3 text-stone-400"
          />
          <h2 class="text-sm font-semibold uppercase tracking-wide text-stone-600">
            Unassigned Elders
          </h2>
        </button>
        <button
          v-if="eldersOpen"
          class="rounded px-2 py-1 text-xs hover:bg-stone-100"
          @click="elderAdding = !elderAdding"
          @pointerdown.stop
        >
          {{ elderAdding ? 'Cancel' : '+ Add' }}
        </button>
      </div>

      <!-- Body (visible when open) -->
      <div v-if="eldersOpen" class="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div class="shrink-0 space-y-2 border-b border-stone-200 px-3 py-2">
          <input
            v-model="elderSearch"
            type="search"
            placeholder="Search elders…"
            class="w-full rounded border border-stone-300 px-2 py-1 text-sm"
          />
          <label class="flex items-center gap-2 text-xs text-stone-600">
            <input v-model="elderShowHidden" type="checkbox" />
            Show hidden
          </label>
        </div>

        <form
          v-if="elderAdding"
          class="shrink-0 space-y-2 border-b border-stone-200 bg-stone-50 px-3 py-2"
          @submit.prevent="commitAddElder"
        >
          <input
            v-model="newElderName"
            placeholder="Full name"
            required
            class="w-full rounded border border-stone-300 px-2 py-1 text-sm"
          />
          <input
            v-model="newElderAge"
            type="number"
            min="0"
            placeholder="Age (optional)"
            class="w-full rounded border border-stone-300 px-2 py-1 text-sm"
          />
          <button type="submit" class="w-full rounded bg-stone-900 px-2 py-1 text-xs text-white">
            Add elder
          </button>
        </form>

        <ul class="flex-1 divide-y divide-stone-100 overflow-y-auto">
          <li
            v-for="elder in filteredElders"
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
            <div class="hidden gap-0.5 group-hover:flex">
              <button
                class="flex h-5 w-5 items-center justify-center rounded text-stone-500 hover:bg-stone-100"
                title="Rename"
                @pointerdown.stop
                @click="renameElder(elder.id, elder.name)"
              >
                <PencilIcon class="h-3.5 w-3.5" />
              </button>
              <button
                class="flex h-5 w-5 items-center justify-center rounded text-stone-500 hover:bg-stone-100"
                title="Set age"
                @pointerdown.stop
                @click="setElderAge(elder.id, elder.age)"
              >
                <HashtagIcon class="h-3.5 w-3.5" />
              </button>
              <button
                class="flex h-5 w-5 items-center justify-center rounded text-stone-500 hover:bg-stone-100"
                :title="elder.hidden ? 'Unhide' : 'Hide'"
                @pointerdown.stop
                @click="toggleElderHidden(elder.id, elder.hidden)"
              >
                <component
                  :is="elder.hidden ? EyeSlashIcon : EyeIcon"
                  class="h-3.5 w-3.5"
                />
              </button>
              <button
                class="flex h-5 w-5 items-center justify-center rounded text-stone-400 hover:text-danger-600 hover:bg-danger-50"
                title="Delete"
                @pointerdown.stop
                @click="removeElder(elder.id, elder.name)"
              >
                <TrashIcon class="h-3.5 w-3.5" />
              </button>
            </div>
          </li>
          <li v-if="!filteredElders.length" class="px-3 py-6 text-center text-xs text-stone-400">
            No unassigned elders.
          </li>
        </ul>
      </div>
    </div>

    <!-- ── Households section ─────────────────────────────────────────── -->
    <div
      class="flex flex-col border-t border-stone-300 transition-colors"
      :class="[householdsOpen ? 'flex-1 min-h-0' : 'shrink-0', householdsHovered && 'bg-emerald-50']"
      data-drop-zone="sidebar-households"
    >
      <!-- Header -->
      <div class="flex shrink-0 items-center border-b border-stone-200 px-3 py-2">
        <button
          class="flex flex-1 items-center gap-1.5 text-left"
          @click="householdsOpen = !householdsOpen"
          @pointerdown.stop
        >
          <component
            :is="householdsOpen ? ChevronDownIcon : ChevronRightIcon"
            class="h-3 w-3 text-stone-400"
          />
          <h2 class="text-sm font-semibold uppercase tracking-wide text-stone-600">
            Unassigned Households
          </h2>
        </button>
        <button
          v-if="householdsOpen"
          class="rounded px-2 py-1 text-xs hover:bg-stone-100"
          @click="householdAdding = !householdAdding"
          @pointerdown.stop
        >
          {{ householdAdding ? 'Cancel' : '+ Add' }}
        </button>
      </div>

      <!-- Body (visible when open) -->
      <div v-if="householdsOpen" class="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div class="shrink-0 space-y-2 border-b border-stone-200 px-3 py-2">
          <input
            v-model="householdSearch"
            type="search"
            placeholder="Search households…"
            class="w-full rounded border border-stone-300 px-2 py-1 text-sm"
          />
          <div v-if="labels.items.length" class="flex flex-wrap gap-1">
            <button
              v-for="l in labels.items"
              :key="l.id"
              class="rounded-full border px-2 py-0.5 text-[10px]"
              :class="
                filterLabelIds.has(l.id) ? 'border-stone-700 bg-stone-100' : 'border-stone-200'
              "
              :style="{ color: l.color }"
              @click="toggleLabelFilter(l.id)"
            >
              {{ l.name }}
            </button>
          </div>
          <label class="flex items-center gap-2 text-xs text-stone-600">
            <input v-model="householdShowHidden" type="checkbox" />
            Show hidden
          </label>
        </div>

        <form
          v-if="householdAdding"
          class="shrink-0 space-y-2 border-b border-stone-200 bg-stone-50 px-3 py-2"
          @submit.prevent="commitAddHousehold"
        >
          <input
            v-model="newHouseholdName"
            placeholder="Family name"
            required
            class="w-full rounded border border-stone-300 px-2 py-1 text-sm"
          />
          <button type="submit" class="w-full rounded bg-stone-900 px-2 py-1 text-xs text-white">
            Add household
          </button>
        </form>

        <ul class="flex-1 divide-y divide-stone-100 overflow-y-auto">
          <li
            v-for="h in filteredHouseholds"
            :key="h.id"
            class="group flex flex-col gap-1 px-3 py-2"
            :class="h.hidden && 'opacity-50'"
            @pointerdown.stop="transfer.startDrag($event, 'household', h.id, null)"
          >
            <div class="flex h-5 items-center gap-2">
              <span class="flex-1 truncate text-sm">{{ h.name }}</span>
              <div class="hidden gap-0.5 group-hover:flex">
                <button
                  class="flex h-5 w-5 items-center justify-center rounded text-stone-500 hover:bg-stone-100"
                  title="Rename"
                  @pointerdown.stop
                  @click="renameHousehold(h.id, h.name)"
                >
                  <PencilIcon class="h-3.5 w-3.5" />
                </button>
                <button
                  class="flex h-5 w-5 items-center justify-center rounded text-stone-500 hover:bg-stone-100"
                  title="Edit labels"
                  @pointerdown.stop
                  @click="editLabels(h.id)"
                >
                  <TagIcon class="h-3.5 w-3.5" />
                </button>
                <button
                  class="flex h-5 w-5 items-center justify-center rounded text-stone-500 hover:bg-stone-100"
                  :title="h.hidden ? 'Unhide' : 'Hide'"
                  @pointerdown.stop
                  @click="toggleHouseholdHidden(h.id, h.hidden)"
                >
                  <component
                    :is="h.hidden ? EyeSlashIcon : EyeIcon"
                    class="h-3.5 w-3.5"
                  />
                </button>
                <button
                  class="flex h-5 w-5 items-center justify-center rounded text-stone-400 hover:text-danger-600 hover:bg-danger-50"
                  title="Delete"
                  @pointerdown.stop
                  @click="removeHousehold(h.id, h.name)"
                >
                  <TrashIcon class="h-3.5 w-3.5" />
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
          <li v-if="!filteredHouseholds.length" class="px-3 py-6 text-center text-xs text-stone-400">
            No unassigned households.
          </li>
        </ul>
      </div>
    </div>

      </template> <!-- /sidebarOpen -->
    </div>

    <!-- Floating toggle: 24×24, centered vertically on the right border -->
    <button
      class="absolute -right-3 top-1/2 -translate-y-3 z-10 flex h-6 w-6 -transtone-y-1/2 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-400 shadow-sm hover:bg-stone-50 hover:text-stone-600"
      :title="sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'"
      @click="sidebarOpen = !sidebarOpen"
      @pointerdown.stop
    >
      <component
        :is="sidebarOpen ? ChevronLeftIcon : ChevronRightIcon"
        class="h-3.5 w-3.5"
      />
    </button>
  </div>
</template>
