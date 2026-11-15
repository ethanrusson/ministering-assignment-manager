import { defineStore } from 'pinia';
import { onScopeDispose, ref } from 'vue';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth';
import { subscribeToTable } from '@/lib/realtime';
import type { Database } from '@/types/database';
import type { LatLng } from '@/map/geo';

export type Home = Database['public']['Tables']['homes']['Row'];

export const useHomesStore = defineStore('homes', () => {
  const items = ref<Home[]>([]);
  let channel: RealtimeChannel | null = null;

  async function fetch() {
    const { data, error } = await supabase.from('homes').select('*');
    if (error) throw error;
    items.value = data ?? [];

    const auth = useAuthStore();
    if (auth.wardId) {
      channel?.unsubscribe();
      channel = subscribeToTable('homes', auth.wardId, items);
    }
  }

  onScopeDispose(() => {
    channel?.unsubscribe();
  });

  async function add(p: LatLng) {
    const auth = useAuthStore();
    if (!auth.wardId) throw new Error('No ward.');
    const { data, error } = await supabase
      .from('homes')
      .insert({ ward_id: auth.wardId, lat: p.lat, lng: p.lng, source: 'manual' })
      .select()
      .single();
    if (error) throw error;
    if (!items.value.some((h) => h.id === data.id)) items.value.push(data);
  }

  async function remove(id: string) {
    const { error } = await supabase.from('homes').delete().eq('id', id);
    if (error) throw error;
    items.value = items.value.filter((h) => h.id !== id);
  }

  /** Replaces every footprint home with a fresh import; hand-placed ones stay. */
  async function replaceFootprints(points: LatLng[]) {
    const auth = useAuthStore();
    if (!auth.wardId) throw new Error('No ward.');
    const { error: e1 } = await supabase
      .from('homes')
      .delete()
      .eq('ward_id', auth.wardId)
      .eq('source', 'footprint');
    if (e1) throw e1;
    const { data, error: e2 } = await supabase
      .from('homes')
      .insert(points.map((p) => ({ ward_id: auth.wardId!, lat: p.lat, lng: p.lng, source: 'footprint' as const })))
      .select();
    if (e2) throw e2;
    items.value = [...items.value.filter((h) => h.source !== 'footprint'), ...(data ?? [])];
  }

  return { items, fetch, add, remove, replaceFootprints };
});
