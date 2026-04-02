/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // DimRisk brand tokens — use these in all components
        // Background hierarchy (dark mode):
        // bg-gray-950  → page background
        // bg-gray-900  → card / sidebar background
        // bg-gray-800  → table row / input background
        // bg-gray-700  → hover states
        //
        // Accent: blue-500 (primary action), blue-400 (hover)
        // Success: emerald-500
        // Warning: amber-400
        // Danger/flag: rose-500
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
