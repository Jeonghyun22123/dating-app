import { matchesKey } from '@/features/chat/api';
import { AnalyticsEvent, track } from '@/lib/analytics';
import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';

export const REPORT_REASONS = [
  { value: 'harassment', label: '욕설·비하·성희롱' },
  { value: 'fake_profile', label: '사칭·도용·가짜 프로필' },
  { value: 'spam', label: '광고·홍보·금전 요구' },
  { value: 'inappropriate_photo', label: '부적절한 사진' },
  { value: 'underage', label: '미성년자로 의심됨' },
  { value: 'other', label: '기타' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['value'];

/**
 * 신고 접수. matchId 를 함께 보내면 서버 트리거가 그 대화의 최근 메시지를 증거 스냅샷으로 남깁니다.
 * (스냅샷은 서버만 만들 수 있고, 관리자만 열람할 수 있습니다)
 */
export async function reportUser(params: {
  reporterId: string;
  reportedUserId: string;
  matchId?: string;
  reason: ReportReason;
  description?: string;
}) {
  const { error } = await supabase.from('reports').insert({
    reporter_id: params.reporterId,
    reported_user_id: params.reportedUserId,
    match_id: params.matchId ?? null,
    reason: params.reason,
    description: params.description?.trim() || null,
  });
  if (error) throw error;
  track(AnalyticsEvent.ReportSubmitted, { reason: params.reason, from_chat: !!params.matchId });
}

/** 차단. 서로 추천·채팅 목록에서 사라지고, 기존 매칭은 서버가 비활성화합니다. */
export async function blockUser(blockerId: string, blockedId: string) {
  const { error } = await supabase.from('blocks').insert({ blocker_id: blockerId, blocked_id: blockedId });
  // 이미 차단한 상대(중복)는 성공으로 봅니다.
  if (error && error.code !== '23505') throw error;
  queryClient.invalidateQueries({ queryKey: matchesKey });
  queryClient.invalidateQueries({ queryKey: ['discover'] });
}
