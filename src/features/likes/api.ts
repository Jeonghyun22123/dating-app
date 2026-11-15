/**
 * 받은 관심: 나에게 "관심 있어요"를 보냈고 내가 아직 답하지 않은 사람.
 * 인원수는 누구나 볼 수 있고, 명단은 프리미엄 회원만 서버가 내려줍니다.
 */
import { useQuery } from '@tanstack/react-query';

import type { TrustLevel } from '@/features/discover/api';
import { signPhotoPaths } from '@/features/photos/api';
import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import type { Purpose, VerificationStatus } from '@/types/db';

export type ReceivedLike = {
  id: string;
  nickname: string;
  age: number;
  purpose: Purpose;
  neighborhood_name: string | null;
  verification_status: VerificationStatus;
  trust_level: TrustLevel;
  liked_at: string;
  photo_paths: string[];
  photoUrl: string | null;
};

const countKey = ['received-likes-count'] as const;
const listKey = ['received-likes'] as const;

export function useReceivedLikesCount() {
  return useQuery({
    queryKey: countKey,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('received_likes_count');
      if (error) throw error;
      return (data as number) ?? 0;
    },
  });
}

export function useReceivedLikes(enabled: boolean) {
  return useQuery({
    queryKey: listKey,
    enabled,
    queryFn: async (): Promise<ReceivedLike[]> => {
      const { data, error } = await supabase.rpc('received_likes');
      if (error) throw error;
      const rows = (data ?? []) as Omit<ReceivedLike, 'photoUrl'>[];
      const urls = await signPhotoPaths(rows.flatMap((row) => row.photo_paths[0] ?? []));
      return rows.map((row) => ({ ...row, photoUrl: (row.photo_paths[0] && urls.get(row.photo_paths[0])) || null }));
    },
  });
}

/** 답한 사람은 목록에서 바로 빼고, 인원수와 추천 목록을 새로 받아옵니다. */
export function dropReceivedLike(id: string) {
  queryClient.setQueryData<ReceivedLike[]>(listKey, (current = []) => current.filter((like) => like.id !== id));
  queryClient.invalidateQueries({ queryKey: countKey });
  queryClient.invalidateQueries({ queryKey: ['discover'] });
}
