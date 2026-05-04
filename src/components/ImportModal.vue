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
const importStructure = ref(true);

const stats = computed(() => (diff.value ? summarizeDiff(diff.value) : null));

const willReplaceStructure = computed(
  () => importStructure.value && (districts.items.length > 0 || companionships.items.length > 0),
);

function reset() {
  html.value = '';
  parsed.value = null;
  diff.value = null;
  phase.value = 'paste';
  errorMsg.value = null;
  applyLog.value = [];
  importStructure.value = true;
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
  if (!diff.value || !parsed.value) return;
  phase.value = 'applying';
  applyLog.value = [];
  errorMsg.value = null;
  try {
    // 1) Elder/household upserts
    let added = 0;
    let updated = 0;
    for (const change of diff.value.elders) {
      if (change.kind === 'add') {
        await elders.add(change.parsed.name, change.parsed.age);
        added++;
      } else if (change.kind === 'age-change') {
        await elders.update(change.existing!.id, { age: change.parsed.age });
        updated++;
      }
    }
    applyLog.value.push(`Elders: +${added} added, ${updated} ages updated.`);

    let hAdded = 0;
    for (const change of diff.value.households) {
      if (change.kind === 'add') {
        await households.add(change.parsed.name);
        hAdded++;
      }
    }
    applyLog.value.push(`Households: +${hAdded} added.`);

    // 2) Optional structural import
    if (importStructure.value) {
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
      applyLog.value.push(`Skipped districts and companionships (you opted out).`);
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
        <header class="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 class="text-lg font-semibold">Import from LCR</h2>
          <button class="rounded p-1 hover:bg-slate-100" @click="close">×</button>
        </header>

        <div class="flex-1 overflow-y-auto p-5">
          <!-- Phase: paste -->
          <div v-if="phase === 'paste'" class="space-y-3">
            <p class="text-sm text-slate-600">
              On the LCR ministering page, save the page (Cmd+S → "Webpage, HTML Only") or copy
              the source (Cmd+Option+U then Cmd+A, Cmd+C). Paste the contents below.
            </p>
            <textarea
              v-model="html"
              rows="14"
              spellcheck="false"
              class="w-full rounded border border-slate-300 px-3 py-2 font-mono text-xs"
              placeholder="<!doctype html>…"
            />
            <p v-if="errorMsg" class="text-sm text-danger-600">{{ errorMsg }}</p>
            <div class="flex justify-end gap-2">
              <button
                class="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
                @click="close"
              >
                Cancel
              </button>
              <button
                class="rounded bg-slate-900 px-3 py-1 text-sm text-white disabled:opacity-50"
                :disabled="!html.trim()"
                @click="preview"
              >
                Parse &amp; Preview
              </button>
            </div>
          </div>

          <!-- Phase: preview -->
          <div v-else-if="phase === 'preview' && diff && stats && parsed" class="space-y-4">
            <div
              class="grid grid-cols-2 gap-3 rounded border border-slate-200 bg-slate-50 p-3 text-sm"
            >
              <div>
                <div class="font-semibold">Found in import</div>
                <ul class="text-slate-700">
                  <li>{{ parsed.districts.length }} districts</li>
                  <li>{{ parsed.companionships.length }} companionships</li>
                  <li>{{ parsed.elders.length }} elders</li>
                  <li>{{ parsed.households.length }} households</li>
                </ul>
              </div>
              <div>
                <div class="font-semibold">Will apply</div>
                <ul class="text-slate-700">
                  <li>+{{ stats.eldersAdded }} new elders</li>
                  <li>{{ stats.eldersAgeChanged }} elder ages updated</li>
                  <li>+{{ stats.householdsAdded }} new households</li>
                  <li class="text-slate-500">
                    {{ stats.eldersUnchanged }} elders + {{ stats.householdsUnchanged }} households
                    already match (no change)
                  </li>
                </ul>
              </div>
            </div>

            <details v-if="diff.elders.some((e) => e.kind === 'add')" class="rounded border border-slate-200">
              <summary class="cursor-pointer px-3 py-2 text-sm font-medium">
                New elders ({{ stats.eldersAdded }})
              </summary>
              <ul class="max-h-40 space-y-1 overflow-y-auto px-3 py-2 text-xs">
                <li
                  v-for="(c, i) in diff.elders.filter((e) => e.kind === 'add')"
                  :key="i"
                  class="flex justify-between"
                >
                  <span>{{ c.parsed.name }}</span>
                  <span class="text-slate-500">{{ c.parsed.age ?? '—' }}</span>
                </li>
              </ul>
            </details>

            <details v-if="stats.eldersAgeChanged" class="rounded border border-slate-200">
              <summary class="cursor-pointer px-3 py-2 text-sm font-medium">
                Age changes ({{ stats.eldersAgeChanged }})
              </summary>
              <ul class="max-h-40 space-y-1 overflow-y-auto px-3 py-2 text-xs">
                <li
                  v-for="(c, i) in diff.elders.filter((e) => e.kind === 'age-change')"
                  :key="i"
                  class="flex justify-between"
                >
                  <span>{{ c.parsed.name }}</span>
                  <span class="text-slate-500">{{ c.prevAge ?? '—' }} → {{ c.parsed.age ?? '—' }}</span>
                </li>
              </ul>
            </details>

            <details v-if="diff.households.some((h) => h.kind === 'add')" class="rounded border border-slate-200">
              <summary class="cursor-pointer px-3 py-2 text-sm font-medium">
                New households ({{ stats.householdsAdded }})
              </summary>
              <ul class="max-h-40 space-y-1 overflow-y-auto px-3 py-2 text-xs">
                <li v-for="(c, i) in diff.households.filter((h) => h.kind === 'add')" :key="i">
                  {{ c.parsed.name }}
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
              <div class="px-3 py-2 text-xs text-slate-700">
                <p class="mb-2 text-slate-600">
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

            <div class="rounded border border-slate-200 p-3">
              <label class="flex items-start gap-2 text-sm">
                <input v-model="importStructure" type="checkbox" class="mt-0.5" />
                <span>
                  <span class="font-medium">Also import districts and companionships</span>
                  <span class="block text-xs text-slate-500">
                    Lays out
                    {{ parsed.districts.length }} districts and
                    {{ parsed.companionships.length }} companionships at default positions.
                  </span>
                </span>
              </label>
              <p
                v-if="willReplaceStructure"
                class="mt-2 rounded border border-warn-200 bg-warn-50 px-2 py-1 text-xs text-warn-600"
              >
                ⚠️ This will replace your existing
                {{ districts.items.length }} districts and
                {{ companionships.items.length }} companionships. Save a snapshot first if you
                want to keep the current layout.
              </p>
            </div>

            <p v-if="errorMsg" class="text-sm text-danger-600">{{ errorMsg }}</p>

            <div class="flex justify-end gap-2">
              <button
                class="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
                @click="phase = 'paste'"
              >
                Back
              </button>
              <button
                class="rounded bg-slate-900 px-3 py-1 text-sm text-white"
                @click="apply"
              >
                Apply
              </button>
            </div>
          </div>

          <!-- Phase: applying -->
          <div v-else-if="phase === 'applying'" class="space-y-2 py-12 text-center">
            <p class="text-sm text-slate-600">Writing changes…</p>
          </div>

          <!-- Phase: done -->
          <div v-else-if="phase === 'done'" class="space-y-3">
            <p class="text-sm font-medium text-slate-700">Import complete.</p>
            <ul class="space-y-1 rounded border border-slate-200 bg-slate-50 p-3 text-sm">
              <li v-for="(line, i) in applyLog" :key="i">{{ line }}</li>
            </ul>
            <div class="flex justify-end">
              <button class="rounded bg-slate-900 px-3 py-1 text-sm text-white" @click="close">
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
