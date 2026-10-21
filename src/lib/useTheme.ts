// Light / dark theme. Follows the OS setting until the user picks one from the
// settings menu; picking the theme the OS already wants clears the override, so
// toggling back always returns to "follow the system". Remembered per-device.
//
// index.html applies the same rule inline before first paint to avoid a flash.

import { computed, ref } from 'vue';

const STORAGE_KEY = 'theme';

const media = window.matchMedia('(prefers-color-scheme: dark)');
const systemDark = ref(media.matches);

function readOverride(): boolean | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark') return true;
    if (saved === 'light') return false;
  } catch {
    /* private browsing / storage disabled */
  }
  return null;
}

const override = ref(readOverride());
const isDark = computed(() => override.value ?? systemDark.value);

function apply() {
  document.documentElement.classList.toggle('dark', isDark.value);
}

function toggle() {
  const next = !isDark.value;
  override.value = next === systemDark.value ? null : next;
  try {
    if (override.value === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
  } catch {
    /* noop */
  }
  apply();
}

media.addEventListener('change', (e) => {
  systemDark.value = e.matches;
  apply();
});

export function useTheme() {
  return { isDark, toggle };
}
