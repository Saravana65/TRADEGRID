/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#070A12',
        surface: {
          DEFAULT: '#0D1322',
          card: '#0F172A',
          hover: '#17223B',
          elevated: '#1E293B',
          input: '#0A0F1D',
        },
        card: '#0D1322',
        'card-border': '#1A253C',
        'border-subtle': '#243352',
        brand: {
          cyan: '#06B6D4',
          cyanGlow: '#0891B2',
          blue: '#3B82F6',
          indigo: '#6366F1',
          violet: '#8B5CF6',
        },
        trade: {
          gain: '#10B981',
          gainBg: 'rgba(16, 185, 129, 0.12)',
          loss: '#EF4444',
          lossBg: 'rgba(239, 68, 68, 0.12)',
          neutral: '#94A3B8',
          warn: '#F59E0B',
          warnBg: 'rgba(245, 158, 11, 0.12)',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      boxShadow: {
        'glow-cyan': '0 0 20px -5px rgba(6, 182, 212, 0.35)',
        'glow-gain': '0 0 20px -5px rgba(16, 185, 129, 0.35)',
        'glow-loss': '0 0 20px -5px rgba(239, 68, 68, 0.35)',
        'card-glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
      },
    },
  },
  plugins: [],
}
