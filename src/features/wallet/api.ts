/**
 * 하트 지갑 · 하루 둘러보기 횟수 · 스포트라이트.
 * 잔액과 횟수는 모두 서버가 관리합니다 (supabase_phase7.sql). 앱은 보여주기만 합니다.
 */
import { useQuery } from '@tanstack/react-query';

import { refreshMyProfile } from '@/features/profile/api';
import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth-store';

export type WalletTransaction = {
  amount: number;
  type: 'purchase' | 'signal' | 'spotlight' | 'bonus' | 'admin_grant' | 'refund';
  created_at: string;
};

export type Wallet = {
  balance: number;
  signal_credits: number;
  premium: boolean;
  premium_expires_at: string | null;
  spotlight_until: string | null;
  prices: { signal: number; spotlight: number; spotlight_minutes: number };
  transactions: WalletTransaction[];
};

export type SwipeQuota = {
  /** 프리미엄이면 제한 없음 */
  unlimited: boolean;
  limit: number;
  used: number;
  /** 오늘 남은 횟수 (제한 없으면 null) */
  remaining: number | null;
  /** 횟수가 다시 채워지는 시각 (한국 시간 자정) */
  resets_at: string;
};

export const TRANSACTION_LABEL: Record<WalletTransaction['type'], string> = {
  purchase: '하트 구매',
  signal: '시그널 보내기',
  spotlight: '스포트라이트',
  bonus: '보너스',
  admin_grant: '운영팀 지급',
  refund: '환불',
};

const walletKey = (userId: string | undefined) => ['wallet', userId] as const;
export const quotaKey = (userId: string | undefined) => ['swipe-quota', userId] as const;

export function useWallet() {
  const userId = useAuthStore((s) => s.session?.user.id);
  return useQuery({
    queryKey: walletKey(userId),
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_wallet');
      if (error) throw error;
      return data as Wallet;
    },
  });
}

export function useSwipeQuota() {
  const userId = useAuthStore((s) => s.session?.user.id);
  return useQuery({
    queryKey: quotaKey(userId),
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_swipe_quota');
      if (error) throw error;
      return data as SwipeQuota;
    },
  });
}

/** 지갑·횟수·프로필(잔액 표시)을 새로 받아옵니다. 하트를 쓰거나 받은 뒤에 부릅니다. */
export function refreshWallet(userId: string) {
  queryClient.invalidateQueries({ queryKey: walletKey(userId) });
  queryClient.invalidateQueries({ queryKey: quotaKey(userId) });
  return refreshMyProfile(userId);
}

/** 하트가 모자랄 때 서버가 돌려주는 오류 */
export class NotEnoughHeartsError extends Error {}

/** 스포트라이트 켜기. 반환: 끝나는 시각 */
export async function activateSpotlight(userId: string): Promise<string> {
  const { data, error } = await supabase.rpc('activate_spotlight');
  if (error) {
    if (error.code === 'P0004') throw new NotEnoughHeartsError(error.message);
    throw error;
  }
  await refreshWallet(userId);
  queryClient.invalidateQueries({ queryKey: ['discover'] });
  return data as string;
}

/** "3시간 20분" 처럼 남은 시간 */
export function formatRemaining(until: string | null, now = Date.now()): string {
  if (!until) return '';
  const minutes = Math.max(0, Math.ceil((new Date(until).getTime() - now) / 60000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

export function formatDate(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}
