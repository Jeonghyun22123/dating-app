import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { env, isSupabaseConfigured } from './env';

if (!isSupabaseConfigured && __DEV__) {
  console.warn(
    '[supabase] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY 가 설정되지 않았습니다. ' +
      '.env.example 을 .env.local 로 복사해 값을 채운 뒤 개발 서버를 다시 시작하세요.',
  );
}

// 웹 정적 빌드(expo export)는 Node에서 한 번 렌더링되므로 그때는 저장소가 없습니다.
const isServer = typeof window === 'undefined';

/**
 * 앱 전체에서 공유하는 Supabase 클라이언트.
 * 여기에는 anon(공개) 키만 사용합니다. 모든 데이터 접근 권한은 DB의 RLS 정책이 결정합니다.
 */
export const supabase = createClient(
  // 키가 없어도 앱이 바로 죽지 않도록 자리표시 값을 넣습니다 (요청은 실패합니다).
  isSupabaseConfigured ? env.supabaseUrl : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? env.supabaseAnonKey : 'placeholder-anon-key',
  {
    auth: {
      storage: isServer ? undefined : AsyncStorage,
      autoRefreshToken: !isServer,
      persistSession: !isServer,
      // 웹(PWA)에서는 이메일 링크/OAuth 리다이렉트 URL의 세션을 읽어야 합니다.
      detectSessionInUrl: Platform.OS === 'web',
    },
  },
);

// 네이티브에서는 앱이 화면에 있을 때만 토큰 자동 갱신을 돌립니다.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
