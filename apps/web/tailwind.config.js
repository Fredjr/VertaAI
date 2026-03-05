/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Gray palette remapped to match the marketing site's dark color tokens.
        // Product pages use bg-gray-900, bg-gray-800, border-gray-700 etc.
        // These now resolve to the same values as --bg, --surface, --surface2, --border.
        gray: {
          50:  '#e8eaf0',
          100: '#d0d4e0',
          200: '#a8b2c8',
          300: '#8090a8',
          400: '#60708a',
          500: '#4a5570',
          600: '#2a3347',
          700: '#1f2533',
          800: '#181c24',
          900: '#111318',
          950: '#0a0c0f',
        },
        // Primary accent remapped from sky-blue to indigo (matches --accent / --accent2).
        primary: {
          50:  '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
      },
    },
  },
  plugins: [],
};
