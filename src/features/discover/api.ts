import { useQuery } from '@tanstack/react-query';

import { signPhotoPaths } from '@/features/photos/api';
import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import type { Gender, Purpose, VerificationStatus } from '@/types/db';

export const DISTANCE_OPTIONS = [10, 30, 100] as const;
export type DistanceKm = (typeof DISTANCE_OPTIONS)[number];

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

export const discoverKey = (maxKm: number) => ['discover', maxKm] as const;

export async function fetchDiscover(maxKm: number): Promise<DiscoverResult> {
  const startedAt = Date.now();
  const { data, error } = await supabase.rpc('discover_profiles', { p_max_km: maxKm, p_limit: 20 });
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

export function useDiscover(maxKm: number) {
  return useQuery({ queryKey: discoverKey(maxKm), queryFn: () => fetchDiscover(maxKm) });
}

/** 좋아요/패스. 서로 좋아요면 매칭 id 를 돌려줍니다. */
export async function swipeProfile(targetId: string, action: 'like' | 'pass'): Promise<string | null> {
  const { data, error } = await supabase.rpc('swipe_profile', { p_target: targetId, p_action: action });
  if (error) throw error;
  return (data as string | null) ?? null;
}

/** 추천 목록을 서버에서 다시 받아옵니다. */
export function refreshDiscover() {
  return queryClient.invalidateQueries({ queryKey: ['discover'] });
}
