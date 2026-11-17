/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#09090B',
        canvas:     '#09090B',
        surface:    '#111113',
        elevated:   '#18181B',
        border: {
          DEFAULT: '#27272A',
          active:  '#52525B',
          bright:  '#FAFAFA',
        },
        primary: {
          DEFAULT: '#FAFAFA',
          light:   '#A1A1AA',
        },
        buy:        '#34D399',
        sell:       '#F87171',
        success:    '#34D399',
        danger:     '#F87171',
        warning:    '#A1A1AA',
        text: {
          primary:   '#FAFAFA',
          secondary: '#A1A1AA',
          muted:     '#71717A',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '0.375rem',
      },
      transitionDuration: {
        DEFAULT: '100ms',
      },
      animation: {
        marquee: 'marquee 30s linear infinite',
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
    },
  },
  plugins: [],
}
