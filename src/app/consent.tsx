import { LoadingScreen } from '@/components/ui/screen';
import { useConsentStatus } from '@/features/consent/api';
import { ConsentScreen } from '@/features/consent/consent-screen';
import { useAuthStore } from '@/stores/auth-store';

/** 약관 동의 (가입 직후, 또는 약관 버전이 바뀐 뒤 첫 접속). 동의하면 _layout 의 가드가 다음 화면으로 보냅니다. */
export default function ConsentRoute() {
  const userId = useAuthStore((s) => s.session?.user.id);
  const { data } = useConsentStatus();
  if (!userId || !data) return <LoadingScreen />;
  return <ConsentScreen userId={userId} status={data} />;
}
