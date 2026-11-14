import { useQuery } from '@tanstack/react-query';

import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth-store';

export type ConsentStatus = {
  /** 서버가 정한 현재 약관 버전 */
  version: string;
  /** 필수 약관을 현재 버전으로 아직 동의하지 않았는지 */
  needs_consent: boolean;
  /** 마지막으로 고른 이벤트·혜택 수신 여부 */
  marketing: boolean;
};

export const consentKey = (userId: string | undefined) => ['consent', userId] as const;

/** 동의 필요 여부. 약관 버전은 서버(app_settings)가 정하므로, 버전을 올리면 다음 접속 때 다시 묻습니다. */
export function useConsentStatus() {
  const userId = useAuthStore((s) => s.session?.user.id);
  return useQuery({
    queryKey: consentKey(userId),
    enabled: !!userId,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_consent_status');
      if (error) throw error;
      return data as ConsentStatus;
    },
  });
}

export async function acceptConsents(userId: string, version: string, marketing: boolean) {
  const { error } = await supabase.rpc('accept_consents', { p_version: version, p_marketing: marketing });
  if (error) throw error;
  await queryClient.invalidateQueries({ queryKey: consentKey(userId) });
  // 설정 화면의 이벤트 수신 스위치도 같은 값으로 바뀌었으니 새로 읽게 합니다.
  queryClient.invalidateQueries({ queryKey: ['notification-prefs', userId] });
}
