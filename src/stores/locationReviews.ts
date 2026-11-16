import { defineStore } from 'pinia';
import { computed, onScopeDispose, ref } from 'vue';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth';
import { subscribeToTable } from '@/lib/realtime';
import type { Database, Json } from '@/types/database';
import type { MovedData, OutsideData, ReviewPlan } from '@/lib/lcr/reviews';

/** A review row, with `data` typed (the column is plain jsonb). */
export type LocationReview = Omit<
  Database['public']['Tables']['location_reviews']['Row'],
  'data'
> & { data: MovedData | OutsideData | Record<string, never> };

export const useLocationReviewsStore = defineStore('locationReviews', () => {
  const items = ref<LocationReview[]>([]);
  let channel: RealtimeChannel | null = null;

  const open = computed(() => items.value.filter((r) => r.status === 'open'));

  async function fetch() {
    const { data, error } = await supabase.from('location_reviews').select('*');
    if (error) throw error;
    items.value = (data ?? []) as LocationReview[];

    const auth = useAuthStore();
    if (auth.wardId) {
      channel?.unsubscribe();
      channel = subscribeToTable('location_reviews', auth.wardId, items);
    }
  }

  onScopeDispose(() => {
    channel?.unsubscribe();
  });

  async function close(id: string, status: 'resolved' | 'dismissed', resolution: string) {
    const auth = useAuthStore();
    const { data, error } = await supabase
      .from('location_reviews')
      .update({
        status,
        resolution,
        resolved_at: new Date().toISOString(),
        resolved_by: auth.user?.id ?? null,
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    items.value = items.value.map((r) => (r.id === id ? (data as LocationReview) : r));
  }

  /** Writes what a location import decided (see planReviews). */
  async function apply(plan: ReviewPlan) {
    const auth = useAuthStore();
    if (!auth.wardId) throw new Error('No ward.');
    if (plan.insert.length) {
      const { data, error } = await supabase
        .from('location_reviews')
        .insert(
          plan.insert.map((r) => ({
            ward_id: auth.wardId!,
            household_id: r.householdId,
            kind: r.kind,
            data: r.data as unknown as Json,
          })),
        )
        .select();
      if (error) throw error;
      const fresh = (data ?? []) as LocationReview[];
      items.value = [...items.value.filter((r) => !fresh.some((f) => f.id === r.id)), ...fresh];
    }
    for (const u of plan.update) {
      const { data, error } = await supabase
        .from('location_reviews')
        .update({ data: u.data as unknown as Json })
        .eq('id', u.id)
        .select()
        .single();
      if (error) throw error;
      items.value = items.value.map((r) => (r.id === u.id ? (data as LocationReview) : r));
    }
    for (const r of plan.resolve) await close(r.id, 'resolved', r.resolution);
  }

  return {
    items,
    open,
    fetch,
    apply,
    resolve: (id: string, resolution: string) => close(id, 'resolved', resolution),
    dismiss: (id: string, resolution: string) => close(id, 'dismissed', resolution),
  };
});
