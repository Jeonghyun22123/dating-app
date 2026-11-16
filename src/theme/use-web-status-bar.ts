import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useThemeColors } from './theme-view';

const BACKDROP_ID = 'status-bar-backdrop';

/**
 * 웹(특히 홈 화면에 추가한 아이폰 웹앱)에서 맨 위 시계·배터리 줄의 색을 테마에 맞춥니다.
 *
 * - iOS 는 +html.tsx 의 "black-translucent" 설정으로 시계 줄을 투명하게 두고 화면을 그 뒤까지 그립니다.
 *   이때 시계 글자는 항상 흰색이라, 시계 줄 높이만큼 색 띠를 깔아 둡니다.
 *   다크·블랙핑크 테마는 배경색, 화이트 테마는 흰 글자가 보이도록 브랜드 색입니다.
 * - 안드로이드 크롬과 브라우저 탭 색(theme-color)도 같은 색으로 바꿉니다.
 * - 띠는 팝업보다도 위에 오도록 문서(body)에 직접 붙입니다.
 */
export function useWebStatusBar() {
  const colors = useThemeColors();
  const bar = colors.dark ? colors.bg : colors.brand;
  const background = colors.bg;

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    // 화면 가장자리(스크롤 끝, 시계 줄 뒤)에서 흰 바탕이 비치지 않게 합니다.
    document.documentElement.style.backgroundColor = background;
    document.body.style.backgroundColor = background;

    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = bar;

    let backdrop = document.getElementById(BACKDROP_ID);
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = BACKDROP_ID;
      backdrop.setAttribute('aria-hidden', 'true');
      Object.assign(backdrop.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        right: '0',
        // 노치·다이내믹 아일랜드가 있는 기기에서만 높이가 생깁니다 (일반 브라우저에서는 0).
        height: 'env(safe-area-inset-top)',
        zIndex: '2147483647',
        pointerEvents: 'none',
      });
      document.body.appendChild(backdrop);
    }
    backdrop.style.backgroundColor = bar;
  }, [bar, background]);
}
