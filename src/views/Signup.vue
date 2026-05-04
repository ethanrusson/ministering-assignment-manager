<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, RouterLink } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const auth = useAuthStore();

const email = ref('');
const password = ref('');
const loading = ref(false);
const errorMsg = ref<string | null>(null);
const info = ref<string | null>(null);

async function submit() {
  loading.value = true;
  errorMsg.value = null;
  info.value = null;
  try {
    await auth.signUp(email.value.trim(), password.value);
    if (auth.user) {
      router.replace({ name: 'home' });
    } else {
      info.value = 'Account created. Check your email to confirm, then sign in.';
    }
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : 'Sign up failed.';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="flex min-h-screen items-center justify-center px-4">
    <form
      @submit.prevent="submit"
      class="w-full max-w-sm space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
    >
      <h1 class="text-xl font-semibold">Create account</h1>
      <div>
        <label class="block text-sm font-medium text-slate-700" for="email">Email</label>
        <input
          id="email"
          v-model="email"
          type="email"
          required
          autocomplete="email"
          class="mt-1 w-full rounded border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
        />
      </div>
      <div>
        <label class="block text-sm font-medium text-slate-700" for="password">Password</label>
        <input
          id="password"
          v-model="password"
          type="password"
          required
          minlength="8"
          autocomplete="new-password"
          class="mt-1 w-full rounded border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
        />
      </div>
      <p v-if="errorMsg" class="text-sm text-danger-600">{{ errorMsg }}</p>
      <p v-if="info" class="text-sm text-slate-700">{{ info }}</p>
      <button
        type="submit"
        :disabled="loading"
        class="w-full rounded bg-slate-900 px-3 py-2 text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {{ loading ? 'Creating…' : 'Create account' }}
      </button>
      <p class="text-center text-sm text-slate-600">
        Already have an account?
        <RouterLink :to="{ name: 'login' }" class="text-slate-900 underline">Sign in</RouterLink>
      </p>
    </form>
  </main>
</template>
