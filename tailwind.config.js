/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // The whole app draws its colour from these names - roughly 700 class
        // uses across the pages - so the palette is changed here rather than in
        // the pages themselves.
        //
        // Values come from the owner's colour system: Brand Dark #0F1117,
        // Brand Gray #6B7280, Brand Light #F5F6F8, with Success/Error/Info at
        // #22C55E / #EF4444 / #3B82F6.

        // The dark frame the app sits inside.
        shell: '#040018',

        // Near-black ramp. `navy` keeps its name because 24 places already use
        // it; only the values move onto the system's Brand Dark.
        navy: {
          900: '#0F1117',
          800: '#111827',
          700: '#374151',
          600: '#4B5563',
        },
        ink: {
          DEFAULT: '#0F1117',
          soft: '#111827',
        },
        // The system's greys under their own names, for new work.
        neutral: {
          900: '#111827',
          700: '#374151',
          500: '#6B7280',
          300: '#D1D5DB',
          200: '#E5E7EB',
          100: '#F3F4F6',
          50: '#F5F6F8',
        },
        // Financial semantics: money in / money out / awaiting. `orange` keeps
        // its name so the 21 badge-orange call sites need no edit, but it now
        // resolves to the system's Info blue - the palette has no orange, and
        // "pending" is information rather than a warning.
        brand: {
          green: '#22C55E',
          'green-light': '#4ADE80',
          'green-soft': '#F0FDF4',
          red: '#EF4444',
          'red-soft': '#FEF2F2',
          blue: '#3B82F6',
          'blue-soft': '#EFF6FF',
          orange: '#3B82F6',
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
