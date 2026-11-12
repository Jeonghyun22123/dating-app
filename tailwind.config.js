/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // 브랜드 컬러 (독자 브랜드 — 추후 디자인 확정 시 교체)
        brand: {
          50: '#fff1f3',
          100: '#ffe0e5',
          300: '#ff9aa9',
          500: '#f43f5e',
          600: '#e11d48',
          700: '#be123c',
        },
      },
    },
  },
  plugins: [],
};
