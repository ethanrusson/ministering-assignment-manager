<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useEldersStore } from '@/stores/elders';
import { useHouseholdsStore } from '@/stores/households';
import { useLabelsStore } from '@/stores/labels';
import { useDistrictsStore } from '@/stores/districts';
import { useCompanionshipsStore } from '@/stores/companionships';
import LeftSidebar from '@/components/sidebar/LeftSidebar.vue';
import LabelsModal from '@/components/LabelsModal.vue';
import ImportModal from '@/components/ImportModal.vue';
import WardInviteModal from '@/components/WardInviteModal.vue';
import Canvas from '@/canvas/Canvas.vue';
import District from '@/canvas/District.vue';
import CompanionshipCard from '@/canvas/CompanionshipCard.vue';
import TransferGhost from '@/canvas/TransferGhost.vue';
import { useSnapshot } from '@/canvas/useSnapshot';
import ChangesModal from '@/components/ChangesModal.vue';
import SearchBar, { type SearchTarget } from '@/components/SearchBar.vue';
import ErrorToasts from '@/components/ErrorToasts.vue';
import DebugPanel from '@/components/DebugPanel.vue';
import { useConnectionWatcher } from '@/lib/connectionWatcher';
import {
  TagIcon,
  ArrowDownTrayIcon,
  DocumentArrowDownIcon,
  DocumentArrowUpIcon,
  UserPlusIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/vue/24/outline';
import {
  exportWardBackup,
  downloadBackupAsFile,
  readBackupFromFile,
  importWardBackup,
} from '@/lib/wardBackup';

const auth = useAuthStore();
const elders = useEldersStore();
const households = useHouseholdsStore();
const labels = useLabelsStore();
const districts = useDistrictsStore();
const companionships = useCompanionshipsStore();

const snap = useSnapshot();

useConnectionWatcher([
  () => elders.fetch(),
  () => households.fetch(),
  () => labels.fetch(),
  () => districts.fetch(),
  () => companionships.fetch(),
  () => (auth.wardId ? snap.loadSnapshot(auth.wardId) : Promise.resolve()),
]);

const labelsOpen = ref(false);
const importOpen = ref(false);
const inviteOpen = ref(false);
const changesOpen = ref(false);
const loading = ref(true);

async function saveCurrentSnapshot() {
  if (!auth.wardId) return;
  await snap.saveSnapshot(auth.wardId, companionships.elderLinks, companionships.householdLinks);
}

async function clearCurrentSnapshot() {
  if (!auth.wardId) return;
  await snap.clearSnapshot(auth.wardId);
}

// ─── Backup download/upload ────────────────────────────────────────────────

const uploadInput = ref<HTMLInputElement | null>(null);
const backupBusy = ref(false);

async function downloadBackup() {
  if (!auth.wardId || backupBusy.value) return;
  backupBusy.value = true;
  try {
    const backup = await exportWardBackup(auth.wardId);
    downloadBackupAsFile(backup);
  } catch (e) {
    console.error('[backup] download failed', e);
    window.alert(`Download failed: ${e instanceof Error ? e.message : 'unknown error'}`);
  } finally {
    backupBusy.value = false;
  }
}

function pickBackupFile() {
  uploadInput.value?.click();
}

async function onBackupFileChosen(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || !auth.wardId || backupBusy.value) return;
  if (auth.wardRole !== 'admin') {
    window.alert('Only admins can replace ward data from a backup.');
    return;
  }
  if (
    !window.confirm(
      'This will REPLACE all ward data (districts, companionships, elders, households, labels) with the contents of the backup file. Continue?',
    )
  )
    return;
  backupBusy.value = true;
  try {
    const backup = await readBackupFromFile(file);
    await importWardBackup(auth.wardId, backup);
    // Re-sync all stores so the UI reflects the new data.
    await Promise.all([
      elders.fetch(),
      households.fetch(),
      labels.fetch(),
      districts.fetch(),
      companionships.fetch(),
      snap.loadSnapshot(auth.wardId),
    ]);
  } catch (e) {
    console.error('[backup] upload failed', e);
    window.alert(`Upload failed: ${e instanceof Error ? e.message : 'unknown error'}`);
  } finally {
    backupBusy.value = false;
  }
}

// Ward name inline edit
const editingName = ref(false);
const nameInput = ref<HTMLInputElement | null>(null);
const nameEdit = ref('');

async function startNameEdit() {
  if (auth.wardRole !== 'admin') return;
  nameEdit.value = auth.wardName ?? '';
  editingName.value = true;
  await nextTick();
  nameInput.value?.select();
}

async function saveName() {
  editingName.value = false;
  if (nameEdit.value.trim() && nameEdit.value.trim() !== auth.wardName) {
    await auth.updateWardName(nameEdit.value);
  }
}

function cancelNameEdit() {
  editingName.value = false;
}

const canvasRef = ref<InstanceType<typeof Canvas> | null>(null);

// ─── Cmd+F search ──────────────────────────────────────────────────────────

const searchOpen = ref(false);

// Build the ordered list of search targets (elders + households that appear
// on cards) sorted by their card's position (top-to-bottom, left-to-right).
const searchTargets = computed<SearchTarget[]>(() => {
  const cards = [...companionships.items].sort((a, b) => {
    if (a.position_y !== b.position_y) return a.position_y - b.position_y;
    return a.position_x - b.position_x;
  });
  const out: SearchTarget[] = [];
  for (const card of cards) {
    const eIds = companionships.eldersInCompanionship.get(card.id) ?? [];
    for (const eid of eIds) {
      const e = elders.byId.get(eid);
      if (e) out.push({ kind: 'elder', id: e.id, name: e.name, companionshipId: card.id });
    }
    const hIds = companionships.householdsInCompanionship.get(card.id) ?? [];
    for (const hid of hIds) {
      const h = households.byId.get(hid);
      if (h) out.push({ kind: 'household', id: h.id, name: h.name, companionshipId: card.id });
    }
  }
  return out;
});

function gotoSearchTarget(target: SearchTarget) {
  const cardEl = document.querySelector<HTMLElement>(
    `[data-companionship-id="${target.companionshipId}"]`,
  );
  if (!cardEl) return;
  const x = Number(cardEl.dataset.x ?? 0);
  const y = Number(cardEl.dataset.y ?? 0);
  const w = Number(cardEl.dataset.w ?? cardEl.offsetWidth);
  const h = Number(cardEl.dataset.h ?? cardEl.offsetHeight);
  canvasRef.value?.zoomToBbox({ x, y, w, h });
  // Highlight the matched chip/row briefly.
  requestAnimationFrame(() => {
    const sel = `[data-transfer-kind="${target.kind}"][data-transfer-id="${target.id}"][data-from-companionship="${target.companionshipId}"]`;
    const chip = document.querySelector<HTMLElement>(sel);
    if (!chip) return;
    chip.classList.add('search-hit');
    window.setTimeout(() => chip.classList.remove('search-hit'), 1600);
  });
}

function onWindowKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    searchOpen.value = true;
  }
}

onMounted(async () => {
  window.addEventListener('keydown', onWindowKeydown);
  try {
    await Promise.all([
      elders.fetch(),
      households.fetch(),
      labels.fetch(),
      districts.fetch(),
      companionships.fetch(),
    ]);
    // Load the ward's shared baseline snapshot (if one has been saved).
    if (auth.wardId) await snap.loadSnapshot(auth.wardId);
  } finally {
    loading.value = false;
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown);
});

async function signOut() {
  await auth.signOut();
}

const scale = computed(() => canvasRef.value?.viewport?.scale ?? 1);

const isEmptyCanvas = computed(
  () => !districts.items.length && !companionships.items.length,
);
</script>

<template>
  <div class="flex h-screen flex-col">
    <header
      class="flex items-center justify-between border-b border-stone-200 bg-stone-100 px-4 py-2"
    >
      <!-- Ward name — admins can click to rename inline -->
      <div class="group flex items-center gap-1.5">
        <input
          v-if="editingName"
          ref="nameInput"
          v-model="nameEdit"
          class="rounded border border-stone-300 bg-white px-2 py-0.5 text-base font-semibold focus:border-stone-500 focus:outline-none"
          @blur="saveName"
          @keydown.enter.prevent="saveName"
          @keydown.escape.prevent="cancelNameEdit"
        />
        <template v-else>
          <h1
            class="text-base font-semibold"
            :class="auth.wardRole === 'admin' ? 'cursor-pointer hover:text-stone-600' : ''"
            :title="auth.wardRole === 'admin' ? 'Click to rename' : undefined"
            @click="startNameEdit"
          >
            {{ auth.wardName ?? 'My Ward' }} - Ministering
          </h1>
          <button
            v-if="auth.wardRole === 'admin'"
            class="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-stone-600 transition-opacity text-xs leading-none"
            title="Rename ward"
            @click="startNameEdit"
          >
            ✎
          </button>
        </template>
      </div>
      <div class="flex items-center gap-2">
        <!-- Snapshot controls — active state when a snapshot is saved -->
        <div v-if="snap.hasSnapshot.value" class="flex items-center gap-1">
          <button
            class="rounded border border-blue-300 bg-blue-100 px-3 py-1 text-sm text-blue-700 hover:bg-blue-200"
            title="Replace the current snapshot with the latest state"
            @click="saveCurrentSnapshot"
          >
            Update Snapshot
          </button>
          <button
            class="rounded border border-blue-300 bg-blue-100 px-1.5 py-1 text-sm text-blue-500 hover:bg-blue-200"
            title="Clear snapshot"
            @click="clearCurrentSnapshot"
          >
            ×
          </button>
        </div>
        <button
          v-else
          class="rounded border border-stone-300 px-3 py-1 text-sm hover:bg-stone-50"
          title="Save the current assignment state as a baseline for change tracking"
          @click="saveCurrentSnapshot"
        >
          Save Snapshot
        </button>
        <!-- Changes button — only visible when a snapshot is active -->
        <button
          v-if="snap.hasSnapshot.value"
          class="rounded border border-blue-300 bg-blue-50 px-3 py-1 text-sm text-blue-700 hover:bg-blue-100"
          @click="changesOpen = true"
        >
          Changes
        </button>
        <!-- Manage Labels -->
        <button
          class="rounded border border-stone-300 p-1.5 text-stone-600 hover:bg-stone-50 hover:text-stone-800"
          title="Manage Labels"
          aria-label="Manage Labels"
          @click="labelsOpen = true"
        >
          <TagIcon class="h-4 w-4" />
        </button>
        <!-- Import LCR HTML -->
        <button
          class="rounded border border-stone-300 p-1.5 text-stone-600 hover:bg-stone-50 hover:text-stone-800"
          title="Import LCR HTML"
          aria-label="Import LCR HTML"
          @click="importOpen = true"
        >
          <ArrowDownTrayIcon class="h-4 w-4" />
        </button>
        <!-- Download backup -->
        <button
          class="rounded border border-stone-300 p-1.5 text-stone-600 hover:bg-stone-50 hover:text-stone-800 disabled:opacity-50"
          title="Download ward backup"
          aria-label="Download ward backup"
          :disabled="backupBusy"
          @click="downloadBackup"
        >
          <DocumentArrowDownIcon class="h-4 w-4" />
        </button>
        <!-- Upload backup -->
        <button
          v-if="auth.wardRole === 'admin'"
          class="rounded border border-stone-300 p-1.5 text-stone-600 hover:bg-stone-50 hover:text-stone-800 disabled:opacity-50"
          title="Upload ward backup (replaces all data)"
          aria-label="Upload ward backup"
          :disabled="backupBusy"
          @click="pickBackupFile"
        >
          <DocumentArrowUpIcon class="h-4 w-4" />
        </button>
        <input
          ref="uploadInput"
          type="file"
          accept="application/json,.json"
          class="hidden"
          @change="onBackupFileChosen"
        />
        <!-- Invite (admin only) -->
        <button
          v-if="auth.wardRole === 'admin'"
          class="rounded border border-stone-300 p-1.5 text-stone-600 hover:bg-stone-50 hover:text-stone-800"
          title="Invite member"
          aria-label="Invite member"
          @click="inviteOpen = true"
        >
          <UserPlusIcon class="h-4 w-4" />
        </button>
        <!-- Sign out -->
        <button
          class="rounded border border-stone-500 bg-stone-100 p-1.5 text-stone-600 hover:bg-stone-200 hover:text-stone-800"
          title="Sign out"
          aria-label="Sign out"
          @click="signOut"
        >
          <ArrowRightOnRectangleIcon class="h-4 w-4" />
        </button>
      </div>
    </header>

    <main>
      <LeftSidebar />
      <section class="h-screen relative overflow-hidden" data-drop-zone="canvas">
        <SearchBar
          :open="searchOpen"
          :targets="searchTargets"
          @close="searchOpen = false"
          @goto="gotoSearchTarget"
        />
        <div
          v-if="loading"
          class="flex h-full items-center justify-center text-sm text-stone-400"
        >
          Loading…
        </div>
        <div
          v-else-if="isEmptyCanvas"
          class="flex h-full items-center justify-center bg-stone-100"
        >
          <div class="max-w-md p-8 text-center text-stone-500">
            <p class="mb-2 text-base font-medium">Empty canvas</p>
            <p class="text-xs">
              Click “Import LCR HTML” to populate your districts and companionships, or drag two
              elders together from the sidebar to create a companionship.
            </p>
          </div>
        </div>
        <Canvas v-else ref="canvasRef">
          <District
            v-for="d in districts.items"
            :key="d.id"
            :district="d"
            :scale="scale"
          />
          <CompanionshipCard
            v-for="c in companionships.items"
            :key="c.id"
            :companionship="c"
            :scale="scale"
          />
        </Canvas>
      </section>
    </main>

    <LabelsModal :open="labelsOpen" @close="labelsOpen = false" />
    <ImportModal :open="importOpen" @close="importOpen = false" />
    <WardInviteModal :open="inviteOpen" @close="inviteOpen = false" />
    <ChangesModal :open="changesOpen" @close="changesOpen = false" />
    <TransferGhost />
    <ErrorToasts />
    <DebugPanel />
  </div>
</template>
