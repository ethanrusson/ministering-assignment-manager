<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

type InviteStatus = 'loading' | 'valid' | 'invalid' | 'joining' | 'error';

const status = ref<InviteStatus>('loading');
const errorMsg = ref<string | null>(null);
const inviteEmail = ref<string | null>(null);

// Sign-up form fields (shown when user is not yet authenticated)
const email = ref('');
const password = ref('');
const confirmPassword = ref('');
const formError = ref<string | null>(null);
const formLoading = ref(false);

const token = route.query.token as string | undefined;

onMounted(async () => {
  if (!token) {
    status.value = 'invalid';
    errorMsg.value = 'No invite token provided.';
    return;
  }

  // Validate the token by fetching the invite row
  const { data, error } = await supabase
    .from('ward_invites')
    .select('id, email, expires_at, accepted_at')
    .eq('token', token)
    .single();

  if (error || !data) {
    status.value = 'invalid';
    errorMsg.value = 'Invite not found or already used.';
    return;
  }

  if (data.accepted_at) {
    status.value = 'invalid';
    errorMsg.value = 'This invite has already been used.';
    return;
  }

  if (new Date(data.expires_at) < new Date()) {
    status.value = 'invalid';
    errorMsg.value = 'This invite has expired.';
    return;
  }

  inviteEmail.value = data.email;
  email.value = data.email; // Pre-fill email in sign-up form

  // If already signed in, join immediately
  if (!auth.ready) await auth.init();
  if (auth.user) {
    await joinWard();
    return;
  }

  status.value = 'valid';
});

async function joinWard() {
  status.value = 'joining';
  const { error } = await supabase.rpc('accept_invite', { p_token: token! });
  if (error) {
    status.value = 'error';
    errorMsg.value = error.message;
    return;
  }
  // Reload ward info and redirect
  await auth.init();
  router.replace({ name: 'home' });
}

async function signUpAndJoin() {
  formError.value = null;

  if (password.value !== confirmPassword.value) {
    formError.value = 'Passwords do not match.';
    return;
  }
  if (password.value.length < 6) {
    formError.value = 'Password must be at least 6 characters.';
    return;
  }

  formLoading.value = true;
  try {
    // Sign up with skip_auto_ward so the DB trigger does not create a second ward
    const { error: signUpError } = await supabase.auth.signUp({
      email: email.value.trim(),
      password: password.value,
      options: {
        data: { skip_auto_ward: true },
      },
    });
    if (signUpError) throw signUpError;

    // Sign in immediately (Supabase may auto-confirm in dev, or require email confirm)
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.value.trim(),
      password: password.value,
    });
    if (signInError) {
      formError.value =
        'Account created — please check your email to confirm before signing in.';
      formLoading.value = false;
      return;
    }

    await joinWard();
  } catch (e: unknown) {
    formError.value = e instanceof Error ? e.message : 'Sign up failed.';
    formLoading.value = false;
  }
}
</script>

<template>
  <main class="flex min-h-screen items-center justify-center px-4">
    <!-- Loading -->
    <div v-if="status === 'loading'" class="text-sm text-slate-400">Validating invite…</div>

    <!-- Joining (already authed) -->
    <div v-else-if="status === 'joining'" class="text-sm text-slate-400">Joining ward…</div>

    <!-- Invalid / expired invite -->
    <div
      v-else-if="status === 'invalid' || status === 'error'"
      class="w-full max-w-sm space-y-3 rounded-lg border border-slate-200 bg-white p-6 shadow-sm text-center"
    >
      <p class="text-base font-semibold text-slate-800">Invalid invite</p>
      <p class="text-sm text-slate-500">{{ errorMsg }}</p>
      <a href="/login" class="inline-block text-sm text-slate-700 underline hover:text-slate-900">
        Go to sign in
      </a>
    </div>

    <!-- Valid invite — sign-up form -->
    <form
      v-else-if="status === 'valid'"
      @submit.prevent="signUpAndJoin"
      class="w-full max-w-sm space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
    >
      <h1 class="text-xl font-semibold">Join your ward</h1>
      <p class="text-sm text-slate-500">
        You've been invited. Create a password to get started.
      </p>

      <div>
        <label class="block text-sm font-medium text-slate-700" for="join-email">Email</label>
        <input
          id="join-email"
          v-model="email"
          type="email"
          required
          readonly
          autocomplete="email"
          class="mt-1 w-full rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600 focus:outline-none"
        />
      </div>

      <div>
        <label class="block text-sm font-medium text-slate-700" for="join-password">Password</label>
        <input
          id="join-password"
          v-model="password"
          type="password"
          required
          autocomplete="new-password"
          class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>

      <div>
        <label class="block text-sm font-medium text-slate-700" for="join-confirm">
          Confirm password
        </label>
        <input
          id="join-confirm"
          v-model="confirmPassword"
          type="password"
          required
          autocomplete="new-password"
          class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>

      <p v-if="formError" class="text-sm text-red-600">{{ formError }}</p>

      <button
        type="submit"
        :disabled="formLoading"
        class="w-full rounded bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {{ formLoading ? 'Creating account…' : 'Create account & join' }}
      </button>
    </form>
  </main>
</template>
