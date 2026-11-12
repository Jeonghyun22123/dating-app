/**
 * 환경변수 접근 지점.
 * Expo는 `process.env.EXPO_PUBLIC_*` 를 빌드 시점에 문자열로 치환하므로
 * 반드시 아래처럼 전체 이름을 그대로 써야 합니다 (동적 접근 불가).
 */
/**
 * Supabase URL 은 "https://<프로젝트>.supabase.co" 까지만 필요합니다.
 * 대시보드에서 "/rest/v1/" 등이 붙은 주소를 복사해 넣어도 동작하도록 뒤쪽 경로를 잘라냅니다.
 */
function normalizeSupabaseUrl(value: string): string {
  const trimmed = value.trim();
  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed;
  }
}

export const env = {
  supabaseUrl: normalizeSupabaseUrl(process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''),
  supabaseAnonKey: (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim(),
  posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '',
  posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
} as const;

export const isSupabaseConfigured =
  env.supabaseUrl.startsWith('https://') &&
  !env.supabaseUrl.includes('YOUR_PROJECT_REF') &&
  env.supabaseAnonKey.length > 0 &&
  !env.supabaseAnonKey.startsWith('YOUR_');

export const isPostHogConfigured = env.posthogKey.length > 0;
