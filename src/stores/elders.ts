import { defineStore } from 'pinia';
import { computed, onScopeDispose, ref } from 'vue';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth';
import { subscribeToTable } from '@/lib/realtime';
import type { Database } from '@/types/database';

export type Elder = Database['public']['Tables']['elders']['Row'];

export const useEldersStore = defineStore('elders', () => {
  const items = ref<Elder[]>([]);
  const loaded = ref(false);
  let channel: RealtimeChannel | null = null;

  const visible = computed(() => items.value.filter((e) => !e.hidden));
  const byId = computed(() => new Map(items.value.map((e) => [e.id, e])));

  async function fetch() {
    const { data, error } = await supabase
      .from('elders')
      .select('*')
      .order('name', { ascending: true });
    if (error) throw error;
    items.value = data ?? [];
    loaded.value = true;

    const auth = useAuthStore();
    if (auth.wardId) {
      channel?.unsubscribe();
      channel = subscribeToTable('elders', auth.wardId, items, {
        onInsert: () => sortItems(),
      });
    }
  }

  onScopeDispose(() => { channel?.unsubscribe(); });

  async function add(name: string, age: number | null) {
    const auth = useAuthStore();
    if (!auth.wardId) throw new Error('No ward.');
    const { data, error } = await supabase
      .from('elders')
      .insert({ ward_id: auth.wardId, name, age })
      .select()
      .single();
    if (error) throw error;
    items.value.push(data);
    sortItems();
    return data;
  }

  async function update(id: string, patch: Partial<Pick<Elder, 'name' | 'age' | 'hidden'>>) {
    const { data, error } = await supabase
      .from('elders')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    const idx = items.value.findIndex((e) => e.id === id);
    if (idx >= 0) items.value[idx] = data;
    sortItems();
  }

  async function remove(id: string) {
    const { error } = await supabase.from('elders').delete().eq('id', id);
    if (error) throw error;
    items.value = items.value.filter((e) => e.id !== id);
  }

  function sortItems() {
    items.value.sort((a, b) => a.name.localeCompare(b.name));
  }

  return { items, visible, byId, loaded, fetch, add, update, remove };
});
