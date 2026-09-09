<script setup lang="ts">
import { computed, ref } from 'vue';
import { LcrHtmlParserV1, type ParseResult } from '@/lib/lcr/parser';
import {
  diffImport,
  summarizeDiff,
  type DiffResult,
  type ExistingElder,
  type ExistingHousehold,
} from '@/lib/lcr/diff';
import { applyStructure } from '@/lib/lcr/applyStructure';
import {
  isPlanEmpty,
  modeUnavailableReason,
  planImport,
  type ImportMode,
} from '@/lib/lcr/plan';
import { useEldersStore } from '@/stores/elders';
import { useHouseholdsStore } from '@/stores/households';
import { useDistrictsStore } from '@/stores/districts';
import { useCompanionshipsStore } from '@/stores/companionships';
import { useAuthStore } from '@/stores/auth';

defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const auth = useAuthStore();
const elders = useEldersStore();
const households = useHouseholdsStore();
const districts = useDistrictsStore();
const companionships = useCompanionshipsStore();

const html = ref('');
const parsed = ref<ParseResult | null>(null);
const diff = ref<DiffResult | null>(null);
const phase = ref<'paste' | 'preview' | 'applying' | 'done'>('paste');
const errorMsg = ref<string | null>(null);
const applyLog = ref<string[]>([]);
const mode = ref<ImportMode>('full');

const stats = computed(() => (diff.value ? summarizeDiff(diff.value) : null));

const unassignedFound = computed(() => ({
  elders: parsed.value?.elders.filter((e) => e.unassigned).length ?? 0,
  households: parsed.value?.households.filter((h) => h.unassigned).length ?? 0,
}));

/** The exact set of writes the selected mode will make. Drives preview + apply. */
const plan = computed(() => (diff.value ? planImport(diff.value, mode.value) : null));

/** New people the import will create who have no companionship in LCR. */
const newUnassigned = computed(() => ({
  elders: plan.value?.eldersToAdd.filter((e) => e.unassigned) ?? [],
  households: plan.value?.householdsToAdd.filter((h) => h.unassigned) ?? [],
}));

const notGenerallyAssignedCount = computed(
  () => parsed.value?.elders.filter((e) => e.notGenerallyAssigned).length ?? 0,
);

const modeBlocked = computed(() =>
  parsed.value ? modeUnavailableReason(mode.value, parsed.value) : null,
);

const nothingToDo = computed(() => (plan.value ? isPlanEmpty(plan.value) : true));

const willReplaceStructure = computed(
  () =>
    mode.value === 'full' && (districts.items.length > 0 || companionships.items.length > 0),
);

const totalSkipped = computed(() => {
  const s = plan.value?.skipped;
  return s ? s.assignedElders + s.assignedHouseholds + s.ageUpdates : 0;
});

function reset() {
  html.value = '';
  parsed.value = null;
  diff.value = null;
  phase.value = 'paste';
  errorMsg.value = null;
  applyLog.value = [];
  mode.value = 'full';
}

function close() {
  reset();
  emit('close');
}

function preview() {
  errorMsg.value = null;
  try {
    const result = new LcrHtmlParserV1().parse(html.value);
    parsed.value = result;
    const existing: { elders: ExistingElder[]; households: ExistingHousehold[] } = {
      elders: elders.items.map((e) => ({
        id: e.id,
        name: e.name,
        age: e.age,
        hidden: e.hidden,
      })),
      households: households.items.map((h) => ({
        id: h.id,
        name: h.name,
        hidden: h.hidden,
      })),
    };
    diff.value = diffImport(result, existing);
    phase.value = 'preview';
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : 'Failed to parse.';
  }
}

async function apply() {
  if (!plan.value || !parsed.value) return;
  const p = plan.value;
  phase.value = 'applying';
  applyLog.value = [];
  errorMsg.value = null;
  try {
    // 1) People. The plan already filtered these down to the chosen mode.
    for (const e of p.eldersToAdd) await elders.add(e.name, e.age);
    for (const u of p.elderAgeUpdates) await elders.update(u.id, { age: u.age });
    applyLog.value.push(
      `Elders: +${p.eldersToAdd.length} added, ${p.elderAgeUpdates.length} ages updated.`,
    );

    for (const h of p.householdsToAdd) await households.add(h.name);
    applyLog.value.push(`Households: +${p.householdsToAdd.length} added.`);

    const unassignedAdded =
      newUnassigned.value.elders.length + newUnassigned.value.households.length;
    if (unassignedAdded) {
      applyLog.value.push(`${unassignedAdded} of those had no companionship in LCR.`);
    }

    // 2) Board structure — only 'full' touches it.
    if (p.replaceStructure) {
      if (!auth.wardId) throw new Error('No ward.');
      const result = await applyStructure({
        parsed: parsed.value,
        existing: {
          wardId: auth.wardId,
          districts: districts.items.map((d) => ({ id: d.id, name: d.name })),
          companionships: companionships.items.map((c) => ({ id: c.id })),
          elders: elders.items.map((e) => ({ id: e.id, name: e.name })),
          households: households.items.map((h) => ({ id: h.id, name: h.name })),
        },
      });
      // Refresh structure stores so the canvas picks up the new rows
      await Promise.all([districts.fetch(), companionships.fetch()]);
      for (const note of result.notes) applyLog.value.push(note);
      applyLog.value.push(
        `Created ${result.districtsCreated} districts and ${result.companionshipsCreated} companionships.`,
      );
      applyLog.value.push(
        `Linked ${result.elderLinksCreated} elders and ${result.householdLinksCreated} households to companionships.`,
      );
    } else {
      applyLog.value.push('Left your districts and companionships untouched.');
    }

    if (totalSkipped.value) {
      applyLog.value.push(
        `Skipped ${totalSkipped.value} change(s) outside this mode (people already assigned in LCR, and age updates).`,
      );
    }

    phase.value = 'done';
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : 'Apply failed.';
    phase.value = 'preview';
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="close"
    >
      <div class="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-lg bg-white shadow-xl">
        <header class="flex items-center justify-between border-b border-stone-200 px-5 py-3">
          <h2 class="text-lg font-semibold">Import from LCR</h2>
          <button class="rounded p-1 hover:bg-stone-100" @click="close">×</button>
        </header>

        <div class="flex-1 overflow-y-auto p-5">
          <!-- Phase: paste -->
          <div v-if="phase === 'paste'" class="space-y-3">
            <p class="text-sm text-stone-600">
              On the LCR ministering page, save the page (Cmd+S → "Webpage, HTML Only") or copy
              the source (Cmd+Option+U then Cmd+A, Cmd+C). Paste the contents below.
            </p>
            <p class="text-xs text-stone-500">
              Tip: use the <span class="font-medium">Unassigned</span> tab. That page carries the
              full eligible roster, so elders and households with no companionship come across too.
            </p>
            <textarea
              v-model="html"
              rows="14"
              spellcheck="false"
              class="w-full rounded border border-stone-300 px-3 py-2 font-mono text-xs"
              placeholder="<!doctype html>…"
            />
            <p v-if="errorMsg" class="text-sm text-danger-600">{{ errorMsg }}</p>
            <div class="flex justify-end gap-2">
              <button
                class="rounded border border-stone-300 px-3 py-1 text-sm hover:bg-stone-50"
                @click="close"
              >
                Cancel
              </button>
              <button
                class="rounded bg-stone-900 px-3 py-1 text-sm text-white disabled:opacity-50"
                :disabled="!html.trim()"
                @click="preview"
              >
                Parse &amp; Preview
              </button>
            </div>
          </div>

          <!-- Phase: preview -->
          <div v-else-if="phase === 'preview' && diff && stats && parsed && plan" class="space-y-4">
            <div
              class="grid grid-cols-2 gap-3 rounded border border-stone-200 bg-stone-50 p-3 text-sm"
            >
              <div>
                <div class="font-semibold">Found in import</div>
                <ul class="text-stone-700">
                  <li>{{ parsed.districts.length }} districts</li>
                  <li>{{ parsed.companionships.length }} companionships</li>
                  <li>
                    {{ parsed.elders.length }} elders
                    <span class="text-stone-500">({{ unassignedFound.elders }} unassigned)</span>
                  </li>
                  <li>
                    {{ parsed.households.length }} households
                    <span class="text-stone-500">
                      ({{ unassignedFound.households }} unassigned)
                    </span>
                  </li>
                </ul>
              </div>
              <div>
                <div class="font-semibold">Will apply</div>
                <ul class="text-stone-700">
                  <li>+{{ plan.eldersToAdd.length }} new elders</li>
                  <li>+{{ plan.householdsToAdd.length }} new households</li>
                  <li>{{ plan.elderAgeUpdates.length }} elder ages updated</li>
                  <li :class="plan.replaceStructure ? 'font-medium text-warn-600' : 'text-stone-700'">
                    {{
                      plan.replaceStructure
                        ? 'Districts + companionships rebuilt'
                        : 'Board left untouched'
                    }}
                  </li>
                  <li class="text-stone-500">
                    {{ stats.eldersUnchanged }} elders + {{ stats.householdsUnchanged }} households
                    already match (no change)
                  </li>
                </ul>
              </div>
            </div>

            <div
              v-if="parsed.warnings.length"
              class="rounded border border-warn-200 bg-warn-50 px-3 py-2 text-xs text-warn-600"
            >
              <p v-for="(w, i) in parsed.warnings" :key="i">⚠️ {{ w }}</p>
            </div>

            <details
              v-if="
                mode !== 'unassigned' &&
                newUnassigned.elders.length + newUnassigned.households.length > 0
              "
              class="rounded border border-stone-200"
            >
              <summary class="cursor-pointer px-3 py-2 text-sm font-medium">
                New unassigned people ({{
                  newUnassigned.elders.length + newUnassigned.households.length
                }})
              </summary>
              <div class="px-3 py-2 text-xs text-stone-700">
                <p class="mb-2 text-stone-600">
                  These have no companionship in LCR. They'll land in the Unassigned lists in the
                  sidebar, ready to place on the canvas.
                </p>
                <ul class="max-h-40 space-y-1 overflow-y-auto">
                  <li
                    v-for="e in newUnassigned.elders"
                    :key="'ue-' + e.legacyId"
                    class="flex justify-between"
                  >
                    <span>
                      {{ e.name }} <span class="text-stone-500">(elder)</span>
                      <span v-if="e.notGenerallyAssigned" class="text-stone-400">
                        · not generally assigned
                      </span>
                    </span>
                    <span class="text-stone-500">{{ e.age ?? '—' }}</span>
                  </li>
                  <li v-for="h in newUnassigned.households" :key="'uh-' + h.legacyId">
                    {{ h.name }} <span class="text-stone-500">(household)</span>
                  </li>
                </ul>
                <p v-if="notGenerallyAssignedCount" class="mt-2 text-stone-500">
                  {{ notGenerallyAssignedCount }} elder(s) in this import are flagged by LCR as
                  “not generally assigned” (bishopric, stake callings, missionaries). They're
                  imported so you can see them; hide any you don't want on the board.
                </p>
              </div>
            </details>

            <details v-if="plan.eldersToAdd.length" class="rounded border border-stone-200">
              <summary class="cursor-pointer px-3 py-2 text-sm font-medium">
                New elders ({{ plan.eldersToAdd.length }})
              </summary>
              <ul class="max-h-40 space-y-1 overflow-y-auto px-3 py-2 text-xs">
                <li
                  v-for="e in plan.eldersToAdd"
                  :key="e.legacyId"
                  class="flex justify-between"
                >
                  <span>
                    {{ e.name }}
                    <span v-if="e.unassigned" class="text-stone-400">· unassigned</span>
                  </span>
                  <span class="text-stone-500">{{ e.age ?? '—' }}</span>
                </li>
              </ul>
            </details>

            <details v-if="plan.elderAgeUpdates.length" class="rounded border border-stone-200">
              <summary class="cursor-pointer px-3 py-2 text-sm font-medium">
                Age changes ({{ plan.elderAgeUpdates.length }})
              </summary>
              <ul class="max-h-40 space-y-1 overflow-y-auto px-3 py-2 text-xs">
                <li v-for="u in plan.elderAgeUpdates" :key="u.id" class="flex justify-between">
                  <span>{{ u.name }}</span>
                  <span class="text-stone-500">{{ u.prevAge ?? '—' }} → {{ u.age ?? '—' }}</span>
                </li>
              </ul>
            </details>

            <details v-if="plan.householdsToAdd.length" class="rounded border border-stone-200">
              <summary class="cursor-pointer px-3 py-2 text-sm font-medium">
                New households ({{ plan.householdsToAdd.length }})
              </summary>
              <ul class="max-h-40 space-y-1 overflow-y-auto px-3 py-2 text-xs">
                <li v-for="h in plan.householdsToAdd" :key="h.legacyId">
                  {{ h.name }}
                  <span v-if="h.unassigned" class="text-stone-400">· unassigned</span>
                </li>
              </ul>
            </details>

            <details
              v-if="stats.orphanElders + stats.orphanHouseholds > 0"
              class="rounded border border-warn-200 bg-warn-50"
            >
              <summary class="cursor-pointer px-3 py-2 text-sm font-medium text-warn-600">
                Present locally but not in import ({{
                  stats.orphanElders + stats.orphanHouseholds
                }})
              </summary>
              <div class="px-3 py-2 text-xs text-stone-700">
                <p class="mb-2 text-stone-600">
                  These won't be deleted. Hide or remove them manually if they're stale.
                </p>
                <ul class="space-y-0.5">
                  <li v-for="e in diff.orphans.elders" :key="'e-' + e.id">⤺ {{ e.name }} (elder)</li>
                  <li v-for="h in diff.orphans.households" :key="'h-' + h.id">
                    ⤺ {{ h.name }} (household)
                  </li>
                </ul>
              </div>
            </details>

            <fieldset class="rounded border border-stone-200 p-3">
              <legend class="px-1 text-sm font-medium">What should this import do?</legend>

              <label class="flex items-start gap-2 py-1 text-sm">
                <input v-model="mode" type="radio" value="full" class="mt-1" />
                <span>
                  <span class="font-medium">Full import — replace the board</span>
                  <span class="block text-xs text-stone-500">
                    Adds people, then rebuilds
                    {{ parsed.districts.length }} districts and
                    {{ parsed.companionships.length }} companionships from LCR at default
                    positions.
                  </span>
                </span>
              </label>

              <label class="flex items-start gap-2 py-1 text-sm">
                <input v-model="mode" type="radio" value="people" class="mt-1" />
                <span>
                  <span class="font-medium">People only — keep my board</span>
                  <span class="block text-xs text-stone-500">
                    Adds every new elder and household and updates ages. Your districts,
                    companionships, and card positions are left exactly as they are.
                  </span>
                </span>
              </label>

              <label class="flex items-start gap-2 py-1 text-sm">
                <input v-model="mode" type="radio" value="unassigned" class="mt-1" />
                <span>
                  <span class="font-medium">Unassigned only — keep my board</span>
                  <span class="block text-xs text-stone-500">
                    Adds only the
                    {{ unassignedFound.elders }} elders and
                    {{ unassignedFound.households }} households that LCR shows with no
                    companionship. Nothing else is created, updated, or removed.
                  </span>
                </span>
              </label>

              <p
                v-if="modeBlocked"
                class="mt-2 rounded border border-warn-200 bg-warn-50 px-2 py-1 text-xs text-warn-600"
              >
                ⚠️ {{ modeBlocked }}
              </p>

              <p
                v-else-if="willReplaceStructure"
                class="mt-2 rounded border border-warn-200 bg-warn-50 px-2 py-1 text-xs text-warn-600"
              >
                ⚠️ This will replace your existing
                {{ districts.items.length }} districts and
                {{ companionships.items.length }} companionships. Save a snapshot first if you
                want to keep the current layout.
              </p>

              <p
                v-else-if="totalSkipped"
                class="mt-2 rounded border border-stone-200 bg-stone-50 px-2 py-1 text-xs text-stone-600"
              >
                This mode leaves out {{ plan.skipped.assignedElders }} new elders and
                {{ plan.skipped.assignedHouseholds }} new households that already have a
                companionship in LCR, plus {{ plan.skipped.ageUpdates }} age update(s). Choose
                “People only” to bring those across without touching your board.
              </p>

              <p
                v-else-if="nothingToDo"
                class="mt-2 rounded border border-stone-200 bg-stone-50 px-2 py-1 text-xs text-stone-600"
              >
                Nothing to do — everything in this import already matches what you have.
              </p>
            </fieldset>

            <p v-if="errorMsg" class="text-sm text-danger-600">{{ errorMsg }}</p>

            <div class="flex justify-end gap-2">
              <button
                class="rounded border border-stone-300 px-3 py-1 text-sm hover:bg-stone-50"
                @click="phase = 'paste'"
              >
                Back
              </button>
              <button
                class="rounded bg-stone-900 px-3 py-1 text-sm text-white disabled:opacity-50"
                :disabled="!!modeBlocked || nothingToDo"
                @click="apply"
              >
                Apply
              </button>
            </div>
          </div>

          <!-- Phase: applying -->
          <div v-else-if="phase === 'applying'" class="space-y-2 py-12 text-center">
            <p class="text-sm text-stone-600">Writing changes…</p>
          </div>

          <!-- Phase: done -->
          <div v-else-if="phase === 'done'" class="space-y-3">
            <p class="text-sm font-medium text-stone-700">Import complete.</p>
            <ul class="space-y-1 rounded border border-stone-200 bg-stone-50 p-3 text-sm">
              <li v-for="(line, i) in applyLog" :key="i">{{ line }}</li>
            </ul>
            <div class="flex justify-end">
              <button class="rounded bg-stone-900 px-3 py-1 text-sm text-white" @click="close">
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
