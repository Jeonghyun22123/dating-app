import { useRouter } from 'expo-router';

import { LoadingScreen } from '@/components/ui/screen';
import { LocationStep } from '@/features/onboarding/steps/location-step';
import { useMyProfile } from '@/features/profile/api';

/** 프로필 수정 > 동네 다시 설정 (온보딩의 동네 단계를 그대로 씁니다). */
export default function EditLocationRoute() {
  const router = useRouter();
  const { data: profile } = useMyProfile();
  if (!profile) return <LoadingScreen />;
  const close = () => (router.canGoBack() ? router.back() : router.replace('/edit-profile'));
  return (
    <LocationStep
      userId={profile.id}
      initialName={profile.neighborhood_name ?? ''}
      onDone={close}
      onBack={close}
    />
  );
}
