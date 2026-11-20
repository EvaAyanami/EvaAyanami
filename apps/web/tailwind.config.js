/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Nunito', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        brand: {
          50: '#eef4ff', 100: '#dbe6ff', 200: '#bfd3ff', 300: '#93b5ff', 400: '#5f8cfb',
          500: '#3b6cf6', 600: '#2f55e0', 700: '#2643b8', 800: '#243b91', 900: '#223672', 950: '#141f44',
        },
        cyan: { 300: '#67e8f9', 400: '#22d3ee', 500: '#06b6d4' },
        violet: { 300: '#c4b5fd', 400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed' },
        ink: {
          50: '#f6f8fc', 100: '#eef1f8', 200: '#dfe4f0', 300: '#c3cbe0', 400: '#8f9bb8', 500: '#64708f',
          600: '#4a5470', 700: '#343c55', 800: '#1f2538', 850: '#191e2f', 900: '#131726', 950: '#0b0e18',
        },
      },
      borderRadius: { '4xl': '2rem' },
      boxShadow: {
        soft: '0 2px 10px -2px rgb(30 50 120 / 0.10), 0 1px 3px rgb(30 50 120 / 0.06)',
        pop: '0 4px 0 0 rgb(0 0 0 / 0.12)',
        glow: '0 0 0 4px rgb(59 108 246 / 0.25)',
      },
      keyframes: {
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        shake: { '0%,100%': { transform: 'translateX(0)' }, '25%': { transform: 'translateX(-6px)' }, '75%': { transform: 'translateX(6px)' } },
      },
      animation: { float: 'float 4s ease-in-out infinite', shake: 'shake 0.35s ease-in-out' },
    },
  },
  plugins: [],
};
