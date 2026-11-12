import { useQuery } from '@tanstack/react-query';

import type { IdentityResult } from '@/features/identity/identity-provider';
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
};

export async function createProfile(userId: string, identity: IdentityResult, details: ProfileDetails) {
  const { error } = await supabase.from('profiles').insert({
    id: userId,
    // PortOne 도입 후에는 아래 두 값을 서버가 인증 결과로 기록합니다 (identity-provider.ts 참고).
    gender: identity.gender,
    birth_date: identity.birthDate,
    nickname: details.nickname.trim(),
    purpose: details.purpose,
    hobbies: details.hobbies,
    bio: details.bio.trim() || null,
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
    })
    .eq('id', userId);
  if (error) throw error;
  refreshEmbedding();
}

/**
 * 현재 위치 저장. 좌표는 서버에만 보관하고 앱으로 다시 읽어오지 않습니다.
 * (다른 사용자에게는 추천 RPC 가 계산한 근사 거리만 전달됩니다)
 */
export async function saveLocation(
  userId: string,
  coords: { latitude: number; longitude: number },
  neighborhoodName: string,
) {
  const { error } = await supabase
    .from('profiles')
    .update({
      // PostGIS EWKT 형식: 경도(longitude)가 먼저입니다.
      location: `SRID=4326;POINT(${coords.longitude} ${coords.latitude})`,
      neighborhood_name: neighborhoodName.trim(),
    })
    .eq('id', userId);
  if (error) throw error;
}

export async function completeOnboarding() {
  const { error } = await supabase.rpc('complete_onboarding');
  if (error) throw error;
}

/**
 * 추천용 임베딩 갱신 요청. 실패해도(함수 미배포, 키 없음 등) 프로필 저장 흐름을 막지 않도록
 * 기다리지 않고 오류도 무시합니다.
 */
export function refreshEmbedding() {
  supabase.functions.invoke('update-profile-embedding').catch(() => {});
}
