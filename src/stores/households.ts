import { defineStore } from 'pinia';
import { computed, onScopeDispose, ref } from 'vue';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth';
import { subscribeToTable, subscribeToJoinTable } from '@/lib/realtime';
import type { Database } from '@/types/database';

export type Household = Database['public']['Tables']['households']['Row'];

interface HouseholdLabel {
  household_id: string;
  label_id: string;
}

export const useHouseholdsStore = defineStore('households', () => {
  const items = ref<Household[]>([]);
  const labelLinks = ref<HouseholdLabel[]>([]);
  const loaded = ref(false);
  let channelHouseholds: RealtimeChannel | null = null;
  let channelLabels: RealtimeChannel | null = null;

  const visible = computed(() => items.value.filter((h) => !h.hidden));
  const byId = computed(() => new Map(items.value.map((h) => [h.id, h])));
  const labelsForHousehold = computed(() => {
    const map = new Map<string, string[]>();
    for (const link of labelLinks.value) {
      const arr = map.get(link.household_id) ?? [];
      arr.push(link.label_id);
      map.set(link.household_id, arr);
    }
    return map;
  });

  async function fetch() {
    const [{ data: hh, error: e1 }, { data: hl, error: e2 }] = await Promise.all([
      supabase.from('households').select('*').order('name'),
      supabase.from('household_labels').select('*'),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    items.value = hh ?? [];
    labelLinks.value = hl ?? [];
    loaded.value = true;

    const auth = useAuthStore();
    if (auth.wardId) {
      channelHouseholds?.unsubscribe();
      channelLabels?.unsubscribe();

      channelHouseholds = subscribeToTable('households', auth.wardId, items, {
        onInsert: () => sortItems(),
      });

      // household_labels has no ward_id column — use join table helper
      channelLabels = subscribeToJoinTable('household_labels', auth.wardId, (payload) => {
        if (payload.eventType === 'INSERT') {
          const row = payload.new as unknown as HouseholdLabel;
          if (!labelLinks.value.some(
            (l) => l.household_id === row.household_id && l.label_id === row.label_id,
          )) {
            labelLinks.value.push(row);
          }
        } else if (payload.eventType === 'DELETE') {
          const old = payload.old as unknown as Partial<HouseholdLabel>;
          labelLinks.value = labelLinks.value.filter(
            (l) => !(l.household_id === old.household_id && l.label_id === old.label_id),
          );
        }
      });
    }
  }

  onScopeDispose(() => {
    channelHouseholds?.unsubscribe();
    channelLabels?.unsubscribe();
  });

  async function add(name: string) {
    const auth = useAuthStore();
    if (!auth.wardId) throw new Error('No ward.');
    const { data, error } = await supabase
      .from('households')
      .insert({ ward_id: auth.wardId, name })
      .select()
      .single();
    if (error) throw error;
    items.value.push(data);
    sortItems();
    return data;
  }

  async function update(id: string, patch: Partial<Pick<Household, 'name' | 'hidden'>>) {
    const { data, error } = await supabase
      .from('households')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    const idx = items.value.findIndex((h) => h.id === id);
    if (idx >= 0) items.value[idx] = data;
    sortItems();
  }

  async function remove(id: string) {
    const { error } = await supabase.from('households').delete().eq('id', id);
    if (error) throw error;
    items.value = items.value.filter((h) => h.id !== id);
    labelLinks.value = labelLinks.value.filter((l) => l.household_id !== id);
  }

  async function setLabels(householdId: string, labelIds: string[]) {
    const current = labelLinks.value.filter((l) => l.household_id === householdId);
    const currentIds = new Set(current.map((l) => l.label_id));
    const nextIds = new Set(labelIds);

    const toRemove = [...currentIds].filter((id) => !nextIds.has(id));
    const toAdd = [...nextIds].filter((id) => !currentIds.has(id));

    if (toRemove.length) {
      const { error } = await supabase
        .from('household_labels')
        .delete()
        .eq('household_id', householdId)
        .in('label_id', toRemove);
      if (error) throw error;
    }
    if (toAdd.length) {
      const { error } = await supabase
        .from('household_labels')
        .insert(toAdd.map((label_id) => ({ household_id: householdId, label_id })));
      if (error) throw error;
    }

    labelLinks.value = labelLinks.value.filter(
      (l) => !(l.household_id === householdId && toRemove.includes(l.label_id)),
    );
    for (const label_id of toAdd) {
      labelLinks.value.push({ household_id: householdId, label_id });
    }
  }

  function sortItems() {
    items.value.sort((a, b) => a.name.localeCompare(b.name));
  }

  return {
    items,
    labelLinks,
    visible,
    byId,
    labelsForHousehold,
    loaded,
    fetch,
    add,
    update,
    remove,
    setLabels,
  };
});
