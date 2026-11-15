// The fixed label palette (docs/ward-map-prd.md, Checkpoint 3, answer 8).
// Kept clear of the district families (blue, amber, violet, teal, rose, lime,
// cyan, orange) and the red used for warnings. Migration 0007 moved existing
// labels to the nearest of these; keep the two lists in step.

export const LABEL_PALETTE = [
  { name: 'Pink', hex: '#db2777' },
  { name: 'Fuchsia', hex: '#a21caf' },
  { name: 'Sky', hex: '#0284c7' },
  { name: 'Emerald', hex: '#047857' },
  { name: 'Indigo', hex: '#4338ca' },
  { name: 'Yellow', hex: '#ca8a04' },
  { name: 'Stone', hex: '#57534e' },
  { name: 'Brown', hex: '#7c2d12' },
] as const;

/**
 * Chip colors for a label: a tint of its color with the theme's text color, so
 * every palette color reads in both light and dark mode. `on: false` is an
 * unselected chip in a picker or filter.
 */
export function labelChipStyle(color: string, on = true) {
  return on
    ? { backgroundColor: `${color}33`, borderColor: color, color: 'rgb(var(--c-stone-900))' }
    : { borderColor: 'rgb(var(--c-stone-200))', color: 'rgb(var(--c-stone-600))' };
}
