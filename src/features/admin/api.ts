/**
 * 관리자 화면 전용 데이터 접근.
 * 모든 호출은 DB 함수(admin_*)나 Edge Function 이 관리자 여부를 서버에서 다시 확인합니다.
 */
import { useQuery } from '@tanstack/react-query';

import { SELFIE_BUCKET, signPhotoPaths } from '@/features/photos/api';
import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import type { Gender, VerificationStatus } from '@/types/db';

export type AdminStats = Record<
  | 'users_total'
  | 'users_onboarded'
  | 'users_new_today'
  | 'users_new_7d'
  | 'users_active_24h'
  | 'users_banned'
  | 'gender_female'
  | 'gender_male'
  | 'purpose_friend'
  | 'purpose_hobby'
  | 'purpose_serious'
  | 'verified_approved'
  | 'selfies_pending'
  | 'photos_pending'
  | 'matches_total'
  | 'matches_7d'
  | 'messages_7d'
  | 'reports_pending'
  | 'sessions_24h'
  | 'avg_session_minutes_7d',
  number
>;

export type SelfieReviewItem = {
  id: string;
  nickname: string;
  age: number;
  gender: Gender;
  neighborhood_name: string | null;
  selfie_submitted_at: string;
  photo_paths: string[];
  /** 심사용 셀카 (파일이 없으면 null) */
  selfieUrl: string | null;
  photoUrls: string[];
};

export type SnapshotMessage = { id: string; sender_id: string; content: string; created_at: string };

export type ReportStatus = 'pending' | 'reviewed' | 'resolved';

export type AdminReport = {
  id: string;
  created_at: string;
  status: ReportStatus;
  reason: string;
  description: string | null;
  admin_note: string | null;
  chat_snapshot: SnapshotMessage[] | null;
  reporter_id: string | null;
  reporter_nickname: string | null;
  reported_user_id: string;
  reported_nickname: string;
  reported_is_banned: boolean;
  reported_report_count: number;
};

export type AdminUser = {
  id: string;
  email: string;
  nickname: string;
  age: number;
  gender: Gender;
  neighborhood_name: string | null;
  verification_status: VerificationStatus;
  is_banned: boolean;
  role: 'user' | 'admin';
  created_at: string;
  last_active_at: string | null;
  report_count: number;
  /** 신뢰 점수 (0.0 ~ 5.0) */
  trust_score: number;
  coin_balance: number;
  /** 프리미엄이면 만료 시각 (무기한이면 'infinity'), 아니면 null */
  premium_until: string | null;
};

const adminKey = ['admin'] as const;
const refreshAdmin = () => queryClient.invalidateQueries({ queryKey: adminKey });

/**
 * 하트·프리미엄을 바꾼 뒤에는 관리자 화면뿐 아니라 앱의 내 정보도 새로 받아옵니다.
 * (관리자가 자기 계정에 지급한 경우 내 프로필·하트 화면에 바로 반영되도록)
 */
async function refreshAfterGrant() {
  await Promise.all([
    refreshAdmin(),
    queryClient.invalidateQueries({ queryKey: ['profile'] }),
    queryClient.invalidateQueries({ queryKey: ['wallet'] }),
    queryClient.invalidateQueries({ queryKey: ['swipe-quota'] }),
  ]);
}

export function useAdminStats() {
  return useQuery({
    queryKey: [...adminKey, 'stats'],
    refetchOnMount: 'always',
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_stats');
      if (error) throw error;
      return data as AdminStats;
    },
  });
}

/** 셀카는 5분짜리 주소로만 불러옵니다 (관리자 전용 열람 정책). */
async function signSelfie(userId: string): Promise<string | null> {
  const bucket = supabase.storage.from(SELFIE_BUCKET);
  const { data: files } = await bucket.list(userId, { sortBy: { column: 'created_at', order: 'desc' } });
  const latest = files?.[0];
  if (!latest) return null;
  const { data } = await bucket.createSignedUrl(`${userId}/${latest.name}`, 60 * 5);
  return data?.signedUrl ?? null;
}

export function useSelfieQueue() {
  return useQuery({
    queryKey: [...adminKey, 'selfies'],
    refetchOnMount: 'always',
    queryFn: async (): Promise<SelfieReviewItem[]> => {
      const { data, error } = await supabase.rpc('admin_selfie_queue');
      if (error) throw error;
      const rows = (data ?? []) as Omit<SelfieReviewItem, 'selfieUrl' | 'photoUrls'>[];
      const photoUrls = await signPhotoPaths(rows.flatMap((row) => row.photo_paths));
      return Promise.all(
        rows.map(async (row) => ({
          ...row,
          selfieUrl: await signSelfie(row.id),
          photoUrls: row.photo_paths.flatMap((path) => photoUrls.get(path) ?? []),
        })),
      );
    },
  });
}

export type PhotoChangeItem = {
  id: string;
  nickname: string;
  age: number;
  gender: Gender;
  neighborhood_name: string | null;
  requested_at: string | null;
  current_paths: string[];
  new_paths: string[];
  /** 요청하면서 방금 찍은 셀카 (파일이 없으면 null) */
  selfieUrl: string | null;
  /** 지금 공개 중인 사진 */
  currentUrls: string[];
  /** 검토를 기다리는 새 사진 */
  newUrls: string[];
};

/** 사진수정 심사 목록: 회원이 새로 올린 사진과 방금 찍은 셀카, 기존 사진을 함께 불러옵니다. */
export function usePhotoChangeQueue() {
  return useQuery({
    queryKey: [...adminKey, 'photo-changes'],
    // 요청은 회원 쪽에서 생기므로 관리자 화면을 열 때마다 새로 받아옵니다.
    refetchOnMount: 'always',
    queryFn: async (): Promise<PhotoChangeItem[]> => {
      const { data, error } = await supabase.rpc('admin_photo_change_queue');
      if (error) throw error;
      const rows = (data ?? []) as Omit<PhotoChangeItem, 'selfieUrl' | 'currentUrls' | 'newUrls'>[];
      const urls = await signPhotoPaths(rows.flatMap((row) => [...row.current_paths, ...row.new_paths]));
      return Promise.all(
        rows.map(async (row) => ({
          ...row,
          selfieUrl: await signSelfie(row.id),
          currentUrls: row.current_paths.flatMap((path) => urls.get(path) ?? []),
          newUrls: row.new_paths.flatMap((path) => urls.get(path) ?? []),
        })),
      );
    },
  });
}

/**
 * 사진 변경 요청 승인/반려. 승인하면 새 사진이 한 번에 공개되고, 반려하면 기존 사진이 유지됩니다.
 * note 는 반려 사유로 회원에게 보입니다. 서버가 판정과 동시에 셀카 파일을 삭제합니다.
 */
export async function reviewPhotoChange(userId: string, approve: boolean, note?: string) {
  const { error } = await supabase.functions.invoke('admin-review-selfie', {
    body: { kind: 'photo_change', user_id: userId, approve, note },
  });
  if (error) throw error;
  await Promise.all([
    refreshAdmin(),
    // 관리자가 자기 계정의 요청을 처리한 경우 내 프로필에도 바로 반영되도록
    queryClient.invalidateQueries({ queryKey: ['profile'] }),
    queryClient.invalidateQueries({ queryKey: ['profile-photos'] }),
  ]);
}

export type BackfillResult = { processed: number; remaining: number } | { skipped: true; reason: string };

/** 성향 분석(임베딩)이 없는 회원을 한 번에 최대 100명 채웁니다. OpenAI 키가 없으면 skipped. */
export async function backfillEmbeddings(): Promise<BackfillResult> {
  const { data, error } = await supabase.functions.invoke<BackfillResult>('update-profile-embedding', {
    body: { mode: 'backfill' },
  });
  if (error || !data) throw error ?? new Error('backfill_failed');
  // 순서가 바뀌었을 수 있으므로 둘러보기 목록을 새로 받아옵니다.
  await queryClient.invalidateQueries({ queryKey: ['discover'] });
  return data;
}

export type ReviewTarget = 'signup' | 'photo_change';

export type AdminSettings = {
  economy?: Economy;
  /** 신규회원 심사 방식. 'auto' = AI 먼저 */
  selfie_verification: { mode: 'manual' | 'auto'; auto_approve_threshold: number };
  /** 사진수정 심사 방식 */
  photo_review?: { mode: 'manual' | 'ai' };
  face_compare: { available: boolean };
};

const settingsKey = [...adminKey, 'settings'] as const;

export function useAdminSettings() {
  return useQuery({
    queryKey: settingsKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_settings');
      if (error) throw error;
      return data as AdminSettings;
    },
  });
}

/** 해당 심사가 'AI 먼저' 방식인지 */
export function isAiFirst(settings: AdminSettings | undefined, target: ReviewTarget) {
  return target === 'signup'
    ? settings?.selfie_verification?.mode === 'auto'
    : settings?.photo_review?.mode === 'ai';
}

/** 심사 방식 변경: ai=true 면 AI 가 먼저 보고 통과하면 바로 반영, false 면 관리자가 전부 직접 승인. */
export async function setReviewMode(target: ReviewTarget, ai: boolean) {
  const { data, error } = await supabase.rpc('admin_set_review_mode', {
    p_target: target,
    p_mode: ai ? 'ai' : 'manual',
  });
  if (error) throw error;
  queryClient.setQueryData(settingsKey, data as AdminSettings);
}

/** 승인/반려. 서버가 판정과 동시에 셀카 파일을 삭제합니다. */
export async function reviewSelfie(userId: string, approve: boolean) {
  const { error } = await supabase.functions.invoke('admin-review-selfie', {
    body: { user_id: userId, approve },
  });
  if (error) throw error;
  await refreshAdmin();
}

export function useAdminReports(status: ReportStatus | 'all') {
  return useQuery({
    queryKey: [...adminKey, 'reports', status],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_list_reports', { p_status: status });
      if (error) throw error;
      return (data ?? []) as AdminReport[];
    },
  });
}

export async function resolveReport(reportId: string, status: 'reviewed' | 'resolved', note: string) {
  const { error } = await supabase.rpc('admin_resolve_report', {
    p_report_id: reportId,
    p_status: status,
    p_note: note,
  });
  if (error) throw error;
  await refreshAdmin();
}

export function useAdminUsers(search: string) {
  return useQuery({
    queryKey: [...adminKey, 'users', search],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_list_users', { p_search: search, p_limit: 50 });
      if (error) throw error;
      return (data ?? []) as AdminUser[];
    },
  });
}

export async function setBanned(userId: string, banned: boolean, reason?: string) {
  const { error } = await supabase.rpc('admin_set_banned', {
    p_user_id: userId,
    p_banned: banned,
    p_reason: reason ?? null,
  });
  if (error) throw error;
  await refreshAdmin();
}

/** 하트 지급(양수) 또는 회수(음수) */
export async function grantHearts(userId: string, amount: number, note?: string) {
  const { error } = await supabase.rpc('admin_grant_hearts', {
    p_user: userId,
    p_amount: amount,
    p_note: note ?? null,
  });
  if (error) throw error;
  await refreshAfterGrant();
}

/** 프리미엄 지정 (days = 0 이면 해제). 결제(Phase 8) 전 테스트용 */
export async function setPremium(userId: string, days: number) {
  const { error } = await supabase.rpc('admin_set_premium', { p_user: userId, p_days: days });
  if (error) throw error;
  await refreshAfterGrant();
}

export type Economy = {
  daily_swipe_limit: number;
  signal_heart_cost: number;
  spotlight_heart_cost: number;
  spotlight_minutes: number;
};

export async function updateEconomy(e: Economy) {
  const { error } = await supabase.rpc('admin_update_economy', {
    p_daily_swipe_limit: e.daily_swipe_limit,
    p_signal_heart_cost: e.signal_heart_cost,
    p_spotlight_heart_cost: e.spotlight_heart_cost,
    p_spotlight_minutes: e.spotlight_minutes,
  });
  if (error) throw error;
  // 횟수·가격이 바뀌면 둘러보기의 남은 횟수, 하트 화면의 가격, 추천 목록도 새 기준으로 다시 받아옵니다.
  await Promise.all([refreshAfterGrant(), queryClient.invalidateQueries({ queryKey: ['discover'] })]);
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const GENDER_LABEL: Record<Gender, string> = { female: '여성', male: '남성' };
