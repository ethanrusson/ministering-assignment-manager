import type { Ref } from 'vue';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

/**
 * Subscribe to all INSERT/UPDATE/DELETE events on a ward-scoped table
 * (tables that have a `ward_id` column).
 *
 * Deduplication: if a row with the same id already exists in `items` the
 * INSERT event is ignored, because the store already pushed it optimistically.
 */
export function subscribeToTable<T extends { id: string }>(
  table: string,
  wardId: string,
  items: Ref<T[]>,
  opts: { onInsert?: (row: T) => void } = {},
): RealtimeChannel {
  return supabase
    .channel(`${table}:${wardId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: `ward_id=eq.${wardId}` },
      (payload: RealtimePostgresChangesPayload<T>) => {
        if (payload.eventType === 'INSERT') {
          const row = payload.new as T;
          if (!items.value.some((i) => i.id === row.id)) {
            items.value.push(row);
            opts.onInsert?.(row);
          }
        } else if (payload.eventType === 'UPDATE') {
          const idx = items.value.findIndex((i) => i.id === (payload.new as T).id);
          if (idx !== -1) items.value[idx] = payload.new as T;
        } else if (payload.eventType === 'DELETE') {
          const deleted = payload.old as { id: string };
          items.value = items.value.filter((i) => i.id !== deleted.id);
        }
      },
    )
    .subscribe();
}

/**
 * Subscribe to all events on a join table (no `ward_id` column — RLS controls
 * which rows each client receives).
 */
export function subscribeToJoinTable(
  table: string,
  wardId: string,
  onEvent: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void,
): RealtimeChannel {
  return supabase
    .channel(`${table}:${wardId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      onEvent,
    )
    .subscribe();
}
