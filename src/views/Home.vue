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

const auth = useAuthStore();
const elders = useEldersStore();
const households = useHouseholdsStore();
const labels = useLabelsStore();
const districts = useDistrictsStore();
const companionships = useCompanionshipsStore();

const labelsOpen = ref(false);
const importOpen = ref(false);
const inviteOpen = ref(false);
const loading = ref(true);

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
            {{ auth.wardName ?? 'My Ward' }}
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
        <button
          class="rounded border border-stone-300 px-3 py-1 text-sm hover:bg-stone-50"
          @click="labelsOpen = true"
        >
          Manage Labels
        </button>
        <button
          class="rounded border border-stone-300 px-3 py-1 text-sm hover:bg-stone-50"
          @click="importOpen = true"
        >
          Import
        </button>
        <button
          v-if="auth.wardRole === 'admin'"
          class="rounded border border-stone-300 px-3 py-1 text-sm hover:bg-stone-50"
          @click="inviteOpen = true"
        >
          Invite
        </button>
        <button
          class="rounded border border-stone-500 px-3 py-1 text-sm bg-stone-100 hover:bg-stone-200"
          @click="signOut"
        >
          Sign out
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
    <TransferGhost />
  </div>
</template>
