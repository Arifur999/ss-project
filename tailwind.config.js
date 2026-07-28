/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Neutral near-black ramp (was bluish "navy"). Re-pointed so every dark
        // surface/heading reads as monochrome to match the black/white/grey
        // reference. `ink` is the primary near-black accent.
        navy: {
          900: '#0b0b0f',
          800: '#111318',
          700: '#1f2430',
          600: '#2b3140',
        },
        ink: {
          DEFAULT: '#0b0b0f',
          soft: '#111318',
        },
        // brand green/red stay as financial semantics (money in / money out,
        // success / danger) - deliberately unchanged.
        brand: {
          green: '#1D9E75',
          'green-light': '#22c55e',
          red: '#E24B4A',
          orange: '#f59e0b',
        }
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans Bengali', 'system-ui', 'sans-serif'],
        bengali: ['Noto Sans Bengali', 'Inter', 'system-ui', 'sans-serif'],
        numeric: ['Inter', 'Noto Sans Bengali', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
