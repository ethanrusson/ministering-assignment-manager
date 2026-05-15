<script setup lang="ts">
// Lightweight troubleshooting panel. Click "Test write" after the bug reproduces
// to find out exactly which layer is broken:
//   1. session check    — is supabase.auth even readable right now?
//   2. simple read      — does an HTTP query reach the DB and come back?
//   3. write+read       — does an UPDATE we can verify actually persist?
//
// Every step logs to the console with timing. If any step hangs, the timeout in
// wrapFetch (supabase.ts) will surface it as a toast after 12s.

import { ref } from 'vue';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const open = ref(false);
const running = ref(false);
const log = ref<string[]>([]);

function line(msg: string) {
  const t = new Date().toISOString().slice(11, 23);
  log.value.push(`${t} ${msg}`);
  console.log(`[diag] ${msg}`);
}

async function timed<T>(label: string, fn: () => Promise<T>, timeoutMs = 5000): Promise<T | null> {
  const t0 = performance.now();
  line(`→ ${label}`);
  try {
    const result = await Promise.race<T>([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`hung — no resolution after ${timeoutMs}ms`)),
          timeoutMs,
        ),
      ),
    ]);
    line(`✓ ${label} (${Math.round(performance.now() - t0)}ms)`);
    return result;
  } catch (e) {
    line(`✗ ${label} (${Math.round(performance.now() - t0)}ms): ${(e as Error)?.message ?? e}`);
    return null;
  }
}

async function rawFetchTest() {
  // Bypass supabase-js entirely. If this works but supabase calls hang, we've
  // definitively proven the bug is inside the supabase-js client state.
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) {
    line('skip raw fetch — no access token');
    return;
  }
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  await timed('raw fetch /rest/v1/ward_members?limit=1', async () => {
    const res = await globalThis.fetch(`${url}/rest/v1/ward_members?select=ward_id&limit=1`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    });
    line(`  status = ${res.status}`);
    const body = await res.text();
    line(`  body = ${body.slice(0, 120)}`);
  });
}

async function runDiagnostic() {
  if (running.value) return;
  running.value = true;
  log.value = [];
  try {
    line('--- diagnostic start ---');
    line(
      `document.visibilityState = ${document.visibilityState}, navigator.onLine = ${navigator.onLine}`,
    );
    line(`auth.wardId = ${auth.wardId ?? 'null'}, auth.user = ${auth.user?.id ?? 'null'}`);

    // 1. Session read
    const sessRes = await timed('supabase.auth.getSession()', () => supabase.auth.getSession());
    if (sessRes) {
      const sess = sessRes.data?.session;
      line(
        `  session.expires_at = ${sess?.expires_at ?? '?'} (${
          sess?.expires_at
            ? Math.round(sess.expires_at - Date.now() / 1000) + 's left'
            : 'no session'
        })`,
      );
    }

    // 2. Simple read (no ward filter — proves the connection)
    await timed('SELECT ward_members LIMIT 1', async () => {
      const { data, error } = await supabase.from('ward_members').select('ward_id').limit(1);
      if (error) throw error;
      line(`  rows = ${data?.length ?? 0}`);
    });

    // 3. Write + read (only if we have a ward — uses the wards table)
    if (auth.wardId) {
      await timed('UPDATE wards SET name=name WHERE id=…', async () => {
        const { error } = await supabase
          .from('wards')
          .update({ name: auth.wardName ?? 'My Ward' })
          .eq('id', auth.wardId!);
        if (error) throw error;
      });

      await timed('SELECT wards WHERE id=…', async () => {
        const { data, error } = await supabase
          .from('wards')
          .select('name')
          .eq('id', auth.wardId!)
          .maybeSingle();
        if (error) throw error;
        line(`  ward.name = ${data?.name ?? 'null'}`);
      });
    } else {
      line('skip write test — auth.wardId is null');
    }

    // 4. Realtime channel states
    try {
      const channels = supabase.getChannels();
      line(`realtime channels = ${channels.length}`);
      channels.forEach((c, i) => {
        const state = (c as unknown as { state?: string }).state ?? 'unknown';
        line(`  [${i}] topic=${c.topic} state=${state}`);
      });
    } catch (e) {
      line(`! getChannels threw: ${(e as Error)?.message ?? e}`);
    }

    // 5. Raw fetch — proves the network/server side is fine
    await rawFetchTest();

    line('--- diagnostic end ---');
  } catch (e) {
    line(`! diagnostic threw: ${(e as Error)?.message ?? e}`);
  } finally {
    running.value = false;
  }
}

async function forceTokenRefresh() {
  if (running.value) return;
  running.value = true;
  try {
    await timed('supabase.auth.refreshSession()', () => supabase.auth.refreshSession());
  } finally {
    running.value = false;
  }
}

function copyLog() {
  navigator.clipboard.writeText(log.value.join('\n')).catch(() => {});
}

function reloadPage() {
  window.location.reload();
}
</script>

<template>
  <div class="fixed bottom-4 left-4 z-40">
    <button
      v-if="!open"
      class="rounded border border-stone-300 bg-white px-2 py-1 text-xs text-stone-600 shadow hover:bg-stone-50"
      @click="open = true"
    >
      Debug
    </button>
    <div
      v-else
      class="flex w-96 flex-col gap-2 rounded-lg border border-stone-300 bg-white p-3 shadow-lg"
    >
      <div class="flex items-center justify-between">
        <span class="text-xs font-semibold text-stone-700">Connection diagnostic</span>
        <button class="text-xs text-stone-500 hover:text-stone-800" @click="open = false">×</button>
      </div>
      <div class="flex flex-wrap gap-1">
        <button
          class="rounded border border-stone-300 px-2 py-1 text-xs hover:bg-stone-50 disabled:opacity-50"
          :disabled="running"
          @click="runDiagnostic"
        >
          Test write
        </button>
        <button
          class="rounded border border-stone-300 px-2 py-1 text-xs hover:bg-stone-50 disabled:opacity-50"
          :disabled="running"
          @click="forceTokenRefresh"
        >
          Force refresh
        </button>
        <button
          class="rounded border border-stone-300 px-2 py-1 text-xs hover:bg-stone-50"
          @click="copyLog"
        >
          Copy log
        </button>
        <button
          class="rounded border border-stone-300 px-2 py-1 text-xs hover:bg-stone-50"
          @click="reloadPage"
        >
          Reload page
        </button>
      </div>
      <pre
        class="max-h-64 overflow-auto rounded bg-stone-50 p-2 font-mono text-[10px] leading-tight text-stone-700"
        >{{ log.length ? log.join('\n') : 'Click "Test write" to run diagnostics.' }}</pre
      >
    </div>
  </div>
</template>
