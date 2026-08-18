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
        // Card surface and its border, from the owner's reference. The page
        // behind them is plain white, so the cards are what separates content
        // from background rather than a tinted page doing it.
        //
        // #F4F4F4 is the owner's value. It went through #F7F7F9 (so close to
        // white that a card only showed where its border fell) and #EEF0F6
        // (a blue-grey, further off white but reading as tinted rather than
        // neutral) before landing here.
        //
        // The border stays darker than the fill, which is the one thing it
        // must be: #F4F4F4 was tried AS the border once and, being lighter
        // than the card it edged, drew a pale halo instead of an edge.
        surface: {
          DEFAULT: '#F4F4F4',
          border: '#E2E6EF',
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
        // Financial semantics: money in / money out / still waiting. `orange`
        // is the awaiting colour and every badge-orange call site draws from
        // it, so pending reads the same wherever it appears. It was pointed at
        // Info blue for a while; amber is what the owner wants and is what the
        // name says.
        brand: {
          green: '#22C55E',
          'green-light': '#4ADE80',
          'green-soft': '#F0FDF4',
          red: '#EF4444',
          // For red type on a near-black ground - the totals bar. #EF4444 is
          // picked to read on white and goes muddy there.
          'red-light': '#FCA5A5',
          'red-soft': '#FEF2F2',
          blue: '#3B82F6',
          'blue-soft': '#EFF6FF',
          orange: '#D97706',
          'orange-soft': '#FEF3C7',
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
