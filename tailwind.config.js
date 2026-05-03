/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './visualizer.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:        '#000000',
        panel:     '#020503',
        panelLite: '#04090a',
        lcd:       '#020a05',
        phosphor: {
          DEFAULT: '#00FF88',
          bright:  '#7CFF6B',
          dim:     '#1f5e3a',
          faint:   'rgba(0,255,136,0.20)',
        },
        term: {
          cyan:    '#00E5FF',
          amber:   '#FFB000',
          magenta: '#FF2E9A',
          red:     '#FF3030',
        },
        ink: {
          DEFAULT: '#9bf5b8',
          dim:     'rgba(155,245,184,0.55)',
          faint:   'rgba(155,245,184,0.30)',
        },
        rule:    'rgba(0,255,136,0.18)',
        ruleDim: 'rgba(0,255,136,0.08)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
        term: ['"VT323"', 'monospace'],
        lcd:  ['"Share Tech Mono"', '"VT323"', 'monospace'],
      },
    },
  },
  plugins: [],
}
