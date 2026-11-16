import { QueryClientProvider } from '@tanstack/react-query';
import { usePathname } from 'expo-router';
import { useEffect, type ReactNode } from 'react';

import { identifyUser, resetAnalytics, trackScreen } from '@/lib/analytics';
import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth-store';

/** Supabase 세션을 Zustand 스토어와 PostHog 식별자에 동기화합니다. */
function useAuthSync() {
  const setSession = useAuthStore((s) => s.setSession);

  useEffect(() => {
    // 구독 직후 INITIAL_SESSION 이벤트로 저장된 세션이 한 번 전달됩니다.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === 'PASSWORD_RECOVERY') useAuthStore.getState().setRecovering(true);
      if (event === 'SIGNED_OUT') useAuthStore.getState().setRecovering(false);
      if (session) {
        identifyUser(session.user.id);
        // 앱을 열거나 로그인할 때 마지막 활동 시각을 남깁니다 (관리자 통계의 '최근 활동'에 사용).
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
          supabase
            .from('profiles')
            .update({ last_active_at: new Date().toISOString() })
            .eq('id', session.user.id)
            .then(() => {});
        }
      } else if (event === 'SIGNED_OUT') {
        resetAnalytics();
      }
    });
    return () => data.subscription.unsubscribe();
  }, [setSession]);
}

/** Expo Router 경로가 바뀔 때마다 PostHog 화면 조회 이벤트를 보냅니다. */
function useScreenTracking() {
  const pathname = usePathname();
  useEffect(() => {
    trackScreen(pathname);
  }, [pathname]);
}

export function AppProviders({ children }: { children: ReactNode }) {
  useAuthSync();
  useScreenTracking();

  // PostHog 는 Provider 없이 클라이언트를 직접 씁니다 (lib/analytics.ts).
  // 웹은 미리 만들어 둔 HTML 을 브라우저에서 이어받는데, 서버 쪽에는 PostHog 가 없어서
  // Provider 로 감싸면 화면 구조가 달라져 오류(React #418)가 납니다.
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
