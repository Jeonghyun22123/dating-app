import { useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaFrameContext, SafeAreaInsetsContext, type EdgeInsets } from 'react-native-safe-area-context';

/**
 * 웹(특히 아이폰 "홈 화면에 추가" 앱)의 화면 영역 보정.
 *
 * 실기기 진단(iOS 26, 다이내믹 아일랜드 기종) 결과:
 * - 시계 줄·홈 바 여백(env(safe-area-inset-*))은 59 / 34 로 정상인데, 안전 영역 라이브러리가 0 / 0 으로 읽어
 *   화면 맨 위가 시계와 겹치고 탭 바가 홈 바에 붙었습니다.
 * - 보이는 높이(innerHeight)가 화면 높이보다 시계 줄만큼(59) 작게 잡혀 아래에 빈 띠가 생겼습니다.
 * 여백은 CSS 값을 직접 읽어 앱 전체에 알려줍니다 (정상인 기기에서는 값이 그대로라 달라지지 않음).
 * 높이 문제는 +html.tsx 에서 시계 줄을 "black"(불투명)으로 두어 피합니다. 보이는 영역 밖으로 앱을 늘리면
 * iOS 가 잘라 버려서(실기기 확인) 늘리는 방식은 쓰지 않습니다.
 */

const PROBE_ID = 'safe-area-probe';
const ZERO: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

function readEnvInsets(): EdgeInsets {
  let probe = document.getElementById(PROBE_ID);
  if (!probe) {
    probe = document.createElement('div');
    probe.id = PROBE_ID;
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText =
      'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.appendChild(probe);
  }
  const s = getComputedStyle(probe);
  return {
    top: parseFloat(s.paddingTop) || 0,
    right: parseFloat(s.paddingRight) || 0,
    bottom: parseFloat(s.paddingBottom) || 0,
    left: parseFloat(s.paddingLeft) || 0,
  };
}

const isStandaloneIos = () =>
  typeof navigator !== 'undefined' && (navigator as { standalone?: boolean }).standalone === true;

/** 앱은 문서 자체를 스크롤하지 않습니다. 입력 중이 아닐 때 밀려 있으면 제자리로 돌립니다. */
function resetScroll() {
  const typing = document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
  if (window.scrollY !== 0 && !typing) window.scrollTo(0, 0);
}

function useWebInsets() {
  const [insets, setInsets] = useState<EdgeInsets | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const update = () => {
      const next = readEnvInsets();
      resetScroll();
      setInsets((prev) =>
        prev &&
        prev.top === next.top &&
        prev.bottom === next.bottom &&
        prev.left === next.left &&
        prev.right === next.right
          ? prev
          : next,
      );
    };
    update();
    // iOS 는 처음 몇 초 동안 값을 바꾸기도 해서 몇 번 더 확인합니다.
    const timers = [100, 400, 1000, 2500].map((ms) => setTimeout(update, ms));
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);
  return insets;
}

/**
 * 웹에서는 안전 영역 여백을 CSS 값으로 직접 읽어 앱 전체(SafeAreaView, 탭 바 등)에 알려줍니다.
 * 휴대폰 앱(네이티브)에서는 아무것도 하지 않습니다.
 */
export function WebSafeArea({ children }: { children: ReactNode }) {
  const insets = useWebInsets();
  if (Platform.OS !== 'web') return <>{children}</>;
  // 서버에서 미리 그린 화면과 구조가 같도록 처음부터 항상 감싸고, 값만 나중에 채웁니다.
  const width = typeof window === 'undefined' ? 0 : window.innerWidth;
  const height = typeof window === 'undefined' ? 0 : window.innerHeight;
  return (
    <SafeAreaFrameContext.Provider value={{ x: 0, y: 0, width, height }}>
      <SafeAreaInsetsContext.Provider value={insets ?? ZERO}>{children}</SafeAreaInsetsContext.Provider>
    </SafeAreaFrameContext.Provider>
  );
}

/** 진단 화면에서 보여줄 현재 값 */
export function readViewportInfo() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const env = readEnvInsets();
  const root = document.getElementById('root')?.getBoundingClientRect();
  return {
    standalone: isStandaloneIos(),
    screenHeight: window.screen.height,
    innerHeight: window.innerHeight,
    clientHeight: document.documentElement.clientHeight,
    visualHeight: window.visualViewport?.height ?? null,
    visualOffsetTop: window.visualViewport?.offsetTop ?? null,
    scrollY: window.scrollY,
    envTop: env.top,
    envBottom: env.bottom,
    rootTop: root ? Math.round(root.top) : null,
    rootHeight: root ? Math.round(root.height) : null,
    userAgent: navigator.userAgent,
  };
}
