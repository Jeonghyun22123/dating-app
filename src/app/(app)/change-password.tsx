import { useRouter } from 'expo-router';

import { NewPasswordScreen } from '@/features/account/password-form';

/** 설정 > 비밀번호 변경 */
export default function ChangePasswordRoute() {
  const router = useRouter();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/settings'));
  return (
    <NewPasswordScreen
      title="비밀번호 변경"
      subtitle="새로 사용할 비밀번호를 입력해 주세요."
      onDone={close}
      onBack={close}
    />
  );
}
