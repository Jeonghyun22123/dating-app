import { useQuery } from '@tanstack/react-query';

import type { IdentityResult } from '@/features/identity/identity-provider';
import { toColumns, type GenderChoice, type MatchPreferences } from '@/features/preferences/api';
import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth-store';
import { PROFILE_COLUMNS, type Profile, type Purpose } from '@/types/db';

export const profileKey = (userId: string | undefined) => ['profile', userId] as const;

export async function fetchMyProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

/** 내 프로필. 아직 온보딩 전이면 data 가 null 입니다. */
export function useMyProfile() {
  const userId = useAuthStore((s) => s.session?.user.id);
  return useQuery({
    queryKey: profileKey(userId),
    queryFn: () => fetchMyProfile(userId!),
    enabled: !!userId,
  });
}

export function refreshMyProfile(userId: string) {
  return queryClient.invalidateQueries({ queryKey: profileKey(userId) });
}

export type ProfileDetails = {
  nickname: string;
  purpose: Purpose;
  hobbies: string[];
  bio: string;
  /** null = 입력 안 함 */
  mbti?: string | null;
};

export async function createProfile(
  userId: string,
  identity: IdentityResult,
  details: ProfileDetails,
  prefs: MatchPreferences & { gender: GenderChoice },
) {
  const { error } = await supabase.from('profiles').insert({
    id: userId,
    // PortOne 도입 후에는 아래 두 값을 서버가 인증 결과로 기록합니다 (identity-provider.ts 참고).
    gender: identity.gender,
    birth_date: identity.birthDate,
    nickname: details.nickname.trim(),
    purpose: details.purpose,
    hobbies: details.hobbies,
    bio: details.bio.trim() || null,
    mbti: details.mbti ?? null,
    ...toColumns(prefs),
  });
  if (error) throw error;
  refreshEmbedding();
}

export async function updateProfile(userId: string, details: Partial<ProfileDetails>) {
  const { error } = await supabase
    .from('profiles')
    .update({
      ...(details.nickname !== undefined && { nickname: details.nickname.trim() }),
      ...(details.purpose !== undefined && { purpose: details.purpose }),
      ...(details.hobbies !== undefined && { hobbies: details.hobbies }),
      ...(details.bio !== undefined && { bio: details.bio.trim() || null }),
      ...(details.mbti !== undefined && { mbti: details.mbti }),
    })
    .eq('id', userId);
  if (error) throw error;
  refreshEmbedding();
}

export async function completeOnboarding() {
  const { error } = await supabase.rpc('complete_onboarding');
  if (error) throw error;
}

/**
 * 추천용 임베딩 갱신 요청. 실패해도(함수 미배포, 키 없음 등) 프로필 저장 흐름을 막지 않도록
 * 기다리지 않고 오류도 무시합니다.
 * onlyIfMissing: 아직 임베딩이 없을 때만 만듭니다 (OpenAI 키를 등록하기 전에 가입한 회원용).
 */
export function refreshEmbedding(onlyIfMissing = false) {
  supabase.functions
    .invoke('update-profile-embedding', onlyIfMissing ? { body: { mode: 'if_missing' } } : undefined)
    .catch(() => {});
}
