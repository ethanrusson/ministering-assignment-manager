import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth';
import type { Database } from '@/types/database';

export type District = Database['public']['Tables']['districts']['Row'];

export const useDistrictsStore = defineStore('districts', () => {
  const items = ref<District[]>([]);
  const loaded = ref(false);
  const byId = computed(() => new Map(items.value.map((d) => [d.id, d])));

  async function fetch() {
    const { data, error } = await supabase
      .from('districts')
      .select('*')
      .order('created_at');
    if (error) throw error;
    items.value = data ?? [];
    loaded.value = true;
  }

  async function add(input: {
    name: string;
    position_x?: number;
    position_y?: number;
    width?: number;
    height?: number;
  }) {
    const auth = useAuthStore();
    if (!auth.wardId) throw new Error('No ward.');
    const { data, error } = await supabase
      .from('districts')
      .insert({ ward_id: auth.wardId, ...input })
      .select()
      .single();
    if (error) throw error;
    items.value.push(data);
    return data;
  }

  async function update(
    id: string,
    patch: Partial<Pick<District, 'name' | 'position_x' | 'position_y' | 'width' | 'height'>>,
  ) {
    const { data, error } = await supabase
      .from('districts')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    const idx = items.value.findIndex((d) => d.id === id);
    if (idx >= 0) items.value[idx] = data;
  }

  async function remove(id: string) {
    const { error } = await supabase.from('districts').delete().eq('id', id);
    if (error) throw error;
    items.value = items.value.filter((d) => d.id !== id);
  }

  return { items, byId, loaded, fetch, add, update, remove };
});
