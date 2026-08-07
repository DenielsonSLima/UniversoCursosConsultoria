/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './App.tsx',
    './index.tsx',
    './lib/**/*.{js,ts,jsx,tsx}',
    './modules/**/*.{js,ts,jsx,tsx}',
  ],
  safelist: [
    {
      pattern: /^(bg|text|border)-(blue|emerald|amber|rose|purple|violet|indigo|cyan|teal|orange|slate)-(50|100|200|500|600|700)$/,
      variants: ['hover'],
    },
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
