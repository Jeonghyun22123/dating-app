import { calculateAge } from '@/features/identity/adult-verification';
import { refreshMyProfile } from '@/features/profile/api';
import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import type { Gender, Profile } from '@/types/db';

/** 만남 조건의 허용 범위. DB 의 check 제약(supabase_phase5.sql)과 같아야 합니다. */
export const PREF_LIMITS = {
  ageMin: 19,
  /** 이 값은 "60세 이상"(상한 없음)을 뜻합니다 */
  ageMax: 60,
  distanceMin: 10,
  distanceMax: 500,
  distanceStep: 10,
  defaultDistance: 30,
} as const;

export type GenderChoice = 'male' | 'female' | 'both';

export type MatchPreferences = {
  /** 아직 고르지 않았으면 null (성별은 반드시 직접 골라야 합니다) */
  gender: GenderChoice | null;
  ageMin: number;
  ageMax: number;
  distanceKm: number;
};

export const GENDER_CHOICES: { value: GenderChoice; label: string }[] = [
  { value: 'female', label: '여성' },
  { value: 'male', label: '남성' },
  { value: 'both', label: '둘 다' },
];

const clampAge = (age: number) => Math.min(Math.max(age, PREF_LIMITS.ageMin), PREF_LIMITS.ageMax);

/** 처음 보여줄 값: 나이는 내 나이 ±5세, 거리는 30km, 성별은 비워 둠 */
export function defaultPreferences(birthDate: string): MatchPreferences {
  const age = calculateAge(birthDate);
  return {
    gender: null,
    ageMin: clampAge(age - 5),
    ageMax: clampAge(age + 5),
    distanceKm: PREF_LIMITS.defaultDistance,
  };
}

/** 저장된 프로필 → 화면 값 (설정 전이면 기본값) */
export function preferencesFromProfile(profile: Profile): MatchPreferences {
  const fallback = defaultPreferences(profile.birth_date);
  const genders = profile.pref_genders;
  return {
    gender: !genders ? null : genders.length === 2 ? 'both' : genders[0],
    ageMin: profile.pref_age_min ?? fallback.ageMin,
    ageMax: profile.pref_age_max ?? fallback.ageMax,
    distanceKm: profile.pref_distance_km ?? fallback.distanceKm,
  };
}

/** 화면 값 → DB 컬럼 */
export function toColumns(prefs: MatchPreferences & { gender: GenderChoice }) {
  const genders: Gender[] = prefs.gender === 'both' ? ['male', 'female'] : [prefs.gender];
  return {
    pref_genders: genders,
    pref_age_min: prefs.ageMin,
    pref_age_max: prefs.ageMax,
    pref_distance_km: prefs.distanceKm,
  };
}

export const hasPreferences = (profile: Profile) => !!profile.pref_genders;

export function formatAgeRange(min: number, max: number) {
  const upper = max >= PREF_LIMITS.ageMax ? `${PREF_LIMITS.ageMax}세 이상` : `${max}세`;
  return `${min}세 ~ ${upper}`;
}

export async function savePreferences(userId: string, prefs: MatchPreferences & { gender: GenderChoice }) {
  const { error } = await supabase.from('profiles').update(toColumns(prefs)).eq('id', userId);
  if (error) throw error;
  await refreshMyProfile(userId);
  // 조건이 바뀌면 추천 목록도 새로 받아옵니다.
  queryClient.invalidateQueries({ queryKey: ['discover'] });
}
