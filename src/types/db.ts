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
  onboarding_completed_at: string | null;
  selfie_submitted_at: string | null;
};

export const PROFILE_COLUMNS =
  'id, role, nickname, gender, birth_date, is_adult_verified, purpose, hobbies, bio, neighborhood_name, trust_score, verification_status, coin_balance, is_premium, onboarding_completed_at, selfie_submitted_at';

export type ProfilePhoto = {
  id: string;
  user_id: string;
  storage_path: string;
  position: number;
  moderation_status: ModerationStatus;
  moderation_reason: string | null;
};
