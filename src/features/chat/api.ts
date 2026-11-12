import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { signPhotoPaths } from '@/features/photos/api';
import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';

export const MESSAGE_MAX = 2000;

export type MatchSummary = {
  match_id: string;
  is_active: boolean;
  matched_at: string;
  other_id: string;
  nickname: string;
  photo_path: string | null;
  last_message: string | null;
  last_message_at: string | null;
  last_sender_id: string | null;
  unread_count: number;
  photoUrl: string | null;
};

export type Message = {
  id: string;
  match_id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
};

const MESSAGE_COLUMNS = 'id, match_id, sender_id, content, is_read, created_at';

export const matchesKey = ['matches'] as const;
export const messagesKey = (matchId: string) => ['messages', matchId] as const;

export async function fetchMatches(): Promise<MatchSummary[]> {
  const { data, error } = await supabase.rpc('my_matches');
  if (error) throw error;
  const rows = (data ?? []) as Omit<MatchSummary, 'photoUrl'>[];
  const urls = await signPhotoPaths(rows.flatMap((row) => row.photo_path ?? []));
  return rows.map((row) => ({ ...row, photoUrl: (row.photo_path && urls.get(row.photo_path)) || null }));
}

export function useMatches(enabled = true) {
  return useQuery({ queryKey: matchesKey, queryFn: fetchMatches, enabled });
}

/** 최신 메시지가 앞에 오도록(내림차순) 가져옵니다. 화면은 뒤집힌 목록으로 그립니다. */
export async function fetchMessages(matchId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .eq('match_id', matchId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as Message[];
}

export function useMessages(matchId: string) {
  return useQuery({
    queryKey: messagesKey(matchId),
    queryFn: () => fetchMessages(matchId),
    // 채팅방에 들어올 때마다 최신 내용을 다시 받아옵니다.
    refetchOnMount: 'always',
    // 실시간 연결이 끊겼을 때를 대비한 느린 보조 갱신
    refetchInterval: 30_000,
  });
}

function addToCache(message: Message) {
  queryClient.setQueryData<Message[]>(messagesKey(message.match_id), (current = []) =>
    current.some((item) => item.id === message.id) ? current : [message, ...current],
  );
}

export async function sendMessage(matchId: string, senderId: string, content: string): Promise<void> {
  const { data, error } = await supabase
    .from('messages')
    .insert({ match_id: matchId, sender_id: senderId, content: content.trim() })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error) throw error;
  addToCache(data as Message);
  queryClient.invalidateQueries({ queryKey: matchesKey });
}

/** 상대가 보낸 안 읽은 메시지를 읽음 처리합니다. */
export async function markRead(matchId: string, myId: string) {
  await supabase
    .from('messages')
    .update({ is_read: true })
    .eq('match_id', matchId)
    .neq('sender_id', myId)
    .eq('is_read', false);
  queryClient.invalidateQueries({ queryKey: matchesKey });
}

export async function unmatch(matchId: string) {
  const { error } = await supabase.rpc('unmatch', { p_match_id: matchId });
  if (error) throw error;
  await queryClient.invalidateQueries({ queryKey: matchesKey });
}

/** 채팅방을 열어 둔 동안 새 메시지를 실시간으로 받습니다 (DB 의 RLS 가 그대로 적용됨). */
export function useChatRealtime(matchId: string, myId: string | undefined) {
  useEffect(() => {
    if (!myId) return;
    const channel = supabase
      .channel(`chat:${matchId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `match_id=eq.${matchId}` },
        (payload) => {
          const message = payload.new as Message;
          addToCache(message);
          if (message.sender_id !== myId) markRead(matchId, myId);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId, myId]);
}

/** 앱 전체에서 새 매칭·새 메시지를 감지해 채팅 목록과 안 읽은 배지를 갱신합니다. */
export function useInboxRealtime(myId: string | undefined) {
  useEffect(() => {
    if (!myId) return;
    const refresh = () => queryClient.invalidateQueries({ queryKey: matchesKey });
    const channel = supabase
      .channel(`inbox:${myId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [myId]);
}

/** 채팅 목록·말풍선에 쓰는 짧은 시각 표시. */
export function formatTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return '';
  const date = new Date(iso);
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    const hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours < 12 ? '오전' : '오후'} ${hours % 12 || 12}:${minutes}`;
  }
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}
