import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth';
import type { Database } from '@/types/database';

export type Label = Database['public']['Tables']['labels']['Row'];

export const useLabelsStore = defineStore('labels', () => {
  const items = ref<Label[]>([]);
  const loaded = ref(false);
  const byId = computed(() => new Map(items.value.map((l) => [l.id, l])));

  async function fetch() {
    const { data, error } = await supabase.from('labels').select('*').order('name');
    if (error) throw error;
    items.value = data ?? [];
    loaded.value = true;
  }

  async function add(name: string, color: string) {
    const auth = useAuthStore();
    if (!auth.wardId) throw new Error('No ward.');
    const { data, error } = await supabase
      .from('labels')
      .insert({ ward_id: auth.wardId, name, color })
      .select()
      .single();
    if (error) throw error;
    items.value.push(data);
    sortItems();
    return data;
  }

  async function update(id: string, patch: Partial<Pick<Label, 'name' | 'color'>>) {
    const { data, error } = await supabase
      .from('labels')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    const idx = items.value.findIndex((l) => l.id === id);
    if (idx >= 0) items.value[idx] = data;
    sortItems();
  }

  async function remove(id: string) {
    const { error } = await supabase.from('labels').delete().eq('id', id);
    if (error) throw error;
    items.value = items.value.filter((l) => l.id !== id);
  }

  function sortItems() {
    items.value.sort((a, b) => a.name.localeCompare(b.name));
  }

  return { items, byId, loaded, fetch, add, update, remove };
});
