/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background:  '#0B0F17',
        surface:     '#111827',
        border:      '#1E293B',
        primary: {
          DEFAULT: '#3B82F6',
          light:   '#93C5FD',
        },
        success:     '#22C55E',
        danger:      '#EF4444',
        warning:     '#F59E0B',
        text: {
          primary: '#E5E7EB',
          muted:   '#6B7280',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
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

