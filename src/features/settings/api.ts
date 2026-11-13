import { useQuery } from '@tanstack/react-query';

import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';

/** 알림 종류별 수신 여부. 푸시 발송은 앱 출시 단계에서 이 값을 보고 결정합니다. */
export type NotificationPrefs = { match: boolean; message: boolean; marketing: boolean };

export const NOTIFICATION_ITEMS: { key: keyof NotificationPrefs; label: string; description: string }[] = [
  { key: 'match', label: '새 매칭', description: '서로 관심을 보였을 때 알려드려요' },
  { key: 'message', label: '새 메시지', description: '상대가 메시지를 보냈을 때 알려드려요' },
  { key: 'marketing', label: '이벤트·혜택 소식', description: '할인, 이벤트 등 광고성 정보를 받아요 (선택)' },
];

const key = (userId: string | undefined) => ['notification-prefs', userId] as const;

/**
 * 내 프로필 조회와 따로 불러옵니다. supabase_settings.sql 을 아직 실행하지 않은 프로젝트에서도
 * 앱의 다른 화면은 정상 동작하고, 설정 화면의 알림 영역에만 안내가 뜨도록 하기 위해서입니다.
 */
export function useNotificationPrefs(userId: string | undefined) {
  return useQuery({
    queryKey: key(userId),
    enabled: !!userId,
    retry: false,
    queryFn: async (): Promise<NotificationPrefs> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('notification_prefs')
        .eq('id', userId!)
        .single();
      if (error) throw error;
      return (data as { notification_prefs: NotificationPrefs }).notification_prefs;
    },
  });
}

/** 바꾼 값을 화면에 먼저 반영하고 저장합니다. 저장에 실패하면 원래 값으로 되돌립니다. */
export async function saveNotificationPrefs(userId: string, next: NotificationPrefs) {
  const previous = queryClient.getQueryData<NotificationPrefs>(key(userId));
  queryClient.setQueryData(key(userId), next);
  const { error } = await supabase.from('profiles').update({ notification_prefs: next }).eq('id', userId);
  if (error) {
    queryClient.setQueryData(key(userId), previous);
    throw error;
  }
}
