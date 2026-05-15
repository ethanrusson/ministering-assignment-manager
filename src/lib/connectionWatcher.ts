// Light-weight connection watcher.
//
// Earlier versions of this file tried to be helpful by aggressively re-fetching
// every store and refreshing the Supabase auth token on every visibility /
// focus event. That turned out to make things WORSE: every tab return tore
// down and rebuilt 5+ realtime channels, fought for the gotrue auth lock, and
// left subsequent writes hanging silently. The lesson is that Supabase already
// manages its own session lifecycle when the tab is active; we should only
// step in for events the SDK can't detect on its own.
//
// What's left:
//   - 'online' event: the OS just told us the network came back; refetch and
//     resubscribe so any missed realtime events are caught up.
//   - 'channel-lost' (from realtime status): an actual channel error/timeout
//     fired and we know stale data is being shown. (This callback is fired
//     only when the channel had previously been SUBSCRIBED and was NOT closed
//     by us — see realtime.ts.)
//
// We deliberately do NOT listen to visibilitychange / focus anymore. Supabase's
// own auto-refresh handles token rotation while the tab is active, and brief
// tab-switches don't actually invalidate anything.

import { onBeforeUnmount, onMounted } from 'vue';
import { onConnectionLost } from '@/lib/realtime';

type FetchFn = () => Promise<unknown>;

export function useConnectionWatcher(fetchers: FetchFn[]) {
  let inFlight = false;
  let queued = false;

  async function resync(reason: string) {
    if (inFlight) {
      queued = true;
      return;
    }
    inFlight = true;
    try {
      await Promise.all(
        fetchers.map((f) =>
          f().catch((e) => {
            console.error(`[connection-watcher] fetch failed during ${reason}`, e);
          }),
        ),
      );
    } finally {
      inFlight = false;
      if (queued) {
        queued = false;
        void resync('queued');
      }
    }
  }

  function onOnline() {
    void resync('online');
  }
  let unsubLost: (() => void) | null = null;

  onMounted(() => {
    window.addEventListener('online', onOnline);
    unsubLost = onConnectionLost(() => void resync('channel-lost'));
  });

  onBeforeUnmount(() => {
    window.removeEventListener('online', onOnline);
    unsubLost?.();
  });
}
