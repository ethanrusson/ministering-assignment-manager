<script setup lang="ts">
// Ward map (docs/ward-map-prd.md, Phase 1): households at their LCR locations,
// tap one for its ministering connections. Read-only.
//
// World units are meters (see geo.ts). Squares and labels keep a constant
// on-screen size, so the world layer only translates and positions are scaled
// by hand. Marks never move to avoid each other: names that don't fit are
// left out instead (labels.ts).

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { XMarkIcon } from '@heroicons/vue/24/outline';
import { useAuthStore } from '@/stores/auth';
import { useEldersStore } from '@/stores/elders';
import { useHouseholdsStore } from '@/stores/households';
import { useLabelsStore } from '@/stores/labels';
import { useDistrictsStore } from '@/stores/districts';
import { useCompanionshipsStore } from '@/stores/companionships';
import { useStreetsStore } from '@/stores/streets';
import { useHomesStore } from '@/stores/homes';
import { pushError } from '@/lib/errorToast';
import { usePanZoom, ZOOM_STEP } from '@/canvas/usePanZoom';
import { districtFamily, districtLabel } from '@/canvas/districtColors';
import {
  distance,
  formatMiles,
  groupByPoint,
  project,
  projectionOrigin,
  scaleBar,
  unproject,
  wardBounds,
  type Point,
} from './geo';
import { homesToDraw } from './homes';
import {
  allConnections,
  buildConnections,
  eldersLivingIn,
  type Line,
  type MinisteringModel,
} from './connections';
import { placeStreetLabels } from './streets';
import { fitLabels, LABEL_OFFSET } from './labels';
import HouseholdMark, { type Mark } from './HouseholdMark.vue';
import LocationsPanel from './LocationsPanel.vue';
import { useLocationReviewsStore } from '@/stores/locationReviews';
import type { MovedData } from '@/lib/lcr/reviews';

/** Zoom limits in screen px per meter: about 200 km across down to 100 m. */
const MIN_SCALE = 0.005;
const MAX_SCALE = 8;
const SQUARE = 22;
/** How far each household sharing a point peeks out behind the front one, in px. */
const STACK_OFFSET = 4;
const POPOVER_W = 290;

const auth = useAuthStore();
const elders = useEldersStore();
const households = useHouseholdsStore();
const labels = useLabelsStore();
const districts = useDistrictsStore();
const companionships = useCompanionshipsStore();
const streets = useStreetsStore();
const homes = useHomesStore();
const reviews = useLocationReviewsStore();

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

/** Map labels for "Surname, Given & Given": "Surname", and "Surname, G." when there's room. */
function labelNames(name: string): { short: string; long: string } {
  const [surname, given] = name.split(',').map((s) => s.trim());
  const short = surname || name;
  return { short, long: given?.[0] ? `${short}, ${given[0]}.` : short };
}

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const LABEL_FONT = `600 11px ${FONT}`;
const STREET_FONT = `400 10px ${FONT}`;

let measureCtx: CanvasRenderingContext2D | null | undefined;
function textWidth(s: string, font = LABEL_FONT): number {
  if (measureCtx === undefined) measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) return s.length * 6.2;
  measureCtx.font = font;
  return measureCtx.measureText(s).width;
}

interface Node {
  id: string;
  name: string;
  short: string;
  long: string;
  lat: number;
  lng: number;
  mark: Mark;
}

/** Households grouped by identical point (usually one family's home). */
const groups = computed(() =>
  groupByPoint<Node>(
    located.value.map((h) => ({
      id: h.id,
      name: h.name,
      ...labelNames(h.name),
      lat: h.lat!,
      lng: h.lng!,
      mark: markFor(h.id),
    })),
  ).map((g) => ({
    ...g,
    p: project(g, origin.value),
    shortW: Math.max(...g.items.map((n) => textWidth(n.short))) + 8,
    longW: Math.max(...g.items.map((n) => textWidth(n.long))) + 8,
  })),
);

const groupOf = computed(() => {
  const m = new Map<string, (typeof groups.value)[number]>();
  for (const g of groups.value) for (const n of g.items) m.set(n.id, g);
  return m;
});

/** Where a group is drawn, in world-layer pixels. */
function placeOf(g: (typeof groups.value)[number]): Point {
  return { x: g.p.x * vp.scale, y: g.p.y * vp.scale };
}

// ─── Selection and lines ───────────────────────────────────────────────────

const selectedId = ref<string | null>(null);
const showAll = ref(false);

const conn = computed(() =>
  selectedId.value ? buildConnections(selectedId.value, model.value) : null,
);
const faded = (id: string) => !!conn.value && !conn.value.focus.has(id);

/** Each group's label, if it fits: the selected household first, then its connections. */
const labelsShown = computed(() => {
  const rank = (g: (typeof groups.value)[number]) =>
    g.items.some((n) => n.id === selectedId.value) ? 0 : g.items.some((n) => conn.value?.focus.has(n.id)) ? 1 : 2;
  return fitLabels(
    [...groups.value]
      .sort((a, b) => rank(a) - rank(b))
      .map((g) => ({
        id: g.key,
        ...placeOf(g),
        shortW: g.shortW,
        longW: g.longW,
        force: rank(g) === 0,
      })),
  );
});

const placed = computed(() =>
  groups.value.map((g) => {
    const at = placeOf(g);
    // The selected household comes to the front of its stack; otherwise the first.
    const front = g.items.find((n) => n.id === selectedId.value) ?? g.items[0];
    const sel = front.id === selectedId.value;
    const focus = g.items.some((n) => !faded(n.id));
    return {
      ...g,
      x: at.x,
      y: at.y,
      front,
      behind: g.items.filter((n) => n !== front),
      sel,
      faded: !focus,
      label: labelsShown.value.get(g.key) ?? null,
      z: sel ? 3 : conn.value && focus ? 2 : 1,
    };
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
  const gap = 20;
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

// ─── Non-member homes ──────────────────────────────────────────────────────

const homesDrawn = computed(() =>
  homesToDraw(
    homes.items.map((h) => ({ id: h.id, p: project(h, origin.value) })),
    groups.value.map((g) => g.p),
  ),
);

/** In this mode a tap on empty map adds a home, and a tap on a home removes it. */
const editingHomes = ref(false);

function homeAt(at: Point): string | null {
  const half = SQUARE / 2;
  const hit = homesDrawn.value.find(
    (h) => Math.abs(h.p.x * vp.scale - at.x) <= half && Math.abs(h.p.y * vp.scale - at.y) <= half,
  );
  return hit?.id ?? null;
}

async function editHomeAt(e: MouseEvent) {
  const s = local(e);
  const at = { x: s.x - vp.tx, y: s.y - vp.ty };
  const hit = homeAt(at);
  try {
    if (hit) await homes.remove(hit);
    else await homes.add(unproject({ x: at.x / vp.scale, y: at.y / vp.scale }, origin.value));
  } catch (err) {
    pushError(err);
  }
}

// ─── Locations review (Phase 2) ────────────────────────────────────────────

const locationsOpen = ref(false);

/** Open review items for visible households, plus elders with no home yet. */
const locationsCount = computed(
  () =>
    reviews.open.filter((r) => households.byId.get(r.household_id)?.hidden === false).length +
    elders.visible.filter((e) => !e.home_household_id).length,
);

/** Waiting for a tap: where a household lives, or which household an elder lives in. */
const placing = ref<{ kind: 'household' | 'elder'; id: string; name: string } | null>(null);

function startPlacing(kind: 'household' | 'elder', id: string) {
  const name =
    kind === 'household'
      ? `the ${labelNames(households.byId.get(id)?.name ?? '').short} household`
      : elderName(id);
  editingHomes.value = false;
  placing.value = { kind, id, name };
}

async function placeHouseholdAt(e: MouseEvent) {
  const p = placing.value;
  if (p?.kind !== 'household') return;
  const s = local(e);
  const at = unproject({ x: (s.x - vp.tx) / vp.scale, y: (s.y - vp.ty) / vp.scale }, origin.value);
  placing.value = null;
  try {
    await households.setManualLocation(p.id, at.lat, at.lng);
    for (const r of reviews.open.filter((r) => r.household_id === p.id && r.kind === 'no_location')) {
      await reviews.resolve(r.id, 'placed');
    }
    select(p.id);
  } catch (err) {
    pushError(err);
  }
}

async function setElderHome(householdId: string) {
  const p = placing.value;
  if (p?.kind !== 'elder') return;
  placing.value = null;
  try {
    await elders.update(p.id, { home_household_id: householdId });
    select(householdId);
  } catch (err) {
    pushError(err);
  }
}

/** For a selected household with an open "moved" review: where it was, in world-layer px. */
const movedFrom = computed(() => {
  const id = selectedId.value;
  const r = id ? reviews.open.find((x) => x.household_id === id && x.kind === 'moved') : null;
  const g = id ? groupOf.value.get(id) : null;
  if (!r || !g) return null;
  const from = project((r.data as MovedData).from, origin.value);
  return { x1: from.x * vp.scale, y1: from.y * vp.scale, ...placeOf(g) };
});

// ─── Streets ───────────────────────────────────────────────────────────────

/** Streets in world meters; reprojected only when streets or the origin change. */
const streetsWorld = computed(() =>
  streets.items.map((st) => ({
    name: st.name,
    kind: st.kind,
    pts: st.geometry.coordinates.map(([lng, lat]) => project({ lat, lng }, origin.value)),
  })),
);

const streetPaths = computed(() => {
  const d = { main: '', residential: '', lane: '' };
  const k = vp.scale;
  for (const st of streetsWorld.value) {
    d[st.kind] += st.pts
      .map((p, i) => `${i ? 'L' : 'M'}${(p.x * k).toFixed(1)} ${(p.y * k).toFixed(1)}`)
      .join('');
  }
  return d;
});

const streetLabels = computed(() =>
  placeStreetLabels(
    [...streetsWorld.value]
      .sort((a, b) => (a.kind === 'main' ? 0 : 1) - (b.kind === 'main' ? 0 : 1))
      .map((st) => ({
        name: st.name,
        pts: st.pts.map((p) => ({ x: p.x * vp.scale, y: p.y * vp.scale })),
      })),
    (name) => textWidth(name, STREET_FONT),
  ),
);

const bar = computed(() => scaleBar(vp.scale));

function fit() {
  const b = wardBounds(groups.value.map((g) => g.p));
  if (!b || !size.value.w) return;
  fitTo(b, { width: size.value.w, height: size.value.h }, 80);
}

function zoomBy(factor: number) {
  zoomAt(size.value.w / 2, size.value.h / 2, factor);
}

/**
 * A tap selects the household under it; tapping the same spot again steps to
 * the next household whose square is there too (a shared home, or neighbours
 * drawn on top of each other when zoomed out).
 */
function tapAt(e: MouseEvent, tapped: { key: string; items: { id: string }[] }) {
  if (placing.value?.kind === 'household') return void placeHouseholdAt(e);
  const p = local(e);
  const x = p.x - vp.tx;
  const y = p.y - vp.ty;
  const reach = SQUARE / 2 + 2;
  const under = groups.value.filter((g) => {
    const at = placeOf(g);
    return Math.abs(at.x - x) <= reach && Math.abs(at.y - y) <= reach;
  });
  const ids = (under.some((g) => g.key === tapped.key) ? under : [tapped]).flatMap((g) =>
    g.items.map((n) => n.id),
  );
  const i = ids.indexOf(selectedId.value ?? '');
  const next = i < 0 ? tapped.items[0].id : ids[(i + 1) % ids.length];
  if (placing.value?.kind === 'elder') void setElderHome(next);
  else select(next);
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
  if (placing.value?.kind === 'household') void placeHouseholdAt(e);
  else if (placing.value) return;
  else if (editingHomes.value) void editHomeAt(e);
  else selectedId.value = null;
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
  if (e.key !== 'Escape') return;
  if (placing.value) placing.value = null;
  else selectedId.value = null;
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
    class="relative h-full w-full select-none overflow-clip bg-stone-100"
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
        <g fill="none" stroke-linecap="round" stroke-linejoin="round">
          <path :d="streetPaths.lane" :style="{ stroke: v('stone-200') }" stroke-width="2" stroke-dasharray="2 4" />
          <path :d="streetPaths.residential" :style="{ stroke: v('stone-200') }" stroke-width="5" />
          <path :d="streetPaths.main" :style="{ stroke: v('stone-300') }" stroke-width="9" />
        </g>
        <g :style="{ fill: v(editingHomes ? 'stone-300' : 'stone-200') }">
          <rect
            v-for="h in homesDrawn"
            :key="h.id"
            :x="h.p.x * vp.scale - SQUARE / 2"
            :y="h.p.y * vp.scale - SQUARE / 2"
            :width="SQUARE"
            :height="SQUARE"
            rx="5"
          />
        </g>
        <g
          :style="{ font: STREET_FONT, fill: v('stone-500'), stroke: v('stone-100') }"
          stroke-width="3"
          paint-order="stroke"
          text-anchor="middle"
          dominant-baseline="central"
        >
          <text
            v-for="(l, i) in streetLabels"
            :key="i"
            :transform="`translate(${l.x.toFixed(1)} ${l.y.toFixed(1)}) rotate(${l.angle.toFixed(1)})`"
          >
            {{ l.name }}
          </text>
        </g>
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
        <g v-if="movedFrom" :style="{ stroke: v('stone-600'), fill: v('stone-600') }">
          <line
            :x1="movedFrom.x1"
            :y1="movedFrom.y1"
            :x2="movedFrom.x"
            :y2="movedFrom.y"
            stroke-width="2"
            stroke-dasharray="4 3"
          />
          <circle :cx="movedFrom.x1" :cy="movedFrom.y1" r="4" />
        </g>
      </svg>

      <button
        v-for="g in placed"
        :key="g.key"
        type="button"
        data-household
        class="absolute p-0.5"
        :style="{
          left: `${g.x}px`,
          top: `${g.y}px`,
          transform: 'translate(-50%, -50%)',
          opacity: g.faded ? 0.4 : 1,
          zIndex: g.z,
        }"
        :aria-label="g.items.map((n) => `${n.name} household`).join(', ')"
        @click.stop="tapAt($event, g)"
      >
        <span class="relative block">
          <HouseholdMark
            v-for="(n, i) in g.behind.slice(0, 2)"
            :key="n.id"
            :mark="n.mark"
            :size="SQUARE"
            class="!absolute left-0 top-0"
            :style="{ transform: `translate(${(i + 1) * STACK_OFFSET}px, ${-(i + 1) * STACK_OFFSET}px)`, zIndex: -1 - i }"
          />
          <HouseholdMark :mark="g.front.mark" :size="SQUARE" :selected="g.sel" />
        </span>
        <span
          v-if="g.label"
          class="absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-white/90 px-1 text-[11px] leading-[1.15] text-stone-900"
          :class="g.sel || (conn && !g.faded) ? 'font-semibold' : 'font-medium'"
          :style="g.label.above ? { bottom: `calc(50% + ${LABEL_OFFSET}px)` } : { top: `calc(50% + ${LABEL_OFFSET}px)` }"
        >
          {{ g.label.long ? g.front.long : g.front.short }}
        </span>
      </button>

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

        <button
          type="button"
          class="self-start text-xs text-blue-700 hover:underline"
          @click="startPlacing('household', selectedId!)"
        >
          Adjust location
        </button>
      </div>
    </div>

    <div
      v-if="!located.length"
      class="absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-stone-500"
    >
      No household locations yet. Import them from the directory (Settings → Import locations).
    </div>

    <button
      v-if="unlocatedCount"
      type="button"
      data-no-pan
      class="absolute left-4 top-4 rounded-md bg-white/90 px-2 py-1 text-xs text-stone-600 shadow-sm hover:bg-white"
      @click="locationsOpen = true"
    >
      {{ unlocatedCount }} without a location
    </button>

    <div
      v-if="placing"
      data-no-pan
      class="absolute left-1/2 top-4 z-30 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-stone-900/90 px-3 py-2 text-xs text-stone-50 shadow-lg"
    >
      <span>
        {{ placing.kind === 'household' ? `Tap where ${placing.name} lives` : `Tap ${placing.name}'s home` }}
      </span>
      <button type="button" class="font-semibold underline" @click="placing = null">Cancel</button>
    </div>

    <LocationsPanel
      v-if="locationsOpen"
      @close="locationsOpen = false"
      @focus="focusHousehold"
      @place="(id) => startPlacing('household', id)"
      @pick-home="(id) => startPlacing('elder', id)"
    />

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
      <button
        class="h-10 rounded-full px-3 text-xs transition-colors"
        :class="editingHomes ? 'bg-stone-800 text-white' : 'hover:bg-stone-100'"
        :aria-pressed="editingHomes"
        @click="editingHomes = !editingHomes"
      >
        Edit houses
      </button>
      <button
        class="relative h-10 rounded-full px-3 text-xs transition-colors"
        :class="locationsOpen ? 'bg-stone-800 text-white' : 'hover:bg-stone-100'"
        :aria-pressed="locationsOpen"
        @click="locationsOpen = !locationsOpen"
      >
        Locations
        <span
          v-if="locationsCount"
          class="absolute -right-1 -top-1 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-semibold leading-4 text-white"
        >
          {{ locationsCount }}
        </span>
      </button>
    </div>
  </div>
</template>
