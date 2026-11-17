import { useQuery } from '@tanstack/react-query';

import { signPhotoPaths } from '@/features/photos/api';
import { supabase } from '@/lib/supabase';
import type { Purpose, VerificationStatus } from '@/types/db';

/** 다른 회원의 프로필. 서버가 "볼 수 있는 사이"에게만 돌려줍니다 (좌표·거리·생년월일·점수 숫자 없음). */
export type MemberProfile = {
  id: string;
  nickname: string;
  age: number;
  purpose: Purpose;
  hobbies: string[];
  bio: string | null;
  mbti: string | null;
  neighborhood_name: string | null;
  verification_status: VerificationStatus;
  trust_level: 'high' | 'verified' | null;
  /** 지금 매칭 중이면 그 대화 id, 시그널만 받은 사이면 null */
  match_id: string | null;
  photo_paths: string[];
  photoUrls: string[];
};

export const memberKey = (userId: string) => ['member-profile', userId] as const;

/**
 * 매칭된 상대 또는 나에게 시그널을 보낸 사람의 프로필.
 * 볼 수 없는 사이(매칭 해제, 차단, 정지, 모르는 사람)면 data 가 null 입니다.
 */
export function useMemberProfile(userId: string) {
  return useQuery({
    queryKey: memberKey(userId),
    queryFn: async (): Promise<MemberProfile | null> => {
      const { data, error } = await supabase.rpc('member_profile', { p_user: userId });
      if (error) throw error;
      if (!data) return null;
      const row = data as Omit<MemberProfile, 'photoUrls'>;
      const urls = await signPhotoPaths(row.photo_paths);
      return { ...row, photoUrls: row.photo_paths.flatMap((path) => urls.get(path) ?? []) };
    },
    // 상대가 사진·소개를 바꿨을 수 있으므로 열 때마다 새로 받아옵니다.
    refetchOnMount: 'always',
  });
}
