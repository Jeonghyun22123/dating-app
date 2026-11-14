export type Gender = 'male' | 'female';
export type Purpose = 'friend' | 'hobby' | 'serious';
export type VerificationStatus = 'pending' | 'approved' | 'rejected';
export type ModerationStatus = 'pending' | 'approved' | 'rejected';

/** 앱에서 읽는 내 프로필. 좌표(location)와 임베딩은 클라이언트로 가져오지 않습니다. */
export type Profile = {
  id: string;
  role: 'user' | 'admin';
  nickname: string;
  gender: Gender;
  birth_date: string;
  is_adult_verified: boolean;
  purpose: Purpose;
  hobbies: string[];
  bio: string | null;
  neighborhood_name: string | null;
  trust_score: number;
  verification_status: VerificationStatus;
  coin_balance: number;
  is_premium: boolean;
  is_banned: boolean;
  onboarding_completed_at: string | null;
  selfie_submitted_at: string | null;
  /** 만남 조건. 아직 설정하지 않았으면 null (Phase 5 이전 가입자) */
  pref_genders: Gender[] | null;
  pref_age_min: number | null;
  /** 60 은 "60세 이상"(상한 없음) */
  pref_age_max: number | null;
  pref_distance_km: number | null;
  /** 남은 시그널 횟수 (가입 시 5회). 서버만 차감합니다 */
  signal_credits: number;
};

export const PROFILE_COLUMNS =
  'id, role, nickname, gender, birth_date, is_adult_verified, purpose, hobbies, bio, neighborhood_name, trust_score, verification_status, coin_balance, is_premium, is_banned, onboarding_completed_at, selfie_submitted_at, pref_genders, pref_age_min, pref_age_max, pref_distance_km, signal_credits';

export type ProfilePhoto = {
  id: string;
  user_id: string;
  storage_path: string;
  position: number;
  moderation_status: ModerationStatus;
  moderation_reason: string | null;
};
