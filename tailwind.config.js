/** 색은 src/theme/themes.ts 의 테마가 정하는 CSS 변수를 읽습니다 (기본값은 src/global.css). */
const themed = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  // 웹 개발 서버에서 'Cannot manually set color scheme' 오류를 막기 위해 'class' 방식을 씁니다.
  // (기본값 'media' 는 NativeWind 웹 런타임과 충돌). 테마는 다크 모드 클래스가 아니라 CSS 변수로 바꿉니다.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 역할 이름으로 쓰는 색 (테마에 따라 바뀜)
        bg: themed('bg'), // 화면 배경
        card: themed('card'), // 카드, 입력창
        field: themed('field'), // 옅은 채움 (사진 자리, 누른 상태)
        line: themed('line'), // 테두리
        fg: themed('fg'), // 본문 글자
        muted: themed('muted'), // 보조 글자
        subtle: themed('subtle'), // 흐린 글자
        // 강조색 (테마에 따라 바뀜)
        brand: {
          50: themed('brand-50'),
          100: themed('brand-100'),
          300: themed('brand-300'),
          500: themed('brand-500'),
          600: themed('brand-600'),
          700: themed('brand-700'),
        },
      },
    },
  },
  plugins: [],
};
