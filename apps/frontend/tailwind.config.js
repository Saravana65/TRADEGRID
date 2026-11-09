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
        background: 'var(--bg-app)',
        surface: {
          DEFAULT: 'var(--bg-surface)',
          card: 'var(--bg-card)',
          hover: 'var(--bg-surface-hover)',
          elevated: 'var(--bg-surface-elevated)',
          input: 'var(--bg-surface-input)',
        },
        card: 'var(--bg-card)',
        'card-border': 'var(--border-card)',
        'border-subtle': 'var(--border-subtle)',
        brand: {
          cyan: 'var(--brand-cyan)',
          cyanGlow: 'var(--brand-cyan-glow)',
          blue: 'var(--brand-blue)',
        },
        trade: {
          gain: 'var(--trade-gain)',
          gainBg: 'var(--trade-gain-bg)',
          loss: 'var(--trade-loss)',
          lossBg: 'var(--trade-loss-bg)',
          neutral: '#94A3B8',
          warn: '#F59E0B',
          warnBg: 'rgba(245, 158, 11, 0.12)',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'card-default': 'var(--card-shadow)',
        'card-elevated': 'var(--card-shadow-hover)',
        'glow-cyan': '0 0 20px -5px rgba(6, 182, 212, 0.35)',
        'glow-gain': '0 0 20px -5px rgba(16, 185, 129, 0.35)',
        'glow-loss': '0 0 20px -5px rgba(239, 68, 68, 0.35)',
      },
    },
  },
  plugins: [],
}
