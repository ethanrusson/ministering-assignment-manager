<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const auth = useAuthStore();

const email = ref('');
const password = ref('');
const loading = ref(false);
const errorMsg = ref<string | null>(null);

async function submit() {
  loading.value = true;
  errorMsg.value = null;
  try {
    await auth.signIn(email.value.trim(), password.value);
    router.replace({ name: 'home' });
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : 'Sign in failed.';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="flex min-h-screen items-center justify-center px-4">
    <form
      @submit.prevent="submit"
      class="w-full max-w-sm space-y-4 rounded-lg border border-stone-200 bg-white p-6 shadow-sm"
    >
      <h1 class="text-xl font-semibold">Sign in</h1>
      <div>
        <label class="block text-sm font-medium text-stone-700" for="email">Email</label>
        <input
          id="email"
          v-model="email"
          type="email"
          required
          autocomplete="email"
          class="mt-1 w-full rounded border border-stone-300 px-3 py-2 focus:border-stone-500 focus:outline-none"
        />
      </div>
      <div>
        <label class="block text-sm font-medium text-stone-700" for="password">Password</label>
        <input
          id="password"
          v-model="password"
          type="password"
          required
          autocomplete="current-password"
          class="mt-1 w-full rounded border border-stone-300 px-3 py-2 focus:border-stone-500 focus:outline-none"
        />
      </div>
      <p v-if="errorMsg" class="text-sm text-danger-600">{{ errorMsg }}</p>
      <button
        type="submit"
        :disabled="loading"
        class="w-full rounded bg-stone-900 px-3 py-2 text-white hover:bg-stone-800 disabled:opacity-60"
      >
        {{ loading ? 'Signing in…' : 'Sign in' }}
      </button>
    </form>
  </main>
</template>
