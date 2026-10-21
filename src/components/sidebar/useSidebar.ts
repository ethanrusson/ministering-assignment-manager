// Whether the left sidebar panel is open. Shared so views that sit beside it
// (the card grid) can keep their content clear of the overlay.

import { ref } from 'vue';

// The panel is a 320px overlay, which covers a phone screen whole — start it
// collapsed there so the canvas is what you land on. innerWidth reads 0 in
// some offscreen/headless contexts; treat an unknown width as desktop.
const isNarrowScreen =
  typeof window !== 'undefined' &&
  window.innerWidth > 0 &&
  window.innerWidth < 640;

const open = ref(!isNarrowScreen);

export function useSidebar() {
  return { open };
}
