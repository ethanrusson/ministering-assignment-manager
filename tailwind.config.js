import colors from 'tailwindcss/colors';

// Every colour the app uses resolves through a CSS variable, so dark mode is a
// palette swap on <html class="dark"> rather than a `dark:` variant on every
// class. Neutrals get a hand-tuned dark scale (page darkest, raised surfaces
// a step lighter, text light); accents run their scale backwards, so `-700`
// text becomes `-300`, except the pale tint steps, which become a wash of the
// accent over the dark surface (a straight swap to `-950` is too saturated for
// a whole card background).

const ACCENTS = ['red', 'orange', 'amber', 'lime', 'emerald', 'teal', 'cyan', 'blue', 'violet', 'rose'];
const STEPS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];

const DARK_NEUTRALS = {
  white: '#24211f',
  stone: {
    50: '#1c1a18',
    100: '#151312',
    200: '#33302c',
    300: '#45403b',
    400: '#78716c',
    500: '#a8a29e',
    600: '#c2bcb7',
    700: '#d6d3d1',
    800: '#e7e5e4',
    900: '#f5f5f4',
    950: '#fafaf9',
  },
  slate: {
    50: '#181b20',
    100: '#12151a',
    200: '#2d323a',
    300: '#3f4550',
    400: '#6e7787',
    500: '#a0a9b8',
    600: '#bcc4d0',
    700: '#d2d8e0',
    800: '#e4e8ee',
    900: '#f3f5f8',
    950: '#f8fafc',
  },
};

// Dark tint steps: how much of the accent's -500 to mix into the dark surface.
const DARK_TINTS = { 50: 0.12, 100: 0.2, 200: 0.32 };

// App-named roles mapped onto an accent family's steps.
const ALIASES = {
  warn: { family: 'amber', steps: ['50', '200', '400', '600'] },
  danger: { family: 'red', steps: ['100', '400', '600'] },
};

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const channels = (hex) => rgb(hex).join(' ');
const mix = (hex, base, amount) => {
  const [a, b] = [rgb(hex), rgb(base)];
  return a.map((v, i) => Math.round(b[i] + (v - b[i]) * amount)).join(' ');
};
const ref = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

const light = { white: channels('#ffffff') };
const dark = { white: channels(DARK_NEUTRALS.white) };
const palette = { white: ref('white') };

for (const family of ['stone', 'slate']) {
  palette[family] = {};
  for (const s of STEPS) {
    light[`${family}-${s}`] = channels(colors[family][s]);
    dark[`${family}-${s}`] = channels(DARK_NEUTRALS[family][s]);
    palette[family][s] = ref(`${family}-${s}`);
  }
}
for (const family of ACCENTS) {
  palette[family] = {};
  STEPS.forEach((s, i) => {
    light[`${family}-${s}`] = channels(colors[family][s]);
    dark[`${family}-${s}`] =
      s in DARK_TINTS
        ? mix(colors[family][500], DARK_NEUTRALS.white, DARK_TINTS[s])
        : channels(colors[family][STEPS[STEPS.length - 1 - i]]);
    palette[family][s] = ref(`${family}-${s}`);
  });
}
for (const [alias, { family, steps }] of Object.entries(ALIASES)) {
  palette[alias] = Object.fromEntries(steps.map((s) => [s, ref(`${family}-${s}`)]));
}

const vars = (map) => Object.fromEntries(Object.entries(map).map(([k, v]) => [`--c-${k}`, v]));

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: palette,
    },
  },
  plugins: [
    ({ addBase }) =>
      addBase({
        ':root': { ...vars(light), colorScheme: 'light' },
        ':root.dark': { ...vars(dark), colorScheme: 'dark' },
      }),
  ],
};
