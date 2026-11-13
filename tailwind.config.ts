import type { Config } from 'tailwindcss';

// Brand colors are estimates taken from the PHINMA Education slides and prototype.
// Replace them with the official values once PHINMA provides its brand guide.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './features/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'] },
      colors: {
        navy: { DEFAULT: '#17285C', dark: '#0F1B42', tint: '#E6ECF8' },
        brand: { green: '#1F7A3D', gold: '#F2B800' },
        ink: { DEFAULT: '#1A2238', muted: '#5B6478', soft: '#33405C' },
        surface: { bg: '#F5F6F8', border: '#DDE1E9', line: '#EDEFF4', soft: '#EEF1F7' },
        zone: {
          green: '#23744A', 'green-bg': '#DDF1E4', 'green-fg': '#14532D',
          yellow: '#F2C230', 'yellow-bg': '#FBEBB5', 'yellow-fg': '#5C4300',
          red: '#B3261E', 'red-bg': '#F8D4D4', 'red-fg': '#8A1C1C',
        },
      },
    },
  },
  plugins: [],
};
export default config;
