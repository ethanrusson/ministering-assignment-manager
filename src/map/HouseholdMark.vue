<script setup lang="ts">
// One household's square: district colour, a dot when an elder lives here,
// up to two label dots, and the selection ring.

export interface Mark {
  /** District colour family, or null when the household's companionship has none. */
  family: string | null;
  hasCompanionship: boolean;
  /** 'minister': an elder with a companionship lives here; 'free': one without. */
  elder: 'minister' | 'free' | null;
  labelColors: string[];
  /** Overrides the district colors ("Color by" status or a label): CSS colors. */
  paint?: { fill: string; border: string };
}

const props = defineProps<{ mark: Mark; size: number; selected?: boolean }>();

const MAX_LABEL_DOTS = 2;

const v = (name: string) => `rgb(var(--c-${name}))`;

const style = () => {
  const f = props.mark.family;
  const paint = props.mark.paint;
  return {
    width: `${props.size}px`,
    height: `${props.size}px`,
    borderWidth: props.size > 16 ? '2px' : '1.5px',
    borderStyle: f || paint ? 'solid' : 'dashed',
    borderColor: paint?.border ?? v(f ? `${f}-500` : 'stone-500'),
    backgroundColor:
      paint?.fill ??
      v(props.mark.hasCompanionship ? (f ? `${f}-200` : 'stone-200') : 'white'),
    boxShadow: props.selected
      ? `0 0 0 2px ${v('white')}, 0 0 0 4px ${v('stone-900')}`
      : undefined,
  };
};
</script>

<template>
  <span class="relative block shrink-0 rounded-[5px]" :style="style()">
    <span
      v-if="mark.elder"
      class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
      :class="mark.elder === 'free' ? 'bg-red-600' : 'bg-stone-800'"
      :style="{ width: `${Math.round(size * 0.36)}px`, height: `${Math.round(size * 0.36)}px` }"
    />
    <span
      v-if="mark.labelColors.length"
      class="absolute -right-[7px] -top-[7px] flex items-center gap-px"
    >
      <span
        v-for="(c, i) in mark.labelColors.slice(0, MAX_LABEL_DOTS)"
        :key="i"
        class="h-[9px] w-[9px] rounded-full ring-[1.5px] ring-white"
        :style="{ backgroundColor: c }"
      />
      <span
        v-if="mark.labelColors.length > MAX_LABEL_DOTS"
        class="rounded-full bg-white px-0.5 text-[8px] font-semibold leading-[9px] text-stone-600"
      >
        +{{ mark.labelColors.length - MAX_LABEL_DOTS }}
      </span>
    </span>
  </span>
</template>
