import type { Ref } from 'vue';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

// Supabase realtime channels can drop into CHANNEL_ERROR / TIMED_OUT / CLOSED
// when the tab is backgrounded, the network blips, or the auth token rotates.
// Without intervention they never reconnect, so writes from other clients stop
// propagating until the page is reloaded. We watch the status here and invoke
// a registered callback so the caller can refetch + resubscribe.
type Reconnector = () => void;
const reconnectors = new Set<Reconnector>();

export function onConnectionLost(fn: Reconnector): () => void {
  reconnectors.add(fn);
  return () => reconnectors.delete(fn);
}

function fireReconnect() {
  for (const fn of reconnectors) {
    try {
      fn();
    } catch (e) {
      console.error('[realtime] reconnector threw', e);
    }
  }
}

// Track each channel's "intentional close" flag. When a caller wraps the
// channel via subscribeToTable and later calls channel.unsubscribe() (e.g.
// because they're rebuilding it inside fetch()), the channel emits status
// 'CLOSED' a moment later. Without tracking this, we treat that intentional
// close identically to a server-side disconnect and queue a reconnect — but
// the reconnect itself calls fetch() which calls unsubscribe() again, which
// emits another CLOSED, and we end up in a tight loop tearing down and
// rebuilding channels forever (which also thrashes the gotrue auth lock and
// can hang subsequent writes).
const intentionallyClosed = new WeakSet<RealtimeChannel>();

function markIntentionalClose(channel: RealtimeChannel) {
  // Wrap unsubscribe so callers signal "I'm tearing this down; ignore the
  // CLOSED that follows" without having to know about the flag themselves.
  const orig = (channel.unsubscribe as () => Promise<'ok' | 'timed out' | 'error'>).bind(
    channel,
  );
  channel.unsubscribe = (async () => {
    intentionallyClosed.add(channel);
    return orig();
  }) as typeof channel.unsubscribe;
}

function watchChannelStatus(table: string, channel: RealtimeChannel) {
  let everSubscribed = false;
  channel.subscribe((status, err) => {
    if (status === 'SUBSCRIBED') {
      everSubscribed = true;
      return;
    }
    if (intentionallyClosed.has(channel)) return;
    // Only treat as a real disconnect if we'd successfully subscribed at
    // least once. Otherwise an initial CHANNEL_ERROR (e.g. RLS denied,
    // bad ward id) loops forever as we keep trying to reconnect.
    if (!everSubscribed) return;
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      console.warn(`[realtime] ${table} channel ${status}`, err ?? '');
      queueMicrotask(fireReconnect);
    }
  });
}

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
  const channel = supabase
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
    );
  markIntentionalClose(channel);
  watchChannelStatus(table, channel);
  return channel;
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
  const channel = supabase
    .channel(`${table}:${wardId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      onEvent,
    );
  markIntentionalClose(channel);
  watchChannelStatus(table, channel);
  return channel;
}
