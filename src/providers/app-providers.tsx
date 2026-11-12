import { QueryClientProvider } from '@tanstack/react-query';
import { usePathname } from 'expo-router';
import { PostHogProvider } from 'posthog-react-native';
import { useEffect, type ReactNode } from 'react';

import { identifyUser, posthog, resetAnalytics, trackScreen } from '@/lib/analytics';
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
      if (session) {
        identifyUser(session.user.id);
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

  const tree = <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;

  // 화면 추적은 위에서 직접 하므로 Provider의 자동 캡처는 끕니다.
  return posthog ? (
    <PostHogProvider client={posthog} autocapture={false}>
      {tree}
    </PostHogProvider>
  ) : (
    tree
  );
}
