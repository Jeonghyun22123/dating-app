import { useEffect } from 'react';
import { create } from 'zustand';

/** 표지(앱을 처음 켤 때 화면을 덮는 로고 화면)를 걷어도 되는지 */
type SplashState = {
  /** 첫 화면이 준비됨 */
  ready: boolean;
  /** 표지가 완전히 사라짐 */
  done: boolean;
};

export const useSplashStore = create<SplashState>(() => ({ ready: false, done: false }));

/** 표지는 최소 이만큼 보여줍니다 (로고 애니메이션이 끝까지 보이도록). */
export const SPLASH_MIN_MS = 1500;
/** 준비가 늦어져도 이 시간이 지나면 표지를 걷습니다. */
export const SPLASH_MAX_MS = 5000;

/** 첫 화면이 다 그려졌다고 알립니다. 여러 번 불러도 됩니다. */
export function markAppReady() {
  if (!useSplashStore.getState().ready) useSplashStore.setState({ ready: true });
}

/** 화면이 나타나면 준비 완료로 알립니다 (when 이 false 인 동안은 기다립니다). */
export function useMarkAppReady(when = true) {
  useEffect(() => {
    if (when) markAppReady();
  }, [when]);
}
