/**
 * 성인(만 19세 이상) 검증 로직.
 * 화면·네트워크와 무관한 순수 함수만 둡니다. 같은 규칙이 DB 트리거
 * (supabase_phase2.sql 의 enforce_adult_on_signup)에도 있으므로 기준을 바꿀 때는 둘 다 수정하세요.
 */
import type { Gender } from '@/types/db';

export const ADULT_AGE = 19;

export type BirthDateInput = { year: string; month: string; day: string };

export type IdentityInfo = {
  gender: Gender;
  /** YYYY-MM-DD */
  birthDate: string;
};

/** 한국 시간 기준 오늘 날짜 (기기 시간대와 무관하게 동일한 기준 적용). */
export function todayInKorea(now: Date = new Date()): { year: number; month: number; day: number } {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return { year: kst.getUTCFullYear(), month: kst.getUTCMonth() + 1, day: kst.getUTCDate() };
}

/** 입력값을 YYYY-MM-DD 로 변환. 존재하지 않는 날짜(2월 30일 등)면 null. */
export function parseBirthDate(input: BirthDateInput): string | null {
  if (!/^\d{4}$/.test(input.year) || !/^\d{1,2}$/.test(input.month) || !/^\d{1,2}$/.test(input.day)) {
    return null;
  }
  const year = Number(input.year);
  const month = Number(input.month);
  const day = Number(input.day);
  const date = new Date(Date.UTC(year, month - 1, day));
  const isRealDate =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!isRealDate || year < 1900) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** 만 나이. 생일이 아직 지나지 않았으면 한 살 적습니다. */
export function calculateAge(birthDate: string, now: Date = new Date()): number {
  const [year, month, day] = birthDate.split('-').map(Number);
  const today = todayInKorea(now);
  const hadBirthday = today.month > month || (today.month === month && today.day >= day);
  return today.year - year - (hadBirthday ? 0 : 1);
}

export function isAdult(birthDate: string, now: Date = new Date()): boolean {
  return calculateAge(birthDate, now) >= ADULT_AGE;
}

export type IdentityValidation =
  | { ok: true; identity: IdentityInfo }
  | { ok: false; field: 'gender' | 'birthDate'; message: string };

export function validateIdentity(
  gender: Gender | null,
  birth: BirthDateInput,
  now: Date = new Date(),
): IdentityValidation {
  if (!gender) return { ok: false, field: 'gender', message: '성별을 선택해 주세요.' };

  const birthDate = parseBirthDate(birth);
  if (!birthDate) return { ok: false, field: 'birthDate', message: '생년월일을 정확히 입력해 주세요.' };

  const age = calculateAge(birthDate, now);
  if (age < 0) return { ok: false, field: 'birthDate', message: '생년월일을 정확히 입력해 주세요.' };
  if (age < ADULT_AGE) {
    return { ok: false, field: 'birthDate', message: `만 ${ADULT_AGE}세 이상만 가입할 수 있습니다.` };
  }
  return { ok: true, identity: { gender, birthDate } };
}
