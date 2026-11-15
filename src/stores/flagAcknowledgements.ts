import { defineStore } from 'pinia';
import { onScopeDispose, ref } from 'vue';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth';
import { subscribeToTable } from '@/lib/realtime';
import type { AcknowledgeableFlag, Database } from '@/types/database';

export type FlagAcknowledgement = Database['public']['Tables']['flag_acknowledgements']['Row'];

export const useFlagAcknowledgementsStore = defineStore('flagAcknowledgements', () => {
  const items = ref<FlagAcknowledgement[]>([]);
  let channel: RealtimeChannel | null = null;

  async function fetch() {
    const { data, error } = await supabase.from('flag_acknowledgements').select('*');
    if (error) throw error;
    items.value = data ?? [];
    const auth = useAuthStore();
    if (auth.wardId) {
      channel?.unsubscribe();
      channel = subscribeToTable('flag_acknowledgements', auth.wardId, items);
    }
  }

  onScopeDispose(() => {
    channel?.unsubscribe();
  });

  /** Acknowledges a flag for the household's current companionship (replacing an older one). */
  async function acknowledge(
    householdId: string,
    flag: AcknowledgeableFlag,
    companionshipId: string,
    note: string | null,
  ) {
    const auth = useAuthStore();
    if (!auth.wardId) throw new Error('No ward.');
    const { data, error } = await supabase
      .from('flag_acknowledgements')
      .upsert(
        {
          ward_id: auth.wardId,
          household_id: householdId,
          flag,
          companionship_id: companionshipId,
          note,
          created_by: auth.user?.id ?? null,
        },
        { onConflict: 'household_id,flag' },
      )
      .select()
      .single();
    if (error) throw error;
    items.value = [...items.value.filter((a) => a.id !== data.id && !(a.household_id === householdId && a.flag === flag)), data];
  }

  async function remove(id: string) {
    const { error } = await supabase.from('flag_acknowledgements').delete().eq('id', id);
    if (error) throw error;
    items.value = items.value.filter((a) => a.id !== id);
  }

  return { items, fetch, acknowledge, remove };
});
