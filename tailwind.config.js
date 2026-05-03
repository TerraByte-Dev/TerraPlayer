/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './visualizer.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Remap surface tokens to Frutiger Aero navy palette (keeps all existing class names working)
        surface: {
          100: '#132b55',
          200: '#0d2040',
          300: '#0a1a33',
          400: '#061224',
        },
        // Remap accent to aqua (keeps bg-accent, text-accent, etc. working)
        accent: {
          DEFAULT: '#7fe9d0',
          dim: '#6cc5ff',
        },
        muted: '#5c7a99',
        // New Aero palette tokens
        navy: {
          900: '#061224',
          800: '#0a1a33',
          700: '#132b55',
        },
        aero: {
          sky: '#6cc5ff',
          aqua: '#7fe9d0',
          lime: '#b6f25c',
          bubble: '#c5f0ff',
        },
        ink: {
          100: '#eaf6ff',
          300: '#9fb6cc',
          500: '#5c7a99',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
