/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          900: '#0f1f35',
          800: '#1D3557',
          700: '#243f66',
          600: '#2c4f80',
        },
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
