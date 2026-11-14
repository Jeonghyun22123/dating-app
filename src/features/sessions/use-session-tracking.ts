import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

const platform = Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web';

/**
 * 접속·체류 시간 기록 (관리자 통계용).
 * 앱이 화면에 보이면 기록을 시작하고, 다른 앱으로 가거나 탭을 숨기면 끝냅니다.
 * 시간은 서버가 서버 시각으로 계산합니다. 기록 실패는 앱 사용에 영향을 주지 않도록 무시합니다.
 */
export function useSessionTracking(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;
    let current: Promise<string | null> | null = null;

    const start = () => {
      if (current) return;
      current = Promise.resolve(supabase.rpc('start_session', { p_platform: platform }))
        .then(({ data }) => (data as string | null) ?? null)
        .catch(() => null);
    };
    const end = () => {
      const pending = current;
      current = null;
      pending?.then((id) => {
        if (id)
          supabase.rpc('end_session', { p_session: id }).then(
            () => {},
            () => {},
          );
      });
    };

    if (AppState.currentState === 'active') start();
    const subscription = AppState.addEventListener('change', (state) =>
      state === 'active' ? start() : end(),
    );
    return () => {
      subscription.remove();
      end();
    };
  }, [userId]);
}
