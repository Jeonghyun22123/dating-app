/**
 * 간편가입 (구글 · 카카오).
 *
 * 동작
 *   - Supabase 에서 켜진 로그인 방식만 버튼으로 보여줍니다 (/auth/v1/settings 로 확인).
 *     → 카카오는 Supabase > Authentication > Sign In / Providers 에서 켜기만 하면 버튼이 자동으로 나타납니다.
 *   - 웹: 버튼을 누르면 구글·카카오 로그인 페이지로 이동했다가, 로그인 후 앱 주소로 돌아옵니다.
 *     돌아온 주소에 담긴 로그인 정보는 supabase 클라이언트(detectSessionInUrl)가 읽어 로그인 상태로 만듭니다.
 *   - 휴대폰 앱(iOS·Android)의 간편가입은 앱 빌드와 함께 Phase 10 에서 붙입니다. 그 전까지 앱에서는 숨깁니다.
 *
 * 간편가입 후에도 약관 동의 → 기본 정보(성별·생년월일) → 프로필 → 사진 → 셀카 흐름은 그대로입니다.
 */
import type { User } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { Platform } from 'react-native';

import { authRedirectUrl } from '@/lib/auth';
import { env } from '@/lib/env';
import { consumeOAuthError } from '@/lib/oauth-return';
import { supabase } from '@/lib/supabase';

export type SocialProvider = 'kakao' | 'google';

/** 화면에 보여줄 순서 (한국 사용자가 많이 쓰는 카카오를 위에) */
export const SOCIAL_PROVIDERS: SocialProvider[] = ['kakao', 'google'];

export const PROVIDER_LABEL: Record<SocialProvider | 'email', string> = {
  kakao: '카카오',
  google: 'Google',
  email: '이메일',
};

export const socialSupported = Platform.OS === 'web';

/** Supabase 에서 켜 둔 간편가입 방식. 확인에 실패하면 버튼을 숨깁니다. */
export function useEnabledProviders() {
  return useQuery({
    queryKey: ['auth-providers'],
    enabled: socialSupported,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async (): Promise<SocialProvider[]> => {
      const res = await fetch(`${env.supabaseUrl}/auth/v1/settings`, {
        headers: { apikey: env.supabaseAnonKey },
      });
      if (!res.ok) return [];
      const settings = (await res.json()) as { external?: Record<string, boolean> };
      return SOCIAL_PROVIDERS.filter((provider) => settings.external?.[provider]);
    },
  });
}

/** 구글·카카오 로그인 페이지로 이동합니다 (웹). 이동에 실패했을 때만 오류를 던집니다. */
export async function signInWithProvider(provider: SocialProvider) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: authRedirectUrl() },
  });
  if (error) throw error;
}

/**
 * 간편가입에서 돌아왔는데 실패한 경우(취소, 동의 거부 등) 보여줄 안내. 오류가 없으면 null.
 * (오류는 앱이 처음 열릴 때 lib/oauth-return.ts 가 주소에서 읽어 둡니다)
 */
export function takeOAuthError(): string | null {
  const code = consumeOAuthError();
  if (!code) return null;
  return code === 'access_denied'
    ? '로그인을 취소했어요. 다시 시도하려면 버튼을 눌러 주세요.'
    : '간편 로그인을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.';
}

/** 이 계정에 연결된 로그인 방식들 (예: ['google'] 또는 ['email', 'kakao']) */
export function linkedProviders(user: User | null | undefined): string[] {
  const fromIdentities = (user?.identities ?? []).map((identity) => identity.provider);
  const fromMeta = (user?.app_metadata?.providers as string[] | undefined) ?? [];
  return [...new Set([...fromIdentities, ...fromMeta])];
}

/** 비밀번호로 로그인하는 계정인지 (간편가입만 한 계정은 비밀번호가 없습니다) */
export function hasPassword(user: User | null | undefined) {
  const providers = linkedProviders(user);
  return providers.length === 0 || providers.includes('email');
}
