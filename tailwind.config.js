/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}', './shared/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      borderWidth: {
        3: 'var(--brutal-border-width, 1px)',
      },
      borderRadius: {
        brutal: 'var(--brutal-radius, 0px)',
      },
      colors: {
        'brutal-bg': 'var(--brutal-bg, #fbf7ee)',
        'brutal-fg': 'var(--brutal-fg, #1a1714)',
        'brutal-primary': 'var(--brutal-primary, #c23b1a)',
        'brutal-secondary': 'var(--brutal-secondary, #2f6b45)',
        'brutal-accent': 'var(--brutal-accent, #c4922a)',
        'brutal-destructive': 'var(--brutal-destructive, #9b2f2f)',
        'brutal-success': 'var(--brutal-success, #2f6b45)',
        'brutal-muted': 'var(--brutal-muted, #e8dfd0)',
        'brutal-ring': 'var(--brutal-ring, #c23b1a)',
      },
      boxShadow: {
        brutal: 'none',
        'brutal-sm': 'none',
        'brutal-lg': 'none',
        'brutal-xl': 'none',
      },
    },
  },
  corePlugins: {
    preflight: false,
  },
  plugins: [],
}
