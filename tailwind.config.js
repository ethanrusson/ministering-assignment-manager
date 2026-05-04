/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        warn: {
          50: '#fffbeb',
          200: '#fde68a',
          400: '#fbbf24',
          600: '#d97706',
        },
        danger: {
          100: '#fee2e2',
          400: '#f87171',
          600: '#dc2626',
        },
      },
    },
  },
  plugins: [],
};
