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

  // If already signed in (or returning after email confirmation which puts a
  // session in the URL hash that Supabase auto-detects), join immediately.
  if (!auth.ready) await auth.init();
  if (auth.user) {
    await joinWard();
    return;
  }

  // Also watch for session arrival after email confirmation redirect.
  // Supabase fires onAuthStateChange with SIGNED_IN when it parses the hash.
  const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
    if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session?.user) {
      subscription.unsubscribe();
      auth.user = session.user as unknown as typeof auth.user; // keep store in sync
      await joinWard();
    }
  });

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
    // Sign up with skip_auto_ward so the DB trigger does not create a second ward.
    // emailRedirectTo sends the confirmation link back to this same /join?token=…
    // URL so the token is preserved after the user clicks "Confirm email".
    const { error: signUpError } = await supabase.auth.signUp({
      email: email.value.trim(),
      password: password.value,
      options: {
        data: { skip_auto_ward: true },
        emailRedirectTo: `${window.location.origin}/join?token=${token}`,
      },
    });
    if (signUpError) throw signUpError;

    // Try to sign in immediately — works when email confirmation is disabled.
    // If confirmation is required, signInWithPassword returns an error and we
    // show a "check your email" message. After confirmation Supabase redirects
    // back here, onMounted detects the session and calls joinWard() automatically.
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.value.trim(),
      password: password.value,
    });
    if (signInError) {
      status.value = 'valid'; // keep form visible but unfrozen
      formError.value =
        'Check your email for a confirmation link, then come back here automatically.';
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
    <div v-if="status === 'loading'" class="text-sm text-stone-400">Validating invite…</div>

    <!-- Joining (already authed) -->
    <div v-else-if="status === 'joining'" class="text-sm text-stone-400">Joining ward…</div>

    <!-- Invalid / expired invite -->
    <div
      v-else-if="status === 'invalid' || status === 'error'"
      class="w-full max-w-sm space-y-3 rounded-lg border border-stone-200 bg-white p-6 shadow-sm text-center"
    >
      <p class="text-base font-semibold text-stone-800">Invalid invite</p>
      <p class="text-sm text-stone-500">{{ errorMsg }}</p>
      <a href="/login" class="inline-block text-sm text-stone-700 underline hover:text-stone-900">
        Go to sign in
      </a>
    </div>

    <!-- Valid invite — sign-up form -->
    <form
      v-else-if="status === 'valid'"
      @submit.prevent="signUpAndJoin"
      class="w-full max-w-sm space-y-4 rounded-lg border border-stone-200 bg-white p-6 shadow-sm"
    >
      <h1 class="text-xl font-semibold">Join your ward</h1>
      <p class="text-sm text-stone-500">
        You've been invited. Create a password to get started.
      </p>

      <div>
        <label class="block text-sm font-medium text-stone-700" for="join-email">Email</label>
        <input
          id="join-email"
          v-model="email"
          type="email"
          required
          readonly
          autocomplete="email"
          class="mt-1 w-full rounded border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-600 focus:outline-none"
        />
      </div>

      <div>
        <label class="block text-sm font-medium text-stone-700" for="join-password">Password</label>
        <input
          id="join-password"
          v-model="password"
          type="password"
          required
          autocomplete="new-password"
          class="mt-1 w-full rounded border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
        />
      </div>

      <div>
        <label class="block text-sm font-medium text-stone-700" for="join-confirm">
          Confirm password
        </label>
        <input
          id="join-confirm"
          v-model="confirmPassword"
          type="password"
          required
          autocomplete="new-password"
          class="mt-1 w-full rounded border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
        />
      </div>

      <p v-if="formError" class="text-sm text-red-600">{{ formError }}</p>

      <button
        type="submit"
        :disabled="formLoading"
        class="w-full rounded bg-stone-900 px-3 py-2 text-sm text-white hover:bg-stone-800 disabled:opacity-60"
      >
        {{ formLoading ? 'Creating account…' : 'Create account & join' }}
      </button>
    </form>
  </main>
</template>
