import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useThemeColors } from './theme-view';

/**
 * 웹(특히 홈 화면에 추가한 웹앱)에서 맨 위 시계·배터리 줄과 페이지 바탕을 테마 배경색에 맞춥니다.
 *
 * - iOS 는 +html.tsx 의 "black-translucent" 설정으로 시계 줄을 투명하게 두고 화면을 그 뒤까지 그립니다.
 *   시계 글자색은 iOS 가 바탕 밝기에 맞춰 알아서 바꿉니다 (실기기 확인).
 * - 안드로이드 크롬과 브라우저 탭 색(theme-color)도 같은 배경색으로 바꿉니다.
 */
export function useWebStatusBar() {
  const { bg } = useThemeColors();

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    // 화면 가장자리(스크롤 끝, 시계 줄 뒤)에서 다른 바탕이 비치지 않게 합니다.
    document.documentElement.style.backgroundColor = bg;
    document.body.style.backgroundColor = bg;

    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = bg;
  }, [bg]);
}
