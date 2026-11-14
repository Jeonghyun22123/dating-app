import { useRouter } from 'expo-router';

import { LoadingScreen } from '@/components/ui/screen';
import { PreferencesScreen } from '@/features/preferences/preferences-screen';
import { useMyProfile } from '@/features/profile/api';

/** 설정 > 만남 조건 */
export default function PreferencesRoute() {
  const router = useRouter();
  const { data: profile } = useMyProfile();
  if (!profile) return <LoadingScreen />;

  const close = () => (router.canGoBack() ? router.back() : router.replace('/settings'));
  return (
    <PreferencesScreen
      profile={profile}
      title="만남 조건"
      subtitle="어떤 사람을 추천받고 싶은지 정해주세요."
      saveLabel="저장"
      onSaved={close}
      onCancel={close}
    />
  );
}
