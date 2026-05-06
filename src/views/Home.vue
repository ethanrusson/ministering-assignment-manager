<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
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
import {
  TagIcon,
  ArrowDownTrayIcon,
  UserPlusIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/vue/24/outline';

const auth = useAuthStore();
const elders = useEldersStore();
const households = useHouseholdsStore();
const labels = useLabelsStore();
const districts = useDistrictsStore();
const companionships = useCompanionshipsStore();

const snap = useSnapshot();

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

onMounted(async () => {
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
        <!-- Import -->
        <button
          class="rounded border border-stone-300 p-1.5 text-stone-600 hover:bg-stone-50 hover:text-stone-800"
          title="Import"
          aria-label="Import"
          @click="importOpen = true"
        >
          <ArrowDownTrayIcon class="h-4 w-4" />
        </button>
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
  </div>
</template>
