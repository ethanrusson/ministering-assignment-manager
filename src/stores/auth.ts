import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const session = ref<Session | null>(null);
  const wardId = ref<string | null>(null);
  const ready = ref(false);

  async function init() {
    const { data } = await supabase.auth.getSession();
    session.value = data.session;
    user.value = data.session?.user ?? null;
    if (user.value) await loadWard();
    ready.value = true;

    supabase.auth.onAuthStateChange(async (_event, s) => {
      session.value = s;
      user.value = s?.user ?? null;
      if (user.value) await loadWard();
      else wardId.value = null;
    });
  }

  async function loadWard() {
    const { data, error } = await supabase
      .from('wards')
      .select('id')
      .limit(1)
      .single();
    if (error) {
      // First sign-in: trigger should have created the ward, but tolerate a race.
      const inserted = await supabase
        .from('wards')
        .insert({ user_id: user.value!.id })
        .select('id')
        .single();
      wardId.value = inserted.data?.id ?? null;
      return;
    }
    wardId.value = data.id;
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

  return { user, session, wardId, ready, init, signIn, signUp, signOut };
});
