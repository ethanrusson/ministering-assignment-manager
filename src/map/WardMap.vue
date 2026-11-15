<script setup lang="ts">
// Ward map (docs/ward-map-prd.md, Phase 1): households at their LCR locations,
// names always shown, tap one for its ministering connections. Read-only.
//
// World units are meters (see geo.ts). Squares and labels keep a constant
// on-screen size, so the world layer only translates; positions are scaled by
// hand and spread apart for display when they collide (nudge.ts).

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { XMarkIcon } from '@heroicons/vue/24/outline';
import { useAuthStore } from '@/stores/auth';
import { useEldersStore } from '@/stores/elders';
import { useHouseholdsStore } from '@/stores/households';
import { useLabelsStore } from '@/stores/labels';
import { useDistrictsStore } from '@/stores/districts';
import { useCompanionshipsStore } from '@/stores/companionships';
import { usePanZoom, ZOOM_STEP } from '@/canvas/usePanZoom';
import { districtFamily, districtLabel } from '@/canvas/districtColors';
import {
  distance,
  formatMiles,
  groupByPoint,
  project,
  projectionOrigin,
  scaleBar,
  wardBounds,
  type Point,
} from './geo';
import {
  allConnections,
  buildConnections,
  eldersLivingIn,
  type Line,
  type MinisteringModel,
} from './connections';
import { nudge } from './nudge';
import HouseholdMark, { type Mark } from './HouseholdMark.vue';

/** Zoom limits in screen px per meter: about 200 km across down to 100 m. */
const MIN_SCALE = 0.005;
const MAX_SCALE = 8;
const SQUARE = 22;
const GROUP_SQUARE = 14;
const POPOVER_W = 290;
/** Farthest a mark is pushed from its home to clear a neighbour, in screen px. */
const MAX_NUDGE = 48;

const auth = useAuthStore();
const elders = useEldersStore();
const households = useHouseholdsStore();
const labels = useLabelsStore();
const districts = useDistrictsStore();
const companionships = useCompanionshipsStore();

const root = ref<HTMLDivElement | null>(null);
const size = ref({ w: 0, h: 0 });
const {
  state: vp,
  panBy,
  zoomAt,
  fitTo,
  restore,
} = usePanZoom(() => auth.wardId, { storageKey: 'mapViewport', min: MIN_SCALE, max: MAX_SCALE });

const v = (name: string) => `rgb(var(--c-${name}))`;

// ─── Ward data ─────────────────────────────────────────────────────────────

const located = computed(() =>
  households.visible.filter((h) => h.lat !== null && h.lng !== null),
);
const unlocatedCount = computed(() => households.visible.length - located.value.length);
const origin = computed(() =>
  projectionOrigin(located.value.map((h) => ({ lat: h.lat!, lng: h.lng! }))),
);

const model = computed<MinisteringModel>(() => {
  const homeOf = new Map<string, string>();
  for (const e of elders.visible) if (e.home_household_id) homeOf.set(e.id, e.home_household_id);
  return {
    companionshipForHousehold: companionships.companionshipForHousehold,
    companionshipForElder: companionships.companionshipForElder,
    eldersInCompanionship: companionships.eldersInCompanionship,
    householdsInCompanionship: companionships.householdsInCompanionship,
    homeOf,
  };
});

/** Rank of the district a household's companionship sits in; -1 for none. */
function districtRankOf(householdId: string): number {
  const compId = companionships.companionshipForHousehold.get(householdId);
  const districtId = compId ? companionships.byId.get(compId)?.district_id : null;
  return districtId ? districts.items.findIndex((d) => d.id === districtId) : -1;
}

function markFor(householdId: string): Mark {
  const residents = eldersLivingIn(householdId, model.value);
  const free = residents.some((e) => !companionships.companionshipForElder.has(e));
  return {
    family: districtFamily(districtRankOf(householdId)),
    hasCompanionship: companionships.companionshipForHousehold.has(householdId),
    elder: free ? 'free' : residents.length ? 'minister' : null,
    labelColors: (households.labelsForHousehold.get(householdId) ?? [])
      .map((id) => labels.byId.get(id)?.color)
      .filter((c): c is string => !!c),
  };
}

/** Map label: "Surname, Given & Given" → "Surname, G." */
function shortName(name: string): string {
  const [surname, given] = name.split(',').map((s) => s.trim());
  const initial = given?.[0];
  return initial ? `${surname}, ${initial}.` : surname || name;
}

let measureCtx: CanvasRenderingContext2D | null | undefined;
function textWidth(s: string): number {
  if (measureCtx === undefined) measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) return s.length * 6.2;
  measureCtx.font = "600 11px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  return measureCtx.measureText(s).width;
}

interface Node {
  id: string;
  name: string;
  short: string;
  lat: number;
  lng: number;
  mark: Mark;
}

/** Households grouped by identical point, with their box size for nudging. */
const groups = computed(() =>
  groupByPoint<Node>(
    located.value.map((h) => ({
      id: h.id,
      name: h.name,
      short: shortName(h.name),
      lat: h.lat!,
      lng: h.lng!,
      mark: markFor(h.id),
    })),
  ).map((g) => {
    const p = project(g, origin.value);
    if (g.items.length === 1) {
      const w = Math.max(SQUARE + 4, textWidth(g.items[0].short) + 8);
      return { ...g, p, multi: false, box: { left: -w / 2, top: -13, w, h: 44 } };
    }
    const colW = GROUP_SQUARE + 5 + Math.max(...g.items.map((n) => textWidth(n.short))) + 8;
    const rows = Math.ceil(g.items.length / 2);
    const w = 2 * colW + 16;
    const h = 16 + rows * 20;
    return { ...g, p, multi: true, box: { left: -w / 2, top: -h / 2, w, h } };
  }),
);

const groupOf = computed(() => {
  const m = new Map<string, (typeof groups.value)[number]>();
  for (const g of groups.value) for (const n of g.items) m.set(n.id, g);
  return m;
});

// Nudge at quarter-octave zoom steps, so a pinch doesn't re-run it every frame.
const nudgeScale = computed(() => 2 ** (Math.round(Math.log2(vp.scale) * 4) / 4));
const offsets = computed(() =>
  nudge(
    groups.value.map((g) => ({
      id: g.key,
      x: g.p.x * nudgeScale.value,
      y: g.p.y * nudgeScale.value,
      ...g.box,
    })),
    { maxShift: MAX_NUDGE },
  ),
);

/** Where a group is drawn, in world-layer pixels. */
function placeOf(g: (typeof groups.value)[number]): Point {
  const o = offsets.value.get(g.key) ?? { dx: 0, dy: 0 };
  return { x: g.p.x * vp.scale + o.dx, y: g.p.y * vp.scale + o.dy };
}

// ─── Selection and lines ───────────────────────────────────────────────────

const selectedId = ref<string | null>(null);
const showAll = ref(false);

const conn = computed(() =>
  selectedId.value ? buildConnections(selectedId.value, model.value) : null,
);
const faded = (id: string) => !!conn.value && !conn.value.focus.has(id);

const placed = computed(() =>
  groups.value.map((g) => {
    const at = placeOf(g);
    const sel = g.items.some((n) => n.id === selectedId.value);
    const focus = g.items.some((n) => !faded(n.id));
    return { ...g, x: at.x, y: at.y, sel, faded: !focus, z: sel ? 3 : conn.value && focus ? 2 : 1 };
  }),
);

function path(lines: Line[]): string {
  let d = '';
  for (const l of lines) {
    const a = groupOf.value.get(l.from);
    const b = groupOf.value.get(l.to);
    if (!a || !b || a === b) continue;
    const pa = placeOf(a);
    const pb = placeOf(b);
    d += `M${pa.x.toFixed(1)} ${pa.y.toFixed(1)}L${pb.x.toFixed(1)} ${pb.y.toFixed(1)}`;
  }
  return d;
}

const paths = computed(() => ({
  all: showAll.value ? path(allConnections(model.value)) : '',
  ministers: conn.value ? path(conn.value.ministers) : '',
  served: conn.value ? path(conn.value.served) : '',
  companion: conn.value ? path(conn.value.companion) : '',
}));

const ministerColor = computed(() => {
  const f = selectedId.value ? districtFamily(districtRankOf(selectedId.value)) : null;
  return v(f ? `${f}-500` : 'stone-700');
});

// ─── Popover ───────────────────────────────────────────────────────────────

const pointOf = (householdId: string) => groupOf.value.get(householdId)?.p ?? null;
/** "Surname, Given" → "Given Surname", for reading names in a sentence. */
function elderName(id: string): string {
  const name = elders.byId.get(id)?.name ?? '';
  const [surname, given] = name.split(',').map((s) => s.trim());
  return given ? `${given} ${surname}` : name;
}

/** "A", "A & B", "A, B & C". */
function joinNames(names: string[]): string {
  return names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} & ${names.at(-1)}`;
}

const popover = computed(() => {
  const id = selectedId.value;
  const h = id ? households.byId.get(id) : null;
  const g = id ? groupOf.value.get(id) : null;
  if (!id || !h || !g) return null;

  const rank = districtRankOf(id);
  const family = districtFamily(rank);
  const compId = companionships.companionshipForHousehold.get(id);
  const ministers = compId ? (companionships.eldersInCompanionship.get(compId) ?? []) : [];
  const homes = ministers
    .map((e) => model.value.homeOf.get(e))
    .map((hid) => (hid ? pointOf(hid) : null))
    .filter((p): p is Point => !!p);
  const hub = homes.length
    ? { x: homes.reduce((s, p) => s + p.x, 0) / homes.length, y: homes.reduce((s, p) => s + p.y, 0) / homes.length }
    : null;
  const count = compId ? (companionships.householdsInCompanionship.get(compId)?.length ?? 0) : 0;

  const residents = eldersLivingIn(id, model.value).map((elderId) => {
    const own = companionships.companionshipForElder.get(elderId);
    if (!own) return { id: elderId, title: elderName(elderId), body: 'Has no companionship yet', detail: '' };
    const companions = (companionships.eldersInCompanionship.get(own) ?? []).filter((e) => e !== elderId);
    const served = (companionships.householdsInCompanionship.get(own) ?? []).filter((x) => x !== id);
    const far = served
      .map((x) => pointOf(x))
      .filter((p): p is Point => !!p)
      .reduce((m, p) => Math.max(m, distance(p, g.p)), 0);
    return {
      id: elderId,
      title: companions.length
        ? `${elderName(elderId)} ministers with ${joinNames(companions.map(elderName))}`
        : `${elderName(elderId)} ministers alone`,
      body: served.map((x) => households.byId.get(x)?.name ?? '').join('; ') || 'No households yet',
      detail: served.length
        ? `${served.length} ${served.length === 1 ? 'household' : 'households'}${far ? ` · farthest ${formatMiles(far)}` : ''}`
        : '',
    };
  });

  const at = placeOf(g);
  const screenX = at.x + vp.tx;
  const screenY = at.y + vp.ty;
  const gap = g.multi ? g.box.w / 2 + 8 : 20;
  const left = screenX + gap + POPOVER_W > size.value.w;
  const above = screenY > size.value.h * 0.55;

  return {
    name: h.name,
    district: rank < 0 ? null : `${districtLabel(rank)} · ${districts.items[rank].name}`,
    family,
    labels: (households.labelsForHousehold.get(id) ?? [])
      .map((lid) => labels.byId.get(lid))
      .filter((l) => !!l),
    ministeredBy: joinNames(ministers.map(elderName)),
    ministeredDetail: [
      rank < 0 ? null : districtLabel(rank),
      hub ? `${formatMiles(distance(hub, g.p))} away` : null,
      `${count} ${count === 1 ? 'household' : 'households'}`,
    ]
      .filter(Boolean)
      .join(' · '),
    hasCompanionship: !!compId,
    residents,
    style: {
      left: `${at.x}px`,
      top: `${at.y}px`,
      width: `${POPOVER_W}px`,
      transform: `translate(${left ? `calc(-100% - ${gap}px)` : `${gap}px`}, ${above ? 'calc(-100% + 24px)' : '-24px'})`,
    },
  };
});

function select(id: string) {
  selectedId.value = id;
}

// ─── Viewport ──────────────────────────────────────────────────────────────

const bar = computed(() => scaleBar(vp.scale));

function fit() {
  const b = wardBounds(groups.value.map((g) => g.p));
  if (!b || !size.value.w) return;
  fitTo(b, { width: size.value.w, height: size.value.h }, 60);
}

function zoomBy(factor: number) {
  zoomAt(size.value.w / 2, size.value.h / 2, factor);
}

/** Center a household and select it (search results). */
function focusHousehold(id: string) {
  const g = groupOf.value.get(id);
  if (!g) return;
  if (vp.scale < 1) vp.scale = 1;
  vp.tx = size.value.w / 2 - g.p.x * vp.scale;
  vp.ty = size.value.h / 2 - g.p.y * vp.scale;
  select(id);
}

defineExpose({ focusHousehold });

// ─── Gestures: drag pans, pinch and ctrl/cmd+wheel zoom, a tap selects ────

const pointers = new Map<number, Point>();
let dragStart: Point | null = null;
let dragLast: Point | null = null;
let dragging = false;
let suppressClick = false;
let pinchLast: { dist: number; cx: number; cy: number } | null = null;

function local(e: MouseEvent): Point {
  const r = root.value!.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function onPointerDown(e: PointerEvent) {
  if (e.button === 2 || (e.target as HTMLElement).closest('[data-no-pan]')) return;
  suppressClick = false;
  const p = local(e);
  pointers.set(e.pointerId, p);
  if (pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    pinchLast = { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    dragging = true;
    return;
  }
  dragStart = dragLast = p;
  dragging = false;
}

function onPointerMove(e: PointerEvent) {
  if (!pointers.has(e.pointerId)) return;
  const p = local(e);
  pointers.set(e.pointerId, p);
  if (pointers.size >= 2 && pinchLast) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    if (pinchLast.dist > 0) zoomAt(cx, cy, dist / pinchLast.dist);
    panBy(cx - pinchLast.cx, cy - pinchLast.cy);
    pinchLast = { dist, cx, cy };
    return;
  }
  if (!dragStart || !dragLast) return;
  if (!dragging) {
    if (Math.hypot(p.x - dragStart.x, p.y - dragStart.y) < 4) return;
    dragging = true;
    root.value?.setPointerCapture(e.pointerId);
  }
  panBy(p.x - dragLast.x, p.y - dragLast.y);
  dragLast = p;
}

function onPointerUp(e: PointerEvent) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchLast = null;
  if (pointers.size === 0) {
    suppressClick = dragging;
    dragging = false;
    dragStart = dragLast = null;
  }
  root.value?.releasePointerCapture?.(e.pointerId);
}

function onClickCapture(e: MouseEvent) {
  if (!suppressClick) return;
  suppressClick = false;
  e.stopPropagation();
}

function onBackgroundClick(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('[data-household], [data-no-pan]')) return;
  selectedId.value = null;
}

function onWheel(e: WheelEvent) {
  if (e.ctrlKey || e.metaKey) {
    const p = local(e);
    zoomAt(p.x, p.y, Math.exp(-e.deltaY / 200));
  } else {
    panBy(-e.deltaX, -e.deltaY);
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') selectedId.value = null;
}

let observer: ResizeObserver | null = null;
let placedView = false;

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  observer = new ResizeObserver(([entry]) => {
    size.value = { w: entry.contentRect.width, h: entry.contentRect.height };
    // First layout: the saved view for this ward, else fit the ward.
    if (!placedView && size.value.w) {
      placedView = true;
      if (!auth.wardId || !restore(auth.wardId)) fit();
    }
  });
  if (root.value) observer.observe(root.value);
});

// Locations can arrive after the map opens (an import): fit once they do.
watch(
  () => groups.value.length,
  (n, prev) => {
    if (n && !prev) fit();
  },
);

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  observer?.disconnect();
});
</script>

<template>
  <div
    ref="root"
    class="relative h-full w-full select-none overflow-hidden bg-stone-100"
    style="touch-action: none"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @click.capture="onClickCapture"
    @click="onBackgroundClick"
    @wheel.prevent="onWheel"
  >
    <div
      class="absolute left-0 top-0"
      :style="{ transform: `translate(${vp.tx}px, ${vp.ty}px)`, willChange: 'transform' }"
    >
      <svg
        class="pointer-events-none absolute left-0 top-0 overflow-visible"
        width="1"
        height="1"
        aria-hidden="true"
      >
        <g fill="none" stroke-linecap="round">
          <path
            v-if="paths.all"
            :d="paths.all"
            :style="{ stroke: v('stone-500') }"
            stroke-width="1"
            :opacity="selectedId ? 0.15 : 0.6"
          />
          <path :d="paths.ministers" :style="{ stroke: ministerColor }" stroke-width="3" />
          <path
            :d="paths.served"
            :style="{ stroke: v('stone-900') }"
            stroke-width="2"
            stroke-dasharray="5 4"
          />
          <path
            :d="paths.companion"
            :style="{ stroke: v('stone-900') }"
            stroke-width="1.5"
            stroke-dasharray="1 4"
          />
        </g>
      </svg>

      <template v-for="g in placed" :key="g.key">
        <button
          v-if="!g.multi"
          type="button"
          data-household
          class="absolute flex flex-col items-center gap-0.5 p-0.5"
          :style="{
            left: `${g.x}px`,
            top: `${g.y}px`,
            transform: 'translate(-50%, -13px)',
            opacity: g.faded ? 0.4 : 1,
            zIndex: g.z,
          }"
          :aria-label="`${g.items[0].name} household`"
          @click.stop="select(g.items[0].id)"
        >
          <HouseholdMark :mark="g.items[0].mark" :size="SQUARE" :selected="g.sel" />
          <span
            class="whitespace-nowrap rounded bg-white/90 px-1 text-[11px] leading-[1.15] text-stone-900"
            :class="g.sel || (conn && !g.faded) ? 'font-semibold' : 'font-medium'"
          >
            {{ g.items[0].short }}
          </span>
        </button>
        <div
          v-else
          data-household
          class="absolute w-max rounded-lg border-[1.5px] border-stone-400 bg-white p-1.5 shadow"
          :style="{
            left: `${g.x}px`,
            top: `${g.y}px`,
            transform: 'translate(-50%, -50%)',
            opacity: g.faded ? 0.4 : 1,
            zIndex: g.z,
          }"
        >
          <div class="grid grid-cols-[auto_auto] gap-x-1 gap-y-0.5">
            <button
              v-for="n in g.items"
              :key="n.id"
              type="button"
              class="flex items-center gap-[5px] rounded py-0.5 pl-0.5 pr-1"
              :class="n.id === selectedId ? 'bg-stone-200' : ''"
              :style="{ opacity: faded(n.id) && g.items.some((m) => !faded(m.id)) ? 0.4 : 1 }"
              :aria-label="`${n.name} household`"
              @click.stop="select(n.id)"
            >
              <HouseholdMark :mark="n.mark" :size="GROUP_SQUARE" />
              <span
                class="whitespace-nowrap text-[11px] text-stone-900"
                :class="n.id === selectedId ? 'font-semibold' : 'font-medium'"
              >
                {{ n.short }}
              </span>
            </button>
          </div>
        </div>
      </template>

      <div
        v-if="popover"
        data-no-pan
        class="absolute z-20 flex cursor-default flex-col gap-2.5 rounded-xl border border-stone-200 bg-white p-3 text-left text-sm shadow-xl"
        :style="popover.style"
      >
        <div class="flex items-start gap-2">
          <div class="min-w-0 flex-1">
            <div class="font-semibold">{{ popover.name }}</div>
            <div
              v-if="popover.district || popover.labels.length"
              class="mt-1 flex flex-wrap items-center gap-1"
            >
              <span
                v-if="popover.district"
                class="rounded-full px-2 py-px text-[11px] font-semibold"
                :style="{
                  backgroundColor: v(`${popover.family}-100`),
                  color: v(`${popover.family}-700`),
                }"
              >
                {{ popover.district }}
              </span>
              <span
                v-for="l in popover.labels"
                :key="l!.id"
                class="rounded-full px-2 py-px text-[11px] font-medium"
                :style="{ backgroundColor: l!.color + '22', color: l!.color }"
              >
                {{ l!.name }}
              </span>
            </div>
          </div>
          <button
            type="button"
            class="rounded-md p-1 text-stone-500 hover:bg-stone-100"
            aria-label="Close"
            @click="selectedId = null"
          >
            <XMarkIcon class="h-4 w-4" />
          </button>
        </div>

        <div v-if="popover.hasCompanionship">
          <div class="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
            Ministered by
          </div>
          <div class="mt-0.5 font-medium">{{ popover.ministeredBy || 'No elders yet' }}</div>
          <div class="text-xs text-stone-500">{{ popover.ministeredDetail }}</div>
        </div>

        <div v-for="r in popover.residents" :key="r.id">
          <div class="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
            {{ r.title }}
          </div>
          <div class="mt-0.5 text-[13px]">{{ r.body }}</div>
          <div v-if="r.detail" class="text-xs text-stone-500">{{ r.detail }}</div>
        </div>

        <div
          v-if="!popover.hasCompanionship"
          class="rounded-md bg-red-100 px-2 py-1.5 text-xs text-red-800"
        >
          No companionship assigned.
        </div>
      </div>
    </div>

    <div
      v-if="!located.length"
      class="absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-stone-500"
    >
      No household locations yet. Import them from the directory (Settings → Import locations).
    </div>

    <div
      v-if="unlocatedCount"
      data-no-pan
      class="absolute left-4 top-4 rounded-md bg-white/90 px-2 py-1 text-xs text-stone-600 shadow-sm"
    >
      {{ unlocatedCount }} without a location
    </div>

    <div
      v-if="located.length"
      class="pointer-events-none absolute bottom-6 left-4 flex flex-col gap-0.5 text-[11px] text-stone-600"
    >
      <span>{{ bar.label }}</span>
      <span
        class="block h-1 border-[1.5px] border-t-0 border-stone-600"
        :style="{ width: `${bar.px}px` }"
      />
    </div>

    <div
      class="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-stone-200 bg-white/95 px-1.5 py-1 shadow-lg backdrop-blur"
      style="bottom: max(1rem, env(safe-area-inset-bottom))"
      data-no-pan
    >
      <button
        class="h-10 w-10 rounded-full text-lg leading-none hover:bg-stone-100 disabled:opacity-40"
        title="Zoom out"
        aria-label="Zoom out"
        :disabled="vp.scale <= MIN_SCALE * 1.001"
        @click="zoomBy(1 / ZOOM_STEP)"
      >
        −
      </button>
      <button
        class="h-10 w-10 rounded-full text-lg leading-none hover:bg-stone-100 disabled:opacity-40"
        title="Zoom in"
        aria-label="Zoom in"
        :disabled="vp.scale >= MAX_SCALE * 0.999"
        @click="zoomBy(ZOOM_STEP)"
      >
        +
      </button>
      <span class="mx-1 h-5 w-px bg-stone-300"></span>
      <button
        class="h-10 rounded-full px-3 text-xs hover:bg-stone-100"
        title="Fit the ward on screen"
        @click="fit"
      >
        Fit
      </button>
      <button
        class="h-10 rounded-full px-3 text-xs transition-colors"
        :class="showAll ? 'bg-stone-800 text-white' : 'hover:bg-stone-100'"
        :aria-pressed="showAll"
        @click="showAll = !showAll"
      >
        All connections
      </button>
    </div>
  </div>
</template>
