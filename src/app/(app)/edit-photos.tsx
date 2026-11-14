import { useRouter } from 'expo-router';

import { LoadingScreen } from '@/components/ui/screen';
import { PhotosStep } from '@/features/onboarding/steps/photos-step';
import { useAuthStore } from '@/stores/auth-store';

/** 프로필 수정 > 사진 관리 (온보딩의 사진 단계를 그대로 씁니다). */
export default function EditPhotosRoute() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.session?.user.id);
  if (!userId) return <LoadingScreen />;
  const close = () => (router.canGoBack() ? router.back() : router.replace('/edit-profile'));
  return <PhotosStep userId={userId} title="사진 관리" doneLabel="완료" onDone={close} onBack={close} />;
}
