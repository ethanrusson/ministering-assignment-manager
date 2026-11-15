import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Json } from '@/types/database';

/** The ward boundary (wards.boundary): a GeoJSON Polygon, [lng, lat] pairs, closed. */
export interface WardBoundary {
  type: 'Polygon';
  coordinates: [number, number][][];
}

function asBoundary(v: Json | null | undefined): WardBoundary | null {
  const b = v as Partial<WardBoundary> | null;
  return b?.type === 'Polygon' && Array.isArray(b.coordinates?.[0]) && b.coordinates[0].length >= 4
    ? (b as WardBoundary)
    : null;
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const session = ref<Session | null>(null);
  const wardId = ref<string | null>(null);
  const wardRole = ref<'admin' | 'member' | null>(null);
  const wardName = ref<string | null>(null);
  const wardBoundary = ref<WardBoundary | null>(null);
  const ready = ref(false);

  async function init() {
    const { data } = await supabase.auth.getSession();
    session.value = data.session;
    user.value = data.session?.user ?? null;
    if (user.value) await loadWard();
    ready.value = true;

    // CRITICAL: do NOT await any supabase call inside onAuthStateChange.
    // The callback fires while supabase-js is holding its internal auth lock
    // (e.g. inside _recoverAndRefresh after a visibilitychange). Any supabase
    // call we make here would queue into `pendingInLock`, which the lock
    // holder is itself waiting to drain — instant deadlock that leaves every
    // future supabase call hanging silently until the page is reloaded.
    // Defer the follow-up work onto a fresh task so the lock can release first.
    supabase.auth.onAuthStateChange((_event, s) => {
      session.value = s;
      user.value = s?.user ?? null;
      if (user.value) {
        setTimeout(() => {
          void loadWard();
        }, 0);
      } else {
        wardId.value = null;
        wardRole.value = null;
        wardName.value = null;
        wardBoundary.value = null;
      }
    });
  }

  async function loadWard() {
    const { data: membership } = await supabase
      .from('ward_members')
      .select('ward_id, role')
      .eq('user_id', user.value!.id)
      .limit(1)
      .single();
    wardId.value = membership?.ward_id ?? null;
    wardRole.value = (membership?.role as 'admin' | 'member') ?? null;

    if (membership?.ward_id) {
      const { data: ward } = await supabase
        .from('wards')
        .select('name, boundary')
        .eq('id', membership.ward_id)
        .single();
      wardName.value = ward?.name ?? null;
      wardBoundary.value = asBoundary(ward?.boundary);
    } else {
      wardName.value = null;
      wardBoundary.value = null;
    }
  }

  async function updateWardName(name: string) {
    const trimmed = name.trim();
    if (!wardId.value || !trimmed) return;
    const { error } = await supabase
      .from('wards')
      .update({ name: trimmed })
      .eq('id', wardId.value);
    if (error) throw error;
    wardName.value = trimmed;
  }

  /** Admins only (wards update policy). Null clears it back to the generated outline. */
  async function updateWardBoundary(boundary: WardBoundary | null) {
    if (!wardId.value) return;
    const { error } = await supabase
      .from('wards')
      .update({ boundary: boundary as unknown as Json })
      .eq('id', wardId.value);
    if (error) throw error;
    wardBoundary.value = boundary;
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signUp(email: string, password: string) {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return {
    user,
    session,
    wardId,
    wardRole,
    wardName,
    wardBoundary,
    ready,
    init,
    signIn,
    signUp,
    signOut,
    updateWardName,
    updateWardBoundary,
  };
});
