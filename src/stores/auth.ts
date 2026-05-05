import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const session = ref<Session | null>(null);
  const wardId = ref<string | null>(null);
  const wardRole = ref<'admin' | 'member' | null>(null);
  const wardName = ref<string | null>(null);
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
      else { wardId.value = null; wardRole.value = null; wardName.value = null; }
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
        .select('name')
        .eq('id', membership.ward_id)
        .single();
      wardName.value = ward?.name ?? null;
    } else {
      wardName.value = null;
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

  return { user, session, wardId, wardRole, wardName, ready, init, signIn, signUp, signOut, updateWardName };
});
