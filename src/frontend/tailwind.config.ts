import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        // Gold palette
        gold: {
          50:  '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
          950: '#451a03',
        },
        // Chart background scale
        chart: {
          bg:      '#0f0f14',
          surface: '#14141a',
          border:  '#1e1e2a',
          muted:   '#2a2a38',
        },
        // Signal colors
        signal: {
          buy:    '#10b981',  // emerald-500
          sell:   '#ef4444',  // red-500
          neutral:'#6b7280',  // gray-500
        },
      },
      animation: {
        'pulse-slow':  'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'fade-in':     'fadeIn 0.3s ease-out',
        'slide-up':    'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn:  { from: { opacity: '0' },                  to: { opacity: '1' } },
        slideUp: { from: { transform: 'translateY(8px)', opacity: '0' },
                   to:   { transform: 'translateY(0)',    opacity: '1' } },
      },
      boxShadow: {
        'gold-glow': '0 0 20px rgba(251,191,36,0.15)',
        'signal':    '0 4px 20px rgba(0,0,0,0.4)',
      },
    },
  },
  plugins: [],
}

export default config
