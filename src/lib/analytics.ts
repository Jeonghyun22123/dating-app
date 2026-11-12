import PostHog from 'posthog-react-native';

import { env, isPostHogConfigured } from './env';

const isServer = typeof window === 'undefined';

/**
 * PostHog 클라이언트 (웹/iOS/Android 공용).
 * 키가 없거나 서버 렌더링 중이면 null 이며, 아래 헬퍼들은 조용히 아무 것도 하지 않습니다.
 */
export const posthog: PostHog | null =
  isPostHogConfigured && !isServer
    ? new PostHog(env.posthogKey, {
        host: env.posthogHost,
        // 앱 실행/포그라운드/백그라운드 이벤트 → 접속량·체류시간 분석에 사용
        captureAppLifecycleEvents: true,
      })
    : null;

/** 이벤트 이름은 여기에서만 정의해 오타와 중복을 막습니다. */
export const AnalyticsEvent = {
  SignUpCompleted: 'sign_up_completed',
  AdultVerified: 'adult_verified',
  ProfileCompleted: 'profile_completed',
  SwipeLike: 'swipe_like',
  SwipePass: 'swipe_pass',
  SignalSent: 'signal_sent',
  MatchCreated: 'match_created',
  MessageSent: 'message_sent',
  ReportSubmitted: 'report_submitted',
  PurchaseCompleted: 'purchase_completed',
} as const;

export type AnalyticsEventName = (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent];

type Properties = Record<string, string | number | boolean | null>;

export function track(event: AnalyticsEventName, properties?: Properties) {
  posthog?.capture(event, properties);
}

export function trackScreen(pathname: string) {
  posthog?.screen(pathname);
}

/**
 * 로그인 직후 호출. 개인정보 최소화를 위해 Supabase user id 만 식별자로 쓰고,
 * 닉네임·전화번호·생년월일·좌표 같은 개인정보는 PostHog에 보내지 않습니다.
 */
export function identifyUser(userId: string, traits?: Properties) {
  posthog?.identify(userId, traits);
}

/** 로그아웃 시 호출. 다음 사용자와 기록이 섞이지 않게 합니다. */
export function resetAnalytics() {
  posthog?.reset();
}
