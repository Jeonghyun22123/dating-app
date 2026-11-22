import { useQuery } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
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
  /** 사진 메시지면 chat-images 버킷 안의 파일 경로 */
  image_url: string | null;
  is_read: boolean;
  created_at: string;
};

const MESSAGE_COLUMNS = 'id, match_id, sender_id, content, image_url, is_read, created_at';

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

// ---------------------------------------------------------------------
// 사진 보내기
// ---------------------------------------------------------------------
export const CHAT_IMAGE_BUCKET = 'chat-images';
/** 긴 변이 이 값을 넘으면 줄여서 올립니다 */
const CHAT_IMAGE_MAX_SIDE = 1280;

export type PickedChatPhoto = { uri: string; width: number; height: number };

/** 보관함에서 사진 1장 고르기 (자르기 없음). 취소하면 null. */
export async function pickChatPhoto(): Promise<PickedChatPhoto | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, width: asset.width, height: asset.height };
}

/** 검수에서 막혔거나 보내지 못한 이유 (화면에 그대로 보여줄 수 있는 한글 문장) */
export class ChatImageError extends Error {}

function rejectionMessage(reason: string | undefined): string {
  switch (reason) {
    case 'nudity':
      return '노출이 포함된 사진은 보낼 수 없어요.';
    case 'weapon':
    case 'drug':
    case 'gore':
    case 'offensive':
      return '부적절한 내용이 포함된 사진이라 보낼 수 없어요.';
    case 'too_many':
      return '사진을 너무 빨리 보내고 있어요. 잠시 후 다시 시도해 주세요.';
    case 'match_closed':
      return '대화가 종료되어 사진을 보낼 수 없어요.';
    case 'not_allowed':
      return '지금은 사진을 보낼 수 없어요.';
    case 'moderation_unavailable':
      return '사진을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.';
    default:
      return '사진을 보내지 못했어요. 잠시 후 다시 시도해 주세요.';
  }
}

/**
 * 사진 보내기: 줄여서(촬영 위치 등 EXIF 도 이때 사라집니다) 올리고 → 서버가 AI 로 검수한 뒤 → 통과하면 사진 메시지가 됩니다.
 * 통과하지 못하면 서버가 파일을 지우고 이유를 알려 주며, 그 이유를 담은 ChatImageError 를 던집니다.
 */
export async function sendChatImage(matchId: string, myId: string, photo: PickedChatPhoto): Promise<void> {
  const longSide = Math.max(photo.width, photo.height);
  const scale = longSide > CHAT_IMAGE_MAX_SIDE ? CHAT_IMAGE_MAX_SIDE / longSide : 1;
  const context = ImageManipulator.manipulate(photo.uri);
  if (scale < 1)
    context.resize({ width: Math.round(photo.width * scale), height: Math.round(photo.height * scale) });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  const bytes = await (await fetch(saved.uri)).arrayBuffer();

  // 경로: <매칭 id>/<내 id>/<파일명> (서버·저장소 규칙이 이 모양을 확인합니다)
  const path = `${matchId}/${myId}/${Crypto.randomUUID()}.jpg`;
  const upload = await supabase.storage
    .from(CHAT_IMAGE_BUCKET)
    .upload(path, bytes, { contentType: 'image/jpeg' });
  if (upload.error) throw new ChatImageError(rejectionMessage(undefined));

  const { data, error } = await supabase.functions.invoke<{
    status: 'sent' | 'rejected';
    reason?: string;
    message?: Message;
  }>('send-chat-image', { body: { match_id: matchId, path } });
  if (error || !data) {
    // 서버에 닿지 못했거나 오류 응답: 올려 둔 파일을 치웁니다 (실패해도 무시).
    await supabase.storage
      .from(CHAT_IMAGE_BUCKET)
      .remove([path])
      .catch(() => {});
    throw new ChatImageError(rejectionMessage('moderation_unavailable'));
  }
  if (data.status !== 'sent' || !data.message) throw new ChatImageError(rejectionMessage(data.reason));

  addToCache(data.message);
  queryClient.invalidateQueries({ queryKey: matchesKey });
}

/** 사진 메시지의 사진 주소 (1시간짜리 임시 주소). 채팅방에 머무는 동안 같은 주소를 씁니다. */
export function useChatImageUrl(path: string | null) {
  return useQuery({
    queryKey: ['chat-image', path],
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(CHAT_IMAGE_BUCKET).createSignedUrl(path!, 60 * 60);
      if (error || !data) throw error ?? new Error('sign_failed');
      return data.signedUrl;
    },
  });
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

/** 채팅방을 열어 둔 동안 새 메시지와 읽음 표시를 실시간으로 받습니다 (DB 의 RLS 가 그대로 적용됨). */
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
      // 상대가 내 메시지를 읽으면(is_read 변경) 채팅방을 나갔다 오지 않아도 "읽음"이 바로 표시됩니다.
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `match_id=eq.${matchId}` },
        (payload) => {
          const updated = payload.new as Message;
          queryClient.setQueryData<Message[]>(messagesKey(matchId), (current) =>
            current?.map((item) => (item.id === updated.id ? { ...item, is_read: updated.is_read } : item)),
          );
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
/** 채팅 말풍선 옆 시각 (예: 오후 3:04). 날짜는 날짜 구분선이 따로 보여줍니다. */
export function formatClock(iso: string): string {
  const date = new Date(iso);
  const hours = date.getHours();
  return `${hours < 12 ? '오전' : '오후'} ${hours % 12 || 12}:${String(date.getMinutes()).padStart(2, '0')}`;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 채팅 날짜 구분선 (예: 2026년 11월 16일 월요일) */
export function formatDateLine(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 ${WEEKDAYS[date.getDay()]}요일`;
}

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
