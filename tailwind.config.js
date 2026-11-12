/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  // 웹 개발 서버에서 'Cannot manually set color scheme' 오류를 막기 위해 'class' 방식을 씁니다.
  // (기본값 'media' 는 NativeWind 웹 런타임과 충돌). 다크 모드 디자인은 아직 없습니다.
  darkMode: 'class',
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
