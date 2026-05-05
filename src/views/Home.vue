<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
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
      class="flex items-center justify-between border-b border-slate-200 bg-slate-100 px-4 py-2"
    >
      <h1 class="text-base font-semibold">Ministering Assignment Manager</h1>
      <div class="flex items-center gap-2">
        <button
          class="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
          @click="labelsOpen = true"
        >
          Manage Labels
        </button>
        <button
          class="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
          @click="importOpen = true"
        >
          Import
        </button>
        <button
          v-if="auth.wardRole === 'admin'"
          class="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
          @click="inviteOpen = true"
        >
          Invite
        </button>
        <button
          class="rounded border border-slate-500 px-3 py-1 text-sm bg-slate-100 hover:bg-slate-200"
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
          class="flex h-full items-center justify-center text-sm text-slate-400"
        >
          Loading…
        </div>
        <div
          v-else-if="isEmptyCanvas"
          class="flex h-full items-center justify-center bg-slate-100"
        >
          <div class="max-w-md p-8 text-center text-slate-500">
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
