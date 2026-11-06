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
        background: '#090D16',
        card: '#111827',
        'card-border': '#1F293D',
        'border-subtle': '#25334D',
        brand: {
          cyan: '#06B6D4',
          blue: '#3B82F6',
          indigo: '#6366F1',
        },
        trade: {
          gain: '#10B981',
          loss: '#EF4444',
          neutral: '#94A3B8',
          warn: '#F59E0B',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
