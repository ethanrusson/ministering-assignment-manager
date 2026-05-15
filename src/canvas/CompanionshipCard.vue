<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
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
import { useDragPreview } from './dragPreview';
import { useSnapshot } from './useSnapshot';
import {
  CARD_H as LAYOUT_CARD_H,
  CARD_W as LAYOUT_CARD_W,
  columnIndexForX,
  columnXForIndex,
  findInsertOrdinalY,
  isPointInDistrict,
  packColumn,
  renormalizeColumnSortKeys,
  renderedPosition,
} from './layout';
import AgeBadge from '@/components/AgeBadge.vue';
import LabelChip from '@/components/LabelChip.vue';
import CardContextMenu, { type MenuItem } from './CardContextMenu.vue';
import { EllipsisVerticalIcon } from '@heroicons/vue/24/outline';
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
const dragPreview = useDragPreview();
const snap = useSnapshot();

const CARD_W = LAYOUT_CARD_W;
const CARD_H = LAYOUT_CARD_H;

// Live drag state — set by the move drag handler; nullable so the
// computed render position can fall back to the masonry layout.
const liveX = ref<number | null>(null);
const liveY = ref<number | null>(null);
const dragging = ref(false);

const cardEl = ref<HTMLElement | null>(null);

// ─── Reactive content ──────────────────────────────────────────────────────

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

// ─── Snapshot diff ─────────────────────────────────────────────────────────

const snapshotElderIds = computed((): Set<string> | null => {
  if (!snap.snapshot.value) return null;
  return new Set(
    snap.snapshot.value.elderLinks
      .filter((l) => l.companionship_id === props.companionship.id)
      .map((l) => l.elder_id),
  );
});

const snapshotHouseholdIds = computed((): Set<string> | null => {
  if (!snap.snapshot.value) return null;
  return new Set(
    snap.snapshot.value.householdLinks
      .filter((l) => l.companionship_id === props.companionship.id)
      .map((l) => l.household_id),
  );
});

/** True when the card's elder/household membership differs from the snapshot. */
const hasChanges = computed(() => {
  const sE = snapshotElderIds.value;
  const sH = snapshotHouseholdIds.value;
  if (!sE || !sH) return false;
  const currE = new Set(elderIds.value);
  const currH = new Set(householdIds.value);
  return (
    [...currE].some((id) => !sE.has(id)) ||
    [...sE].some((id) => !currE.has(id)) ||
    [...currH].some((id) => !sH.has(id)) ||
    [...sH].some((id) => !currH.has(id))
  );
});

/** Extra Tailwind classes for an elder chip that was added since the snapshot. */
function elderClass(elderId: string): string {
  const sE = snapshotElderIds.value;
  if (!sE) return '';
  return !sE.has(elderId) ? 'text-blue-600 italic' : '';
}

/** Extra Tailwind classes for a household row that was added since the snapshot. */
function householdClass(householdId: string): string {
  const sH = snapshotHouseholdIds.value;
  if (!sH) return '';
  return !sH.has(householdId) ? 'text-blue-600 italic' : '';
}

// ─── Render position ───────────────────────────────────────────────────────
//
// For free-floating cards (district_id == null), `position_x` / `position_y`
// are pixel coordinates — render directly.
//
// For districted cards, `position_x` encodes column index and `position_y`
// is a sort key. The actual rendered (x, y) is computed by packing the
// column with measured heights. If a drag preview is active for this card's
// district + column, a placeholder is reserved at the projected ordinal.

const district = computed(() =>
  props.companionship.district_id
    ? districts.items.find((d) => d.id === props.companionship.district_id) ?? null
    : null,
);

const ownColumn = computed<0 | 1 | null>(() => {
  if (!district.value) return null;
  return columnIndexForX(district.value, props.companionship.position_x);
});

const renderedXY = computed(() => {
  if (liveX.value !== null && liveY.value !== null) {
    return { x: liveX.value, y: liveY.value };
  }
  if (!district.value || ownColumn.value === null) {
    // Un-districted: pixel coords.
    return {
      x: props.companionship.position_x,
      y: props.companionship.position_y,
    };
  }
  // Districted: pack the column.
  const d = district.value;
  const col = ownColumn.value;
  const colCards = companionships.items
    .filter(
      (c) =>
        c.district_id === d.id && columnIndexForX(d, c.position_x) === col,
    )
    .map((c) => ({ id: c.id, position_y: c.position_y }));

  // Inject placeholder slot if the live drag preview targets this column.
  const preview = dragPreview.state.value;
  const usePlaceholder =
    preview &&
    preview.districtId === d.id &&
    preview.column === col &&
    preview.cardId !== props.companionship.id;

  const packed = packColumn(colCards, companionships.heightById, {
    placeholderOrdinal: usePlaceholder ? preview.ordinal : undefined,
    placeholderHeight: usePlaceholder ? preview.height : undefined,
    excludeId: preview?.cardId, // exclude the dragged card from layout
  });
  const pos = renderedPosition(d, col, packed, props.companionship.id);
  if (!pos) {
    // Fallback (shouldn't happen) — use raw coords.
    return {
      x: props.companionship.position_x,
      y: props.companionship.position_y,
    };
  }
  return pos;
});

const x = computed(() => renderedXY.value.x);
const y = computed(() => renderedXY.value.y);

// Card height for layout: prefer measured; fall back to default.
const measuredHeight = computed(
  () => companionships.heightById.get(props.companionship.id) ?? CARD_H,
);

// ─── Visual classes ────────────────────────────────────────────────────────

const isHovered = computed(
  () =>
    transfer.state.active &&
    transfer.state.hoveredDropZone?.kind === 'companionship' &&
    transfer.state.hoveredDropZone?.id === props.companionship.id,
);

const cardClasses = computed(() => {
  const bgClass = hasChanges.value ? 'bg-blue-50' : 'bg-stone-100';
  if (isHovered.value) return 'ring-2 ring-emerald-400 bg-emerald-50';
  if (severity.value === 'danger') return `${bgClass} ring-2 ring-danger-400`;
  if (severity.value === 'warn') return `${bgClass} ring-2 ring-warn-400`;
  return bgClass;
});

// Smooth transitions for layout shifts; suppressed during this card's own drag.
const transitionStyle = computed(() =>
  dragging.value
    ? 'transition: none'
    : 'transition: top 150ms ease-out, left 150ms ease-out',
);

// ─── ResizeObserver — report measured height to the store ──────────────────

let observer: ResizeObserver | null = null;

onMounted(() => {
  if (!cardEl.value) return;
  // contentRect.height excludes border/margin; use offsetHeight for true visual.
  const updateHeight = () => {
    if (!cardEl.value) return;
    companionships.setHeight(props.companionship.id, cardEl.value.offsetHeight);
  };
  updateHeight();
  observer = new ResizeObserver(() => {
    // Use rAF to avoid the "ResizeObserver loop limit exceeded" warning when
    // measuring elements whose size changes during the same frame.
    requestAnimationFrame(updateHeight);
  });
  observer.observe(cardEl.value);
});

onBeforeUnmount(() => {
  observer?.disconnect();
});

// ─── Move drag ─────────────────────────────────────────────────────────────

const { makeStart } = useCardDrag(() => props.scale);

// Initial drag origin — for districted cards, derive from the *current rendered*
// position so the card stays under the cursor. For free cards, use stored coords.
function dragOriginPos(): { x: number; y: number } {
  return { x: x.value, y: y.value };
}

// Compute and publish the live drag preview based on current pointer (world-space).
function updatePreview(p: { x: number; y: number }) {
  const center = { x: p.x + CARD_W / 2, y: p.y + measuredHeight.value / 2 };
  const target = districts.items.find((d) => isPointInDistrict(center, d));
  if (!target) {
    dragPreview.clearPreview();
    return;
  }
  const col = columnIndexForX(target, center.x);
  const colCards = companionships.items
    .filter((c) => c.district_id === target.id && columnIndexForX(target, c.position_x) === col)
    .map((c) => ({ id: c.id, position_y: c.position_y }));
  const { ordinal } = findInsertOrdinalY(
    target,
    colCards,
    companionships.heightById,
    center.y,
    props.companionship.id,
  );
  dragPreview.setPreview({
    cardId: props.companionship.id,
    districtId: target.id,
    column: col,
    ordinal,
    height: measuredHeight.value,
  });
}

// ─── Context menu ──────────────────────────────────────────────────────────

const menuOpen = ref(false);
const menuX = ref(0);
const menuY = ref(0);

function openMenuFromButton(e: Event) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  menuX.value = r.right - 200;
  menuY.value = r.bottom + 4;
  menuOpen.value = true;
}
function openMenuAt(clientX: number, clientY: number) {
  menuX.value = clientX;
  menuY.value = clientY;
  menuOpen.value = true;
}
function onContextMenu(e: MouseEvent) {
  e.preventDefault();
  openMenuAt(e.clientX, e.clientY);
}

// Long-press on touch opens the menu (no right-click on iPad).
let longPressTimer: number | null = null;
let longPressStart: { x: number; y: number } | null = null;
function onCardPointerDown(e: PointerEvent) {
  if (e.pointerType !== 'touch') return;
  longPressStart = { x: e.clientX, y: e.clientY };
  if (longPressTimer) window.clearTimeout(longPressTimer);
  longPressTimer = window.setTimeout(() => {
    if (longPressStart) openMenuAt(longPressStart.x, longPressStart.y);
    longPressTimer = null;
  }, 500);
}
function cancelLongPress(e?: PointerEvent) {
  if (longPressTimer !== null) {
    if (e && longPressStart) {
      const dx = e.clientX - longPressStart.x;
      const dy = e.clientY - longPressStart.y;
      if (Math.hypot(dx, dy) < 8) return; // movement under threshold — keep timer
    }
    window.clearTimeout(longPressTimer);
    longPressTimer = null;
    longPressStart = null;
  }
}

async function deleteCard() {
  if (!window.confirm('Delete this card? Its elders and households will return to the "to assign" sections.')) return;
  await companionships.remove(props.companionship.id);
}
async function unassignAllElders() {
  if (!elderRows.value.length) return;
  await companionships.unassignAllElders(props.companionship.id);
}
async function unassignAllHouseholds() {
  if (!householdRows.value.length) return;
  await companionships.unassignAllHouseholds(props.companionship.id);
}

const menuItems = computed<MenuItem[]>(() => {
  const items: MenuItem[] = [];
  if (elderRows.value.length) {
    items.push({ label: 'Unassign all elders', onClick: unassignAllElders });
  }
  if (householdRows.value.length) {
    items.push({ label: 'Unassign all households', onClick: unassignAllHouseholds });
  }
  items.push({ label: 'Delete card', variant: 'danger', onClick: deleteCard });
  return items;
});

onBeforeUnmount(() => {
  if (longPressTimer !== null) window.clearTimeout(longPressTimer);
});

const startMove = makeStart(dragOriginPos, {
  shouldStart: (e) => {
    const t = e.target as HTMLElement;
    return !t.closest('[data-transfer]');
  },
  onLive: (p) => {
    dragging.value = true;
    liveX.value = Math.round(p.x);
    liveY.value = Math.round(p.y);
    updatePreview(p);
  },
  onCancel: () => {
    dragging.value = false;
    liveX.value = null;
    liveY.value = null;
    dragPreview.clearPreview();
  },
  onDrop: async (p) => {
    const fx = Math.round(p.x);
    const fy = Math.round(p.y);
    const measuredH = measuredHeight.value;

    // Drop test: which district (if any) contains the card's center?
    const center = { x: fx + CARD_W / 2, y: fy + measuredH / 2 };
    const containingDistrict = districts.items.find((d) => isPointInDistrict(center, d));

    try {
      if (!containingDistrict) {
        // Drop into free canvas — pixel coords, no district.
        await companionships.update(props.companionship.id, {
          position_x: fx,
          position_y: fy,
          ...(props.companionship.district_id !== null ? { district_id: null } : {}),
        });
      } else {
        // Districted drop — snap to column + insert ordinal.
        const col = columnIndexForX(containingDistrict, center.x);
        const colCards = companionships.items
          .filter(
            (c) =>
              c.district_id === containingDistrict.id &&
              columnIndexForX(containingDistrict, c.position_x) === col,
          )
          .map((c) => ({ id: c.id, position_y: c.position_y }));

        const insert = findInsertOrdinalY(
          containingDistrict,
          colCards,
          companionships.heightById,
          center.y,
          props.companionship.id,
        );

        const newPosX = columnXForIndex(containingDistrict, col);
        const districtChanged =
          props.companionship.district_id !== containingDistrict.id;

        if (insert.needsRenormalize) {
          // Renormalize the entire target column with this card spliced in.
          const renorm = renormalizeColumnSortKeys(colCards, {
            id: props.companionship.id,
            atOrdinal: insert.ordinal,
            excludeId: props.companionship.id,
          });
          const updates = renorm.map((r) => {
            if (r.id === props.companionship.id) {
              return {
                id: r.id,
                position_x: newPosX,
                position_y: r.position_y,
                district_id: containingDistrict.id,
              };
            }
            return {
              id: r.id,
              position_x: columnXForIndex(containingDistrict, col),
              position_y: r.position_y,
            };
          });
          await companionships.updatePositionsBulk(updates);
        } else {
          await companionships.update(props.companionship.id, {
            position_x: newPosX,
            position_y: insert.sortY,
            ...(districtChanged ? { district_id: containingDistrict.id } : {}),
          });
        }
      }
    } finally {
      // Clear live drag state AFTER the persist completes so the card
      // doesn't briefly snap to its old computed position before the new
      // one arrives in the store.
      liveX.value = null;
      liveY.value = null;
      dragging.value = false;
      dragPreview.clearPreview();
    }
  },
});
</script>

<template>
  <div
    ref="cardEl"
    class="absolute flex flex-col overflow-hidden rounded-2xl border border-stone-200 select-none"
    :class="[cardClasses, dragging ? 'shadow-lg' : '']"
    :style="`left:${x}px; top:${y}px; width:${CARD_W}px; ${transitionStyle}`"
    data-card
    data-bbox
    :data-x="x"
    :data-y="y"
    :data-w="CARD_W"
    :data-h="measuredHeight"
    data-drop-zone="companionship"
    :data-companionship-id="companionship.id"
    @pointerenter="transfer.setHover('companionship', companionship.id)"
    @pointerleave="transfer.clearHover('companionship', companionship.id)"
    @contextmenu="onContextMenu"
    @pointerdown="onCardPointerDown"
    @pointermove="cancelLongPress"
    @pointerup="cancelLongPress"
    @pointercancel="cancelLongPress"
  >
    <!-- Three-dot menu (top-right) -->
    <button
      class="absolute right-1.5 top-1.5 z-10 rounded-md p-1 text-stone-400 hover:bg-stone-200/60 hover:text-stone-700"
      data-no-pan
      title="Card actions"
      aria-label="Card actions"
      @pointerdown.stop
      @click.stop="openMenuFromButton"
    >
      <EllipsisVerticalIcon class="h-4 w-4" />
    </button>

    <!-- Drag handle — centered on card surface, no background strip -->
    <div
      class="flex shrink-0 cursor-grab items-center justify-center pb-1 pt-2 active:cursor-grabbing"
      @pointerdown.stop="startMove"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-2.5 w-8 text-stone-300" fill="currentColor" viewBox="0 0 32 10">
        <rect x="4" y="0" width="24" height="2" rx="1"/>
        <rect x="4" y="8" width="24" height="2" rx="1"/>
      </svg>
    </div>

    <!-- Elders -->
    <div class="px-3 pb-3">
      <p class="mb-2 text-xs text-stone-400">Elders · {{ elderRows.length }}</p>
      <div class="flex flex-wrap gap-1.5">
        <span
          v-for="elder in elderRows"
          :key="elder.id"
          class="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm shadow-sm"
          data-transfer
          :data-transfer-kind="'elder'"
          :data-transfer-id="elder.id"
          :data-from-companionship="companionship.id"
          @pointerdown.stop="transfer.startDrag($event, 'elder', elder.id, companionship.id)"
        >
          <span class="truncate" :class="elderClass(elder.id)">{{ elder.name }}</span>
          <AgeBadge :age="elder.age" />
        </span>
      </div>
    </div>

    <!-- Divider -->
    <div class="mx-3 border-t border-stone-200" />

    <!-- Households -->
    <div class="px-3 py-3">
      <p class="mb-2 text-xs text-stone-400">Households · {{ householdRows.length }}</p>
      <div v-if="!householdRows.length" class="text-center text-xs text-stone-400">
        No households assigned
      </div>
      <ul v-else class="space-y-1.5">
        <li
          v-for="h in householdRows"
          :key="h.id"
          class="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm shadow-sm"
          data-transfer
          :data-transfer-kind="'household'"
          :data-transfer-id="h.id"
          :data-from-companionship="companionship.id"
          @pointerdown.stop="transfer.startDrag($event, 'household', h.id, companionship.id)"
        >
          <!-- Grip dots -->
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-2.5 shrink-0 text-stone-300" fill="currentColor" viewBox="0 0 8 12">
            <circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/>
            <circle cx="2" cy="6" r="1.2"/><circle cx="6" cy="6" r="1.2"/>
            <circle cx="2" cy="10" r="1.2"/><circle cx="6" cy="10" r="1.2"/>
          </svg>
          <span class="flex-1 truncate" :class="householdClass(h.id)">{{ h.name }}</span>
          <span class="flex shrink-0 gap-1">
            <LabelChip
              v-for="lid in households.labelsForHousehold.get(h.id) ?? []"
              :key="lid"
              :name="labels.byId.get(lid)?.name ?? '?'"
              :color="labels.byId.get(lid)?.color ?? '#888'"
            />
          </span>
        </li>
      </ul>
    </div>

    <CardContextMenu
      :open="menuOpen"
      :x="menuX"
      :y="menuY"
      :items="menuItems"
      @close="menuOpen = false"
    />
  </div>
</template>
