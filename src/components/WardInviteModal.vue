<script setup lang="ts">
import { ref } from 'vue';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth';

defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const auth = useAuthStore();

const email = ref('');
const loading = ref(false);
const errorMsg = ref<string | null>(null);
const joinLink = ref<string | null>(null);
const copied = ref(false);

async function submit() {
  if (!auth.wardId) return;
  loading.value = true;
  errorMsg.value = null;
  joinLink.value = null;

  const { data, error } = await supabase
    .from('ward_invites')
    .insert({
      ward_id: auth.wardId,
      email: email.value.trim(),
      created_by: auth.user!.id,
    })
    .select('token')
    .single();

  loading.value = false;

  if (error || !data) {
    errorMsg.value = error?.message ?? 'Failed to create invite.';
    return;
  }

  joinLink.value = `${window.location.origin}/join?token=${data.token}`;
  email.value = '';
}

async function copyLink() {
  if (!joinLink.value) return;
  await navigator.clipboard.writeText(joinLink.value);
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
}

function close() {
  email.value = '';
  errorMsg.value = null;
  joinLink.value = null;
  copied.value = false;
  emit('close');
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="close"
    >
      <div class="w-full max-w-md rounded-lg border border-stone-200 bg-white p-6 shadow-xl">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-base font-semibold">Invite a member</h2>
          <button
            class="text-stone-400 hover:text-stone-600"
            aria-label="Close"
            @click="close"
          >
            ✕
          </button>
        </div>

        <!-- Step 1: email form -->
        <form v-if="!joinLink" @submit.prevent="submit" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-stone-700" for="invite-email">
              Email address
            </label>
            <input
              id="invite-email"
              v-model="email"
              type="email"
              required
              placeholder="colleague@example.com"
              class="mt-1 w-full rounded border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
            />
          </div>
          <p v-if="errorMsg" class="text-sm text-red-600">{{ errorMsg }}</p>
          <div class="flex justify-end gap-2">
            <button
              type="button"
              class="rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50"
              @click="close"
            >
              Cancel
            </button>
            <button
              type="submit"
              :disabled="loading"
              class="rounded bg-stone-900 px-3 py-1.5 text-sm text-white hover:bg-stone-800 disabled:opacity-60"
            >
              {{ loading ? 'Creating…' : 'Generate link' }}
            </button>
          </div>
        </form>

        <!-- Step 2: show generated link -->
        <div v-else class="space-y-4">
          <p class="text-sm text-stone-600">
            Share this link with the person you're inviting. It expires in 7 days.
          </p>
          <div class="flex items-center gap-2">
            <input
              :value="joinLink"
              readonly
              class="min-w-0 flex-1 rounded border border-stone-300 bg-stone-50 px-3 py-2 text-xs text-stone-700 focus:outline-none"
            />
            <button
              class="shrink-0 rounded border border-stone-300 px-3 py-2 text-xs hover:bg-stone-50"
              @click="copyLink"
            >
              {{ copied ? 'Copied!' : 'Copy' }}
            </button>
          </div>
          <div class="flex justify-between gap-2">
            <button
              class="text-sm text-stone-500 hover:text-stone-700 underline"
              @click="joinLink = null"
            >
              Invite another
            </button>
            <button
              class="rounded bg-stone-900 px-3 py-1.5 text-sm text-white hover:bg-stone-800"
              @click="close"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
