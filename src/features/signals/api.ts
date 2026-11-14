/**
 * 시그널: "관심 있어요"에 메시지를 붙여 보내는 대화 신청.
 *   - 상대에게 메시지가 바로 전달되고, 상대가 수락하면 그 메시지로 대화가 시작됩니다.
 *   - 가입 시 5회가 무료이며, 횟수는 서버(send_signal)만 차감합니다.
 */
import { useQuery } from '@tanstack/react-query';

import { matchesKey } from '@/features/chat/api';
import type { TrustLevel } from '@/features/discover/api';
import { signPhotoPaths } from '@/features/photos/api';
import { refreshMyProfile } from '@/features/profile/api';
import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import type { Purpose, VerificationStatus } from '@/types/db';

export const SIGNAL_MESSAGE_MAX = 200;

export type ReceivedSignal = {
  sender_id: string;
  nickname: string;
  age: number;
  purpose: Purpose;
  neighborhood_name: string | null;
  verification_status: VerificationStatus;
  trust_level: TrustLevel;
  message: string;
  sent_at: string;
  photo_paths: string[];
  photoUrl: string | null;
};

export const signalsKey = ['signals'] as const;

/** 서버가 "남은 횟수 없음"으로 거절했을 때의 오류 */
export class NoSignalsLeftError extends Error {}

/**
 * 시그널 보내기.
 * 반환: 상대가 이미 나에게 관심을 보냈다면 바로 열린 매칭 id (아니면 null) 와 남은 횟수.
 */
export async function sendSignal(
  userId: string,
  targetId: string,
  message: string,
): Promise<{ matchId: string | null; remaining: number }> {
  const { data, error } = await supabase.rpc('send_signal', { p_target: targetId, p_message: message.trim() });
  if (error) {
    if (error.code === 'P0002') throw new NoSignalsLeftError(error.message);
    throw error;
  }
  const result = data as { match_id: string | null; remaining: number };
  // 남은 횟수 표시를 갱신합니다.
  refreshMyProfile(userId);
  if (result.match_id) queryClient.invalidateQueries({ queryKey: matchesKey });
  return { matchId: result.match_id, remaining: result.remaining };
}

export async function fetchReceivedSignals(): Promise<ReceivedSignal[]> {
  const { data, error } = await supabase.rpc('received_signals');
  if (error) throw error;
  const rows = (data ?? []) as Omit<ReceivedSignal, 'photoUrl'>[];
  const urls = await signPhotoPaths(rows.flatMap((row) => row.photo_paths[0] ?? []));
  return rows.map((row) => ({ ...row, photoUrl: (row.photo_paths[0] && urls.get(row.photo_paths[0])) || null }));
}

/** 받은 시그널은 실시간 알림 대상이 아니라서, 화면에 들어올 때와 30초마다 새로 받아옵니다. */
export function useReceivedSignals() {
  return useQuery({ queryKey: signalsKey, queryFn: fetchReceivedSignals, refetchInterval: 30_000 });
}

/** 수락하면 매칭 id 를 돌려줍니다 (거절은 null). 거절은 상대에게 알려지지 않습니다. */
export async function respondSignal(senderId: string, accept: boolean): Promise<string | null> {
  const { data, error } = await supabase.rpc('respond_signal', { p_sender: senderId, p_accept: accept });
  if (error) throw error;
  // 답한 시그널은 목록에서 바로 뺍니다.
  queryClient.setQueryData<ReceivedSignal[]>(signalsKey, (current = []) =>
    current.filter((signal) => signal.sender_id !== senderId),
  );
  queryClient.invalidateQueries({ queryKey: ['discover'] });
  if (accept) await queryClient.invalidateQueries({ queryKey: matchesKey });
  return (data as string | null) ?? null;
}

/** 차단 등으로 더 볼 수 없게 된 시그널을 목록에서 뺍니다. */
export function dropSignal(senderId: string) {
  queryClient.setQueryData<ReceivedSignal[]>(signalsKey, (current = []) =>
    current.filter((signal) => signal.sender_id !== senderId),
  );
}
