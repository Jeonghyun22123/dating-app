/**
 * 모먼트 로고의 선 데이터 (한 곳에서만 관리합니다).
 * 원본 그림: assets/brand/*.svg · 앱 아이콘 PNG 도 같은 모양으로 만들었습니다.
 * len 은 선 길이(펜으로 그리는 애니메이션에 사용)입니다.
 */

/** 브랜드 색 (테마별). 표지와 로고에 씁니다. */
export const BRAND = {
  white: { bg: '#fafafa', ink: '#f43f5e' },
  dark: { bg: '#111113', ink: '#f43f5e' },
  blackpink: { bg: '#000000', ink: '#ff2e93' },
} as const;

/** 모♡트 마크: 720 x 290 상자, 선 굵기 30 */
export const MARK_STROKE = 30;
export const MARK_PATHS: { d: string; len: number; heart?: 'big' | 'small' }[] = [
  { d: 'M0 270H720', len: 720 }, // 공통 밑줄 (ㅡ)
  { d: 'M44 20H166Q186 20 186 40V130Q186 150 166 150H44Q24 150 24 130V40Q24 20 44 20Z', len: 554 }, // ㅁ
  { d: 'M105 150V270', len: 120 }, // ㅗ 기둥
  { d: 'M470 270C410 270 372 246 332 210', len: 155 }, // 하트에서 밑줄로 이어지는 꼬리
  {
    d: 'M332 210C292 172 242 132 242 86C242 46 268 22 300 22C318 22 330 34 332 62C334 34 346 22 364 22C396 22 422 46 422 86C422 132 372 172 332 210',
    len: 624,
    heart: 'big',
  },
  { d: 'M690 22H530Q506 22 506 46V126Q506 150 530 150H690', len: 478 }, // ㅌ
  {
    d: 'M600 120C584 106 566 94 566 76C566 64 574 56 584 56C592 56 598 61 600 68C602 61 608 56 616 56C626 56 634 64 634 76C634 94 616 106 600 120Z',
    len: 219,
    heart: 'small',
  },
];
/** 하트가 두근거릴 때 중심점 */
export const HEART_CENTERS = { big: [332, 120], small: [600, 88] } as const;

/** MOMENT 글자: 높이 100 상자, 선 굵기 16 */
export const WORD_STROKE = 16;
export const WORD_WIDTH = 668;
export const WORD_LETTERS: { d: string; x: number; len: number }[] = [
  { d: 'M0 100V0L46 62L92 0V100', x: 0, len: 355 }, // M
  { d: 'M50 0A50 50 0 1 1 49.99 0Z', x: 122, len: 315 }, // O
  { d: 'M0 100V0L46 62L92 0V100', x: 252, len: 355 }, // M
  { d: 'M68 0H0V100H68M0 50H58', x: 374, len: 294 }, // E
  { d: 'M0 100V0L82 100V0', x: 472, len: 330 }, // N
  { d: 'M0 0H84M42 0V100', x: 584, len: 184 }, // T
];

/** 표지 그림 배치: 마크 아래에 글자 (글자 폭 = 마크의 86%) */
export const COVER = {
  viewBox: '-24 -24 768 496',
  wordScale: (720 * 0.86) / WORD_WIDTH,
  wordX: (720 - 720 * 0.86) / 2,
  wordY: 290 + 80,
};
