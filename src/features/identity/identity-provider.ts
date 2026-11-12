/**
 * 본인 확인 수단을 갈아끼울 수 있게 해 주는 경계.
 *
 * 지금: 'self_declared' — 사용자가 직접 입력한 성별·생년월일을 그대로 사용합니다.
 *       이 경우 profiles.is_adult_verified 는 false 로 남습니다 (자기 신고는 인증이 아님).
 *
 * 나중(PortOne PASS 본인인증)에 할 일:
 *   1. 온보딩의 IdentityStep 에서 PortOne SDK 를 열어 identityVerificationId 를 받습니다.
 *   2. 그 id 를 Edge Function(예: verify-identity)으로 보내면, 서버가 PortOne API 로 결과를 조회해
 *      성별·생년월일·is_adult_verified=true 를 profiles 에 직접 기록합니다.
 *   3. 아래 타입에 'portone' 결과를 추가하고, createProfile 에서 gender/birth_date 를
 *      클라이언트가 보내지 않도록 바꿉니다 (DB 의 insert 컬럼 권한도 함께 회수).
 * 화면과 검증 규칙(adult-verification.ts)은 그대로 재사용할 수 있습니다.
 */
import type { IdentityInfo } from './adult-verification';

export type IdentityMethod = 'self_declared' | 'portone';

export type IdentityResult = IdentityInfo & {
  method: IdentityMethod;
  /** 공인된 수단으로 확인되었는지. self_declared 는 항상 false. */
  verified: boolean;
};

export function selfDeclaredIdentity(identity: IdentityInfo): IdentityResult {
  return { ...identity, method: 'self_declared', verified: false };
}
