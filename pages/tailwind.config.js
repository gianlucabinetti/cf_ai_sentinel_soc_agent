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
        'sentinel': {
          bg: '#0a0e1a',
          panel: '#0f1419',
          border: '#1e293b',
          accent: '#00ff41',
          'accent-dim': '#00cc33',
          danger: '#ef4444',
          warning: '#f59e0b',
          success: '#10b981',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Courier New', 'monospace'],
      }
    },
  },
  plugins: [],
}
