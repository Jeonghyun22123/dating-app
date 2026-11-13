import { useRouter } from 'expo-router';

import { LoadingScreen } from '@/components/ui/screen';
import { SelfieStep } from '@/features/onboarding/steps/selfie-step';
import { useAuthStore } from '@/stores/auth-store';

/** 셀카 인증이 반려된 사용자가 다시 제출하는 화면. */
export default function SelfieRetryScreen() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.session?.user.id);
  if (!userId) return <LoadingScreen />;
  return (
    <SelfieStep
      userId={userId}
      onDone={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}
    />
  );
}
