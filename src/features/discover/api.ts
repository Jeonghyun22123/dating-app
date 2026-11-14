import { useQuery } from '@tanstack/react-query';

import { signPhotoPaths } from '@/features/photos/api';
import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import type { Gender, Purpose, VerificationStatus } from '@/types/db';

/** 다른 사용자에게 보여주는 신뢰 등급 (점수 숫자는 서버가 내려주지 않습니다) */
export type TrustLevel = 'high' | 'verified' | null;

export type DiscoverProfile = {
  id: string;
  nickname: string;
  age: number;
  gender: Gender;
  purpose: Purpose;
  hobbies: string[];
  bio: string | null;
  neighborhood_name: string | null;
  verification_status: VerificationStatus;
  trust_level: TrustLevel;
  /** 이 사람이 나에게 보낸 시그널 메시지 (없으면 null). 관심을 누르면 이 메시지로 대화가 시작됩니다 */
  signal_message: string | null;
  /** 서버가 계산한 근사 거리. 정확한 좌표는 앱으로 오지 않습니다. */
  distance_km: number;
  photo_paths: string[] | null;
  /** photo_paths 를 Signed URL 로 바꾼 것 (파일이 없으면 빈 배열) */
  photoUrls: string[];
};

export type DiscoverResult = {
  /** 이 목록을 서버에 요청하기 시작한 시각 (ms). 그 뒤에 처리된 결정은 목록에 반영되지 않았을 수 있습니다. */
  startedAt: number;
  profiles: DiscoverProfile[];
};

export const discoverKey = ['discover'] as const;

/** 거리·성별·나이 조건은 서버가 내 프로필의 만남 조건으로 적용합니다. */
export async function fetchDiscover(): Promise<DiscoverResult> {
  const startedAt = Date.now();
  const { data, error } = await supabase.rpc('discover_profiles', { p_limit: 20 });
  if (error) throw error;

  const rows = (data ?? []) as Omit<DiscoverProfile, 'photoUrls'>[];
  const urls = await signPhotoPaths(rows.flatMap((row) => row.photo_paths ?? []));
  return {
    startedAt,
    profiles: rows.map((row) => ({
      ...row,
      photoUrls: (row.photo_paths ?? []).flatMap((path) => urls.get(path) ?? []),
    })),
  };
}

export function useDiscover() {
  return useQuery({ queryKey: discoverKey, queryFn: fetchDiscover });
}

/** 좋아요/패스. 서로 좋아요면 매칭 id 를 돌려줍니다. */
export async function swipeProfile(targetId: string, action: 'like' | 'pass'): Promise<string | null> {
  const { data, error } = await supabase.rpc('swipe_profile', { p_target: targetId, p_action: action });
  if (error) throw error;
  return (data as string | null) ?? null;
}

/** 추천 목록을 서버에서 다시 받아옵니다. */
export function refreshDiscover() {
  return queryClient.invalidateQueries({ queryKey: discoverKey });
}
