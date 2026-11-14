import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

import { resetAnalytics } from './analytics';
import { env } from './env';
import { queryClient } from './query-client';
import { supabase } from './supabase';

export const PASSWORD_MIN = 8;

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Supabase 인증 오류를 사용자에게 보여줄 한국어 문장으로 바꿉니다. */
export function authErrorMessage(error: { message?: string; code?: string } | null | undefined): string {
  const code = error?.code ?? '';
  const message = error?.message ?? '';
  // 개발 중에는 원인을 바로 볼 수 있게 원본 오류를 콘솔에 남깁니다.
  if (__DEV__) console.warn('[auth]', code || '(no code)', message);

  if (code === 'email_address_invalid' || /email address .* is invalid/i.test(message)) {
    return '사용할 수 없는 이메일 주소입니다. 실제로 메일을 받을 수 있는 주소를 입력해 주세요.';
  }
  if (/invalid api key|no api key/i.test(message)) {
    return '서버 연결 설정이 올바르지 않습니다. (.env.local 의 Supabase URL 과 anon 키를 확인하세요)';
  }
  if (code === 'signup_disabled' || code === 'email_provider_disabled') {
    return '현재 이메일 가입이 꺼져 있습니다. (Supabase > Authentication > Providers > Email 확인)';
  }
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) {
    return '이메일 또는 비밀번호가 올바르지 않습니다.';
  }
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(message)) {
    return '이메일 인증이 완료되지 않았습니다. 메일함의 인증 링크를 눌러 주세요.';
  }
  if (code === 'user_already_exists' || /already registered/i.test(message)) {
    return '이미 가입된 이메일입니다. 로그인해 주세요.';
  }
  if (code === 'same_password') {
    return '지금 쓰는 비밀번호와 다른 비밀번호를 입력해 주세요.';
  }
  if (code === 'weak_password' || /password/i.test(message)) {
    return `비밀번호는 ${PASSWORD_MIN}자 이상으로 설정해 주세요.`;
  }
  if (code.includes('rate_limit') || /rate limit|too many/i.test(message)) {
    return '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  }
  if (/network|fetch/i.test(message)) {
    return '네트워크 연결을 확인해 주세요.';
  }
  // 알 수 없는 오류는 원인 파악을 위해 코드를 함께 보여줍니다.
  return `문제가 발생했습니다. 잠시 후 다시 시도해 주세요.${code ? ` (${code})` : ''}`;
}

/**
 * 메일 속 링크(가입 인증, 비밀번호 재설정)를 누른 뒤 돌아올 주소.
 * 배포 주소(EXPO_PUBLIC_SITE_URL)가 있으면 그 주소, 없으면 지금 열린 웹 주소, 앱이면 앱 주소.
 * 어느 것이든 Supabase > Authentication > URL Configuration 의 Redirect URLs 에 등록되어 있어야 합니다.
 */
export function authRedirectUrl() {
  if (env.siteUrl) return env.siteUrl;
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  return Linking.createURL('/');
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}

/** 반환값: 이메일 인증이 필요하면 'confirm_email', 바로 로그인되었으면 'signed_in'. */
export async function signUp(email: string, password: string): Promise<'confirm_email' | 'signed_in'> {
  const emailRedirectTo = authRedirectUrl();
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo },
  });
  if (error) throw error;
  return data.session ? 'signed_in' : 'confirm_email';
}

/** 비밀번호 재설정 메일 보내기. 가입되지 않은 이메일이어도 똑같이 성공으로 보입니다 (가입 여부 노출 방지). */
export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: authRedirectUrl(),
  });
  if (error) throw error;
}

/** 로그인된(또는 재설정 링크로 들어온) 상태에서 새 비밀번호로 바꿉니다. */
export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

/**
 * 회원 탈퇴. 서버가 사진·셀카 파일과 계정, 연결된 데이터를 모두 지운 뒤 로그아웃합니다.
 * 되돌릴 수 없습니다.
 */
export async function deleteAccount() {
  const { error } = await supabase.functions.invoke('delete-account', { body: { confirm: '탈퇴' } });
  if (error) throw error;
  // 계정이 이미 지워졌으므로 서버 로그아웃이 실패해도 기기의 로그인 정보는 지웁니다.
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  queryClient.clear();
  resetAnalytics();
}

export async function signOut() {
  await supabase.auth.signOut();
  queryClient.clear();
  resetAnalytics();
}
