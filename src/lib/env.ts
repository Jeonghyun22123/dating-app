/**
 * 환경변수 접근 지점.
 * Expo는 `process.env.EXPO_PUBLIC_*` 를 빌드 시점에 문자열로 치환하므로
 * 반드시 아래처럼 전체 이름을 그대로 써야 합니다 (동적 접근 불가).
 */
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '',
  posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
} as const;

export const isSupabaseConfigured =
  env.supabaseUrl.startsWith('https://') &&
  !env.supabaseUrl.includes('YOUR_PROJECT_REF') &&
  env.supabaseAnonKey.length > 0 &&
  !env.supabaseAnonKey.startsWith('YOUR_');

export const isPostHogConfigured = env.posthogKey.length > 0;
