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

// Abort any supabase HTTP request that hangs longer than this and surface a
// toast. The most common silent failure mode here isn't an error — it's a
// request that never resolves. Aborting forces a visible signal.
const SUPABASE_TIMEOUT_MS = 12000;

function wrapFetch(): typeof fetch {
  return (input, init) => {
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
        return res;
      },
      (err) => {
        window.clearTimeout(timer);
        if (err && typeof err === 'object' && 'name' in err && err.name === 'TimeoutError') {
          pushError(new Error('Supabase request timed out — try reloading the page.'));
        }
        throw err;
      },
    );
  };
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: {
    fetch: wrapFetch(),
  },
});
