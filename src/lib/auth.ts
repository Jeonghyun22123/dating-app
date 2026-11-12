import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

import { resetAnalytics } from './analytics';
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
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) {
    return '이메일 또는 비밀번호가 올바르지 않습니다.';
  }
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(message)) {
    return '이메일 인증이 완료되지 않았습니다. 메일함의 인증 링크를 눌러 주세요.';
  }
  if (code === 'user_already_exists' || /already registered/i.test(message)) {
    return '이미 가입된 이메일입니다. 로그인해 주세요.';
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
  return '문제가 발생했습니다. 잠시 후 다시 시도해 주세요.';
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}

/** 반환값: 이메일 인증이 필요하면 'confirm_email', 바로 로그인되었으면 'signed_in'. */
export async function signUp(email: string, password: string): Promise<'confirm_email' | 'signed_in'> {
  const emailRedirectTo =
    Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : Linking.createURL('/');
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo },
  });
  if (error) throw error;
  return data.session ? 'signed_in' : 'confirm_email';
}

export async function signOut() {
  await supabase.auth.signOut();
  queryClient.clear();
  resetAnalytics();
}
