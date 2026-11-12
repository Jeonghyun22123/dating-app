import { useState } from 'react';

import { LoadingScreen } from '@/components/ui/screen';
import { DoneStep } from '@/features/onboarding/steps/done-step';
import { IdentityStep } from '@/features/onboarding/steps/identity-step';
import { LocationStep } from '@/features/onboarding/steps/location-step';
import { PhotosStep } from '@/features/onboarding/steps/photos-step';
import { ProfileStep } from '@/features/onboarding/steps/profile-step';
import { SelfieStep } from '@/features/onboarding/steps/selfie-step';
import { useMyPhotos } from '@/features/photos/api';
import { useMyProfile } from '@/features/profile/api';
import { useAuthStore } from '@/stores/auth-store';
import { useOnboardingStore } from '@/stores/onboarding-store';

const TOTAL = 5;
const step = (n: number) => `${n} / ${TOTAL}`;

/**
 * 온보딩 마법사. 어느 단계를 보여줄지는 서버에 저장된 상태로 결정하므로,
 * 중간에 앱을 껐다 켜도 하던 단계부터 이어집니다.
 *   1 기본 정보 → 2 프로필 → 3 동네 → 4 사진 → 5 셀카 → 완료
 */
export default function OnboardingScreen() {
  const userId = useAuthStore((s) => s.session?.user.id);
  const identity = useOnboardingStore((s) => s.identity);
  const { data: profile } = useMyProfile();
  const photos = useMyPhotos(profile ? userId : undefined);
  const [photosConfirmed, setPhotosConfirmed] = useState(false);

  if (!userId) return <LoadingScreen />;

  if (!profile) {
    return identity ? <ProfileStep userId={userId} progress={step(2)} /> : <IdentityStep progress={step(1)} />;
  }

  if (!profile.neighborhood_name) return <LocationStep userId={userId} progress={step(3)} />;

  if (photos.isPending) return <LoadingScreen />;
  const hasPhoto = (photos.data ?? []).some((photo) => photo.moderation_status !== 'rejected');
  // 이미 셀카까지 제출한 사용자가 돌아온 경우가 아니면, 사진 단계는 "다음"을 눌러야 넘어갑니다.
  if (!hasPhoto || (!photosConfirmed && !profile.selfie_submitted_at)) {
    return <PhotosStep userId={userId} progress={step(4)} onDone={() => setPhotosConfirmed(true)} />;
  }

  if (!profile.selfie_submitted_at) return <SelfieStep userId={userId} progress={step(5)} />;

  return <DoneStep profile={profile} />;
}
