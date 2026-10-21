// Whether the left sidebar panel is open. Shared so views that sit beside it
// (the card grid, the floating toolbars) can keep clear of the overlay.

import { computed, ref } from 'vue';

// The panel is a 320px overlay, which covers a phone screen whole — start it
// collapsed there so the canvas is what you land on. innerWidth reads 0 in
// some offscreen/headless contexts; treat an unknown width as desktop.
const isNarrowScreen =
  typeof window !== 'undefined' &&
  window.innerWidth > 0 &&
  window.innerWidth < 640;

const open = ref(!isNarrowScreen);

// Bottom toolbars are centered with left-1/2; while the panel is open, shift
// them by half its footprint (320px + 16px margins = 352px) so they center
// over the free area. Below md the panel covers the screen, so stay put.
const toolbarCenterClass = computed(() =>
  open.value ? 'md:left-[calc(50%+176px)]' : '',
);

export function useSidebar() {
  return { open, toolbarCenterClass };
}
