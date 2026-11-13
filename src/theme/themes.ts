/**
 * 화면 테마 정의.
 * 색은 "R G B" 숫자 세 개로 적습니다 (Tailwind 가 투명도를 붙일 수 있는 형식).
 * 화면 코드에서는 색 이름 대신 역할 이름을 씁니다:
 *   bg-bg 배경 · bg-card 카드/입력창 · bg-field 옅은 채움 · border-line 테두리
 *   text-fg 본문 · text-muted 보조 글자 · text-subtle 흐린 글자 · brand-* 강조색
 * 테마를 추가하려면 아래 THEMES 에 항목을 하나 더 넣으면 됩니다.
 */
export type ThemeId = 'white' | 'dark' | 'blackpink';

type Palette = {
  bg: string;
  card: string;
  field: string;
  line: string;
  fg: string;
  muted: string;
  subtle: string;
  /** 강조색 단계. 500 이 버튼 색, 600/700 은 글자·눌림 색, 50/100/300 은 옅은 배경 */
  brand50: string;
  brand100: string;
  brand300: string;
  brand500: string;
  brand600: string;
  brand700: string;
};

export type Theme = {
  id: ThemeId;
  label: string;
  description: string;
  /** 어두운 테마면 상단 상태바 글자를 밝게 합니다 */
  dark: boolean;
  palette: Palette;
};

export const THEMES: Theme[] = [
  {
    id: 'white',
    label: '화이트',
    description: '밝고 깔끔한 기본 화면',
    dark: false,
    palette: {
      bg: '250 250 250',
      card: '255 255 255',
      field: '240 240 240',
      line: '214 214 214',
      fg: '23 23 23',
      muted: '95 95 95',
      // 흐린 글자도 흰 배경에서 읽을 수 있는 진하기 (대비 약 4.4:1)
      subtle: '118 118 118',
      brand50: '255 241 243',
      brand100: '255 224 229',
      brand300: '255 154 169',
      brand500: '244 63 94',
      brand600: '225 29 72',
      brand700: '190 18 60',
    },
  },
  {
    id: 'dark',
    label: '다크',
    description: '눈이 편한 어두운 화면',
    dark: true,
    palette: {
      bg: '17 17 19',
      card: '30 30 34',
      field: '44 44 50',
      line: '62 62 70',
      fg: '245 245 245',
      muted: '184 184 192',
      subtle: '128 128 138',
      brand50: '58 24 33',
      brand100: '78 30 43',
      brand300: '150 60 80',
      brand500: '244 63 94',
      brand600: '251 113 133',
      brand700: '253 164 175',
    },
  },
  {
    id: 'blackpink',
    label: '블랙 & 핑크',
    description: '검정 바탕에 선명한 핑크',
    dark: true,
    palette: {
      bg: '0 0 0',
      card: '20 18 20',
      field: '36 28 33',
      line: '70 42 56',
      fg: '255 255 255',
      muted: '205 190 198',
      subtle: '140 124 132',
      brand50: '56 10 34',
      brand100: '82 14 50',
      brand300: '170 40 105',
      brand500: '255 46 147',
      brand600: '255 110 180',
      brand700: '255 165 208',
    },
  },
];

export const DEFAULT_THEME: ThemeId = 'white';

export function getTheme(id: ThemeId): Theme {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
}

/** "244 63 94" → "#f43f5e" (아이콘·로딩 표시처럼 클래스로 색을 줄 수 없는 곳에 사용) */
export function hex(rgb: string): string {
  return `#${rgb
    .split(' ')
    .map((n) => Number(n).toString(16).padStart(2, '0'))
    .join('')}`;
}

/** Tailwind 클래스가 읽는 CSS 변수 묶음 */
export function themeVariables(theme: Theme): Record<string, string> {
  const p = theme.palette;
  return {
    '--c-bg': p.bg,
    '--c-card': p.card,
    '--c-field': p.field,
    '--c-line': p.line,
    '--c-fg': p.fg,
    '--c-muted': p.muted,
    '--c-subtle': p.subtle,
    '--c-brand-50': p.brand50,
    '--c-brand-100': p.brand100,
    '--c-brand-300': p.brand300,
    '--c-brand-500': p.brand500,
    '--c-brand-600': p.brand600,
    '--c-brand-700': p.brand700,
  };
}
