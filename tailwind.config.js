/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}', './shared/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      borderWidth: {
        3: 'var(--brutal-border-width, 3px)',
      },
      borderRadius: {
        brutal: 'var(--brutal-radius, 0px)',
      },
      colors: {
        'brutal-bg': 'var(--brutal-bg, #ffffff)',
        'brutal-fg': 'var(--brutal-fg, #000000)',
        'brutal-primary': 'var(--brutal-primary, #FF6B6B)',
        'brutal-secondary': 'var(--brutal-secondary, #4ECDC4)',
        'brutal-accent': 'var(--brutal-accent, #FFE66D)',
        'brutal-destructive': 'var(--brutal-destructive, #EF476F)',
        'brutal-success': 'var(--brutal-success, #7FB069)',
        'brutal-muted': 'var(--brutal-muted, #f3f4f6)',
        'brutal-ring': 'var(--brutal-ring, #000000)',
      },
      boxShadow: {
        brutal:
          'var(--brutal-shadow-offset-x, 4px) var(--brutal-shadow-offset-y, 4px) 0px 0px var(--brutal-shadow-color, #000000)',
        'brutal-sm':
          'calc(var(--brutal-shadow-offset-x, 4px) / 2) calc(var(--brutal-shadow-offset-y, 4px) / 2) 0px 0px var(--brutal-shadow-color, #000000)',
        'brutal-lg':
          'calc(var(--brutal-shadow-offset-x, 4px) * 1.5) calc(var(--brutal-shadow-offset-y, 4px) * 1.5) 0px 0px var(--brutal-shadow-color, #000000)',
        'brutal-xl':
          'calc(var(--brutal-shadow-offset-x, 4px) * 2) calc(var(--brutal-shadow-offset-y, 4px) * 2) 0px 0px var(--brutal-shadow-color, #000000)',
      },
    },
  },
  corePlugins: {
    // 关闭 preflight：保护现有手写样式（styles.css）不被重置
    preflight: false,
  },
  plugins: [],
}
