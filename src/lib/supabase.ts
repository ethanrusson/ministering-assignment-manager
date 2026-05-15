import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { pushError } from './errorToast';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing Supabase env vars. Copy .env.example to .env.local and fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
  );
}

// Time out any supabase HTTP request that hangs longer than this. The most
// common failure mode here isn't an error — it's a request that never resolves
// because the auth/realtime client is in a bad state. Aborting forces a
// visible error so the user (and we) know something is wrong.
const SUPABASE_TIMEOUT_MS = 12000;

let reqSeq = 0;

function shortUrl(u: string): string {
  try {
    const p = new URL(u);
    return p.pathname + (p.search ? '?' + p.search.slice(0, 80) : '');
  } catch {
    return String(u).slice(0, 120);
  }
}

function wrapFetch(): typeof fetch {
  return (input, init) => {
    const id = ++reqSeq;
    const method = (init?.method ?? 'GET').toUpperCase();
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    const started = performance.now();
    console.log(`[supabase #${id}] → ${method} ${shortUrl(url)}`);

    const upstream = init?.signal ?? null;
    const controller = new AbortController();
    if (upstream) {
      if (upstream.aborted) controller.abort(upstream.reason);
      else upstream.addEventListener('abort', () => controller.abort(upstream.reason));
    }
    const timer = window.setTimeout(() => {
      controller.abort(new DOMException('Supabase request timed out', 'TimeoutError'));
    }, SUPABASE_TIMEOUT_MS);
    return globalThis.fetch(input, { ...init, signal: controller.signal }).then(
      (res) => {
        window.clearTimeout(timer);
        const ms = Math.round(performance.now() - started);
        console.log(`[supabase #${id}] ← ${res.status} ${method} ${shortUrl(url)} (${ms}ms)`);
        return res;
      },
      (err) => {
        window.clearTimeout(timer);
        const ms = Math.round(performance.now() - started);
        console.error(`[supabase #${id}] ✗ ${method} ${shortUrl(url)} (${ms}ms)`, err);
        if (err && typeof err === 'object' && 'name' in err && err.name === 'TimeoutError') {
          pushError(new Error('Supabase request timed out — try reloading the page.'));
        }
        throw err;
      },
    );
  };
}

// supabase-js's default auth lock uses navigator.locks to coordinate token
// refreshes across tabs. When a tab is hidden Chrome can freeze the page
// mid-acquisition; on resume the lock is never released and every subsequent
// supabase call (including writes that need the auth header) awaits a lock
// that will never resolve — silently, with no error, until reload. We don't
// need cross-tab coordination here; a no-op lock just runs the work directly.
const noopLock = <R,>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> =>
  fn();

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    // autoRefreshToken triggers an internal _recoverAndRefresh() on every
    // visibilitychange. When the tab returns to visible, that flow can get
    // stuck waiting on internal state that never settles — making every
    // subsequent supabase call (getSession, .from().update(), etc.) hang
    // without ever issuing a network request. We disable it and run a tiny
    // periodic refresh ourselves below, where we control the surface area.
    autoRefreshToken: false,
    detectSessionInUrl: true,
    lock: noopLock,
  },
  global: {
    fetch: wrapFetch(),
  },
});

// Manual refresh loop: refresh the access token every 10 minutes while the
// tab is visible. Tokens last 1 hour; refreshing every 10 minutes keeps us
// far from the cliff without needing supabase's visibility-coupled logic.
const REFRESH_EVERY_MS = 10 * 60 * 1000;
let refreshing = false;
async function maybeRefresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    await supabase.auth.refreshSession();
  } catch (e) {
    console.warn('[supabase] manual refresh failed', e);
  } finally {
    refreshing = false;
  }
}
if (typeof window !== 'undefined') {
  window.setInterval(() => {
    if (document.visibilityState === 'visible') void maybeRefresh();
  }, REFRESH_EVERY_MS);
}
