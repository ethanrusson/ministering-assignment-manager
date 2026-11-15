import { defineStore } from 'pinia';
import { ref } from 'vue';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth';

/** When ministering imports ran; only the latest matters ("New since last import"). */
export const useLcrImportsStore = defineStore('lcrImports', () => {
  const lastAt = ref<string | null>(null);

  async function fetch() {
    const { data, error } = await supabase
      .from('lcr_imports')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    lastAt.value = data?.created_at ?? null;
  }

  /** Call as an import starts, so everything it creates counts as new. */
  async function record() {
    const auth = useAuthStore();
    if (!auth.wardId) throw new Error('No ward.');
    const { data, error } = await supabase
      .from('lcr_imports')
      .insert({ ward_id: auth.wardId })
      .select('created_at')
      .single();
    if (error) throw error;
    lastAt.value = data.created_at;
  }

  return { lastAt, fetch, record };
});
