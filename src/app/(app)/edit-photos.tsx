import { useRouter } from 'expo-router';

import { LoadingScreen } from '@/components/ui/screen';
import { ManagePhotos } from '@/features/photos/manage-photos';
import { useAuthStore } from '@/stores/auth-store';

/** 프로필 수정 > 사진 관리. */
export default function EditPhotosRoute() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.session?.user.id);
  if (!userId) return <LoadingScreen />;
  const close = () => (router.canGoBack() ? router.back() : router.replace('/edit-profile'));
  return <ManagePhotos userId={userId} onClose={close} />;
}
