// "Show sensitive" (docs/ward-map-prd.md, Checkpoint 3, answer 4). Sensitive
// labels and household notes stay hidden unless this is on, so the screen can
// be shared. Per-device, off by default.

import { readonly, ref, watch } from 'vue';

const STORAGE_KEY = 'showSensitive';

function initial(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

const show = ref(initial());

watch(show, (v) => {
  try {
    if (v) localStorage.setItem(STORAGE_KEY, 'on');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
});

export function useSensitive() {
  return { show: readonly(show), toggle: () => (show.value = !show.value) };
}
