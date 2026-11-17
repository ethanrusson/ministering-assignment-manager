<script setup lang="ts">
// The Districts editor controls (docs/ward-map-prd.md, Phase 6): pick a
// district, then tap houses, drag a box over houses, or draw its shape; see
// each district's homes and slots, and what saving changes.

export interface PanelDistrict {
  id: string | null;
  label: string;
  name: string;
  family: string | null;
}
export type DistrictTool = 'tap' | 'box' | 'shape';

export interface PanelCapacity {
  id: string;
  homes: number;
  comps: number;
  slots: number;
}

export interface PanelChange {
  id: string;
  name: string;
  from: string;
  to: string;
  flag: 'creates' | 'clears' | null;
}

const props = defineProps<{
  districts: PanelDistrict[];
  picked: string | null;
  tool: DistrictTool;
  capacity: PanelCapacity[];
  changes: PanelChange[];
  writes: number;
  initialized: boolean;
  shapesChanged: boolean;
  saving: boolean;
}>();
const emit = defineEmits<{
  (e: 'pick', id: string | null): void;
  (e: 'update:tool', v: DistrictTool): void;
  (e: 'rename', id: string, name: string): void;
  (e: 'cancel'): void;
  (e: 'redraw'): void;
  (e: 'save'): void;
}>();

const v = (name: string) => `rgb(var(--c-${name}))`;

function rename(d: PanelDistrict, ev: Event) {
  const input = ev.target as HTMLInputElement;
  const name = input.value.trim();
  if (d.id && name && name !== d.name) emit('rename', d.id, name);
  else input.value = d.name;
}
const TOOLS: { value: DistrictTool; label: string }[] = [
  { value: 'tap', label: 'Tap' },
  { value: 'box', label: 'Box' },
  { value: 'shape', label: 'Shape' },
];

const capacityOf = (id: string | null) => props.capacity.find((c) => c.id === id);
</script>

<template>
  <div
    data-no-pan
    class="absolute left-1/2 top-4 z-30 flex max-w-[calc(100%-2rem)] -translate-x-1/2 flex-wrap items-center gap-1.5 rounded-lg bg-stone-900/90 px-3 py-2 text-xs text-stone-50 shadow-lg"
  >
    <span class="mr-1 font-semibold">Districts</span>
    <button
      v-for="d in districts"
      :key="d.id ?? 'none'"
      type="button"
      class="rounded-full border-2 px-2 py-0.5 font-semibold"
      :style="{
        backgroundColor: v(d.family ? `${d.family}-100` : 'white'),
        color: v(d.family ? `${d.family}-700` : 'stone-700'),
        borderColor: picked === d.id ? v('stone-50') : 'transparent',
      }"
      :aria-pressed="picked === d.id"
      @click="emit('pick', d.id)"
    >
      {{ d.label }}
    </button>
    <span class="ml-1 flex rounded border border-stone-500 p-px" role="group" aria-label="Tool">
      <button
        v-for="t in TOOLS"
        :key="t.value"
        type="button"
        class="rounded-sm px-2 py-0.5"
        :class="tool === t.value ? 'bg-stone-50 text-stone-900' : 'hover:bg-stone-700'"
        :aria-pressed="tool === t.value"
        @click="emit('update:tool', t.value)"
      >
        {{ t.label }}
      </button>
    </span>
    <button type="button" class="underline" @click="emit('redraw')">Redraw lines</button>
    <button type="button" class="underline" @click="emit('cancel')">Cancel</button>
    <button
      type="button"
      class="rounded bg-blue-600 px-2 py-0.5 font-semibold disabled:opacity-50"
      :disabled="(!writes && !shapesChanged) || saving"
      @click="emit('save')"
    >
      Save{{ writes ? ` (${writes})` : '' }}
    </button>
  </div>

  <div
    data-no-pan
    class="absolute bottom-24 right-4 top-20 z-20 flex w-72 cursor-default flex-col rounded-xl border border-stone-200 bg-white text-sm shadow-xl"
  >
    <div class="space-y-3 overflow-y-auto p-3">
      <section>
        <table class="w-full table-fixed text-xs">
          <thead class="text-stone-500">
            <tr>
              <th class="text-left text-[11px] font-semibold uppercase tracking-wide">Districts</th>
              <th class="w-11 text-right font-normal">Homes</th>
              <th class="w-11 text-right font-normal">Comps</th>
              <th class="w-9 text-right font-normal">Slots</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in districts.filter((x) => x.id)" :key="d.id!">
              <td class="py-0.5">
                <div class="flex items-center gap-1.5">
                  <span
                    class="rounded-full px-2 py-px text-[11px] font-semibold"
                    :style="{ backgroundColor: v(`${d.family}-100`), color: v(`${d.family}-700`) }"
                  >
                    {{ d.label.split(' · ')[0] }}
                  </span>
                  <input
                    :value="d.name"
                    class="w-0 min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-stone-200 focus:border-stone-400 focus:outline-none"
                    :aria-label="`${d.label} name`"
                    @change="rename(d, $event)"
                    @keydown.enter="($event.target as HTMLInputElement).blur()"
                  />
                </div>
              </td>
              <td
                class="text-right tabular-nums"
                :class="(capacityOf(d.id)?.homes ?? 0) > (capacityOf(d.id)?.slots ?? 0) && 'font-semibold text-red-700'"
              >
                {{ capacityOf(d.id)?.homes ?? 0 }}
              </td>
              <td class="text-right tabular-nums">{{ capacityOf(d.id)?.comps ?? 0 }}</td>
              <td class="text-right tabular-nums">{{ capacityOf(d.id)?.slots ?? 0 }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h3 class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
          If you save
        </h3>
        <p v-if="!initialized" class="mb-1 text-xs text-stone-600">
          Every household starts in its companionship's district.
        </p>
        <p v-if="!changes.length" class="text-xs text-stone-500">No changes yet.</p>
        <ul class="space-y-1">
          <li v-for="c in changes" :key="c.id" class="text-xs">
            <div class="font-medium text-stone-900">{{ c.name }}</div>
            <div class="text-stone-500">
              {{ c.from }} → {{ c.to }}
              <span v-if="c.flag === 'creates'" class="font-semibold text-amber-700">
                · now ministered from another district
              </span>
              <span v-else-if="c.flag === 'clears'" class="font-semibold text-emerald-700">
                · no longer ministered from another district
              </span>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
