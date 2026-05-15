// Tiny global error feed: components throw, we catch via Vue's onErrorCaptured
// at the app root, and any promise-rejection / app error is surfaced here as
// a transient toast. Avoids silent write failures going unnoticed.

import { ref } from 'vue';

export interface Toast {
  id: number;
  message: string;
  kind: 'error' | 'info';
}

const toasts = ref<Toast[]>([]);
let nextId = 1;

export function useToasts() {
  return { toasts };
}

export function pushError(err: unknown) {
  const message = errorMessage(err);
  if (!message) return;
  const id = nextId++;
  toasts.value.push({ id, message, kind: 'error' });
  window.setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }, 6000);
}

function errorMessage(err: unknown): string {
  if (!err) return '';
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (typeof err === 'object') {
    const e = err as { message?: string; error_description?: string };
    return e.message ?? e.error_description ?? JSON.stringify(err);
  }
  return String(err);
}

/** Install global handlers so any unhandled write error reaches the user. */
export function installGlobalErrorReporting() {
  window.addEventListener('unhandledrejection', (ev) => {
    pushError(ev.reason);
  });
}
