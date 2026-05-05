<script setup lang="ts">
import { computed, ref } from 'vue';
import { useCompanionshipsStore } from '@/stores/companionships';
import { useDistrictsStore } from '@/stores/districts';
import { useEldersStore } from '@/stores/elders';
import { useHouseholdsStore } from '@/stores/households';
import { useLabelsStore } from '@/stores/labels';
import {
  highestSeverity,
  validateCompanionship,
} from '@/lib/validation';
import { useCardDrag } from './useCardDrag';
import { useTransfer } from './useTransfer';
import {
  CARD_H as LAYOUT_CARD_H,
  CARD_W as LAYOUT_CARD_W,
  cellOf,
  cellTopLeft,
  findFreeCell,
  isPointInDistrict,
} from './layout';
import AgeBadge from '@/components/AgeBadge.vue';
import LabelChip from '@/components/LabelChip.vue';
import type { Database } from '@/types/database';

type CompanionshipRow = Database['public']['Tables']['companionships']['Row'];

const props = defineProps<{
  companionship: CompanionshipRow;
  scale: number;
}>();

const companionships = useCompanionshipsStore();
const districts = useDistrictsStore();
const elders = useEldersStore();
const households = useHouseholdsStore();
const labels = useLabelsStore();
const transfer = useTransfer();

const CARD_W = LAYOUT_CARD_W;
const CARD_H = LAYOUT_CARD_H;

const liveX = ref<number | null>(null);
const liveY = ref<number | null>(null);

const elderIds = computed(
  () => companionships.eldersInCompanionship.get(props.companionship.id) ?? [],
);
const householdIds = computed(
  () => companionships.householdsInCompanionship.get(props.companionship.id) ?? [],
);
const elderRows = computed(() =>
  elderIds.value.map((id) => elders.byId.get(id)).filter((e): e is NonNullable<typeof e> => !!e),
);
const householdRows = computed(() =>
  householdIds.value
    .map((id) => households.byId.get(id))
    .filter((h): h is NonNullable<typeof h> => !!h),
);

const warnings = computed(() =>
  validateCompanionship({
    id: props.companionship.id,
    districtId: props.companionship.district_id,
    elders: elderRows.value.map((e) => ({ id: e.id, name: e.name, age: e.age })),
    householdCount: householdRows.value.length,
  }),
);
const severity = computed(() => highestSeverity(warnings.value));

const x = computed(() => liveX.value ?? props.companionship.position_x);
const y = computed(() => liveY.value ?? props.companionship.position_y);

const isHovered = computed(
  () =>
    transfer.state.active &&
    transfer.state.hoveredDropZone?.kind === 'companionship' &&
    transfer.state.hoveredDropZone?.id === props.companionship.id,
);

const cardClasses = computed(() => {
  if (isHovered.value) return 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-300';
  if (severity.value === 'danger') return 'border-danger-400 bg-danger-100/50';
  if (severity.value === 'warn') return 'border-warn-400 bg-warn-50';
  return 'border-slate-300 bg-white';
});

// Move drag — anchor on the card itself but skip if the user grabbed an
// elder/household chip (those have their own drag for transfers).
const { makeStart } = useCardDrag(() => props.scale);
const startMove = makeStart(
  () => ({ x: props.companionship.position_x, y: props.companionship.position_y }),
  {
    shouldStart: (e) => {
      const t = e.target as HTMLElement;
      return !t.closest('[data-transfer]');
    },
    onLive: (p) => {
      liveX.value = Math.round(p.x);
      liveY.value = Math.round(p.y);
    },
    onDrop: async (p) => {
      const fx = Math.round(p.x);
      const fy = Math.round(p.y);
      liveX.value = null;
      liveY.value = null;
      // Drop test: which district (if any) contains the card's center?
      const center = { x: fx + CARD_W / 2, y: fy + CARD_H / 2 };
      const containingDistrict = districts.items.find((d) => isPointInDistrict(center, d));
      let snappedX = fx;
      let snappedY = fy;
      if (containingDistrict) {
        // Snap to nearest free cell in this district's grid.
        const preferred = cellOf(containingDistrict, { position_x: fx, position_y: fy });
        const occupants = companionships.items.filter(
          (c) => c.district_id === containingDistrict.id,
        );
        const cell = findFreeCell(
          containingDistrict,
          occupants,
          preferred,
          props.companionship.id,
        );
        const tl = cellTopLeft(containingDistrict, cell.col, cell.row);
        snappedX = tl.x;
        snappedY = tl.y;
      }
      const nextDistrictId = containingDistrict?.id ?? null;
      const patch: { position_x: number; position_y: number; district_id?: string | null } = {
        position_x: snappedX,
        position_y: snappedY,
      };
      if (nextDistrictId !== props.companionship.district_id) {
        patch.district_id = nextDistrictId;
      }
      await companionships.update(props.companionship.id, patch);
    },
  },
);

async function removeElder(elderId: string) {
  await companionships.unassignElder(elderId);
}
async function removeHousehold(householdId: string) {
  await companionships.unassignHousehold(householdId);
}
</script>

<template>
  <div
    class="absolute flex flex-col overflow-hidden cursor-grab rounded-md border shadow-sm select-none active:cursor-grabbing"
    :class="cardClasses"
    :style="{
      left: x + 'px',
      top: y + 'px',
      width: CARD_W + 'px',
      minHeight: CARD_H + 'px',
    }"
    data-card
    data-bbox
    :data-x="x"
    :data-y="y"
    :data-w="CARD_W"
    :data-h="CARD_H"
    data-drop-zone="companionship"
    :data-companionship-id="companionship.id"
    @pointerdown="startMove"
    @pointerenter="transfer.setHover('companionship', companionship.id)"
    @pointerleave="transfer.clearHover('companionship', companionship.id)"
  >
    <!-- Elder chips -->
    <div class="flex flex-wrap gap-1 px-3 py-2">
      <span
        v-for="elder in elderRows"
        :key="elder.id"
        class="group inline-flex items-center gap-1 rounded-full bg-slate-100 pl-2 pr-1 py-1 text-s"
        data-transfer
        :data-transfer-kind="'elder'"
        :data-transfer-id="elder.id"
        :data-from-companionship="companionship.id"
        @pointerdown.stop="transfer.startDrag($event, 'elder', elder.id, companionship.id)"
      >
        <span class="truncate">{{ elder.name }}</span>
        <AgeBadge :age="elder.age" />
        <button
          class="hidden rounded text-slate-400 hover:text-danger-600 group-hover:inline-block"
          title="Remove from companionship"
          data-no-pan
          @click.stop="removeElder(elder.id)"
          @pointerdown.stop
        >
          ×
        </button>
      </span>
    </div>

    <!-- Households -->
    <div class="border-t border-slate-200 px-3 py-2">
      <div v-if="!householdRows.length" class="text-center text-xs text-slate-400">
        No households assigned
      </div>
      <ul v-else class="space-y-1">
        <li
          v-for="h in householdRows"
          :key="h.id"
          class="group flex items-center gap-4 text-s"
          data-transfer
          :data-transfer-kind="'household'"
          :data-transfer-id="h.id"
          :data-from-companionship="companionship.id"
          @pointerdown.stop="transfer.startDrag($event, 'household', h.id, companionship.id)"
        >
          <span class="flex-1 truncate">{{ h.name }}</span>
          <span class="flex shrink-0 gap-0.5">
            <LabelChip
              v-for="lid in households.labelsForHousehold.get(h.id) ?? []"
              :key="lid"
              :name="labels.byId.get(lid)?.name ?? '?'"
              :color="labels.byId.get(lid)?.color ?? '#888'"
            />
          </span>
          <button
            class="hidden rounded text-slate-400 hover:text-danger-600 group-hover:inline-block"
            title="Unassign household"
            data-no-pan
            @click.stop="removeHousehold(h.id)"
            @pointerdown.stop
          >
            ×
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
