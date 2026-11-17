import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * 아이폰 "홈 화면에 추가" 앱(웹)의 화면 높이 보정.
 *
 * 일부 iOS 에서 홈 화면 앱을 열면 화면 높이가 시계 줄만큼 짧게 잡히고(innerHeight 가 작음)
 * 시계 줄 영역 정보(safe-area-inset-top)가 0 으로 나와서, 화면 전체가 위로 붙고 아래에 빈 띠가 생깁니다.
 * 그런 상태가 감지될 때만 앱 영역(#root)을 실제 화면 높이로 늘리고 위쪽을 시계 줄 높이만큼 띄웁니다.
 * 정상인 기기에서는 아무것도 바꾸지 않습니다.
 */

type ViewportInfo = {
  standalone: boolean;
  screenHeight: number;
  innerHeight: number;
  clientHeight: number;
  visualHeight: number | null;
  visualOffsetTop: number | null;
  scrollY: number;
  envTop: number;
  envBottom: number;
  rootTop: number | null;
  rootHeight: number | null;
  fixApplied: boolean;
  userAgent: string;
};

const PROBE_ID = 'safe-area-probe';

function readEnvInsets() {
  let probe = document.getElementById(PROBE_ID);
  if (!probe) {
    probe = document.createElement('div');
    probe.id = PROBE_ID;
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText =
      'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';
    document.body.appendChild(probe);
  }
  const style = getComputedStyle(probe);
  return { top: parseFloat(style.paddingTop) || 0, bottom: parseFloat(style.paddingBottom) || 0 };
}

const isStandaloneIos = () =>
  typeof navigator !== 'undefined' && (navigator as { standalone?: boolean }).standalone === true;

let fixApplied = false;

/** 진단 화면에서 보여줄 현재 값 */
export function readViewportInfo(): ViewportInfo | null {
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
    fixApplied,
    userAgent: navigator.userAgent,
  };
}

function apply() {
  if (!isStandaloneIos()) return;
  const root = document.getElementById('root');
  if (!root) return;
  const env = readEnvInsets();
  // 세로 화면 기준: 화면 높이와 보이는 높이의 차이가 곧 잘못 빠진 시계 줄 높이입니다.
  const gap = window.screen.height - window.innerHeight;
  const broken = env.top < 1 && gap > 20 && gap < 120;
  if (broken) {
    Object.assign(root.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      right: '0',
      height: `${window.screen.height}px`,
      paddingTop: `${gap}px`,
      boxSizing: 'border-box',
    });
    fixApplied = true;
  } else if (fixApplied) {
    Object.assign(root.style, {
      position: '',
      top: '',
      left: '',
      right: '',
      height: '',
      paddingTop: '',
      boxSizing: '',
    });
    fixApplied = false;
  }
  // 앱은 문서 자체를 스크롤하지 않습니다. 입력 중이 아닐 때 밀려 있으면 제자리로 돌립니다.
  const typing = document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
  if (window.scrollY !== 0 && !typing) window.scrollTo(0, 0);
}

export function useIosViewportFix() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !isStandaloneIos()) return;
    apply();
    // iOS 는 처음 몇 백 ms 동안 화면 크기 값을 바꾸기도 해서 몇 번 더 확인합니다.
    const timers = [100, 400, 1000, 2500].map((ms) => setTimeout(apply, ms));
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
    window.visualViewport?.addEventListener('resize', apply);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
      window.visualViewport?.removeEventListener('resize', apply);
    };
  }, []);
}
