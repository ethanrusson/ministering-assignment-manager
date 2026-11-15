import { defineStore } from 'pinia';
import { onScopeDispose, ref } from 'vue';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth';
import { subscribeToTable } from '@/lib/realtime';
import type { Database } from '@/types/database';
import type { ImportedStreet } from '@/map/streets';

/** A street row, with its GeoJSON geometry typed (the column is plain jsonb). */
export type Street = Omit<Database['public']['Tables']['streets']['Row'], 'geometry'> & {
  geometry: ImportedStreet['geometry'];
};

export const useStreetsStore = defineStore('streets', () => {
  const items = ref<Street[]>([]);
  let channel: RealtimeChannel | null = null;

  async function fetch() {
    const { data, error } = await supabase.from('streets').select('*');
    if (error) throw error;
    items.value = (data ?? []) as Street[];

    const auth = useAuthStore();
    if (auth.wardId) {
      channel?.unsubscribe();
      channel = subscribeToTable('streets', auth.wardId, items);
    }
  }

  onScopeDispose(() => {
    channel?.unsubscribe();
  });

  /** Replaces every OpenStreetMap street with a fresh import; hand-drawn ones stay. */
  async function replaceImported(streets: ImportedStreet[]) {
    const auth = useAuthStore();
    if (!auth.wardId) throw new Error('No ward.');
    const { error: e1 } = await supabase
      .from('streets')
      .delete()
      .eq('ward_id', auth.wardId)
      .eq('source', 'osm');
    if (e1) throw e1;
    const { data, error: e2 } = await supabase
      .from('streets')
      .insert(
        streets.map((s) => ({
          ward_id: auth.wardId!,
          name: s.name,
          kind: s.kind,
          geometry: s.geometry,
          source: 'osm' as const,
          osm_id: s.osmId,
        })),
      )
      .select();
    if (e2) throw e2;
    items.value = [...items.value.filter((s) => s.source !== 'osm'), ...((data ?? []) as Street[])];
  }

  return { items, fetch, replaceImported };
});
