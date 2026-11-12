import { useState } from 'react';
import { Text } from 'react-native';

import { Button } from '@/components/ui/button';
import { ErrorText, Screen } from '@/components/ui/screen';
import { completeOnboarding, refreshMyProfile } from '@/features/profile/api';
import type { Profile } from '@/types/db';

export function DoneStep({ profile }: { profile: Profile }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    setError(null);
    setLoading(true);
    try {
      // 서버가 필수 단계를 모두 마쳤는지 다시 확인한 뒤 완료 처리합니다.
      await completeOnboarding();
      await refreshMyProfile(profile.id);
    } catch (e) {
      setError((e as { message?: string }).message ?? '완료 처리에 실패했어요. 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen
      title={`${profile.nickname}님, 준비가 끝났어요`}
      subtitle={
        profile.verification_status === 'approved'
          ? '본인 확인까지 완료되었어요.'
          : '셀카 인증은 심사 중이에요. 결과가 나오면 프로필에 인증 표시가 붙어요.'
      }
      footer={
        <>
          <ErrorText>{error}</ErrorText>
          <Button title="시작하기" onPress={handleStart} loading={loading} />
        </>
      }>
      <Text className="text-base leading-6 text-neutral-600">
        이제 {profile.neighborhood_name} 근처의 사람들을 만나볼 수 있어요.
      </Text>
    </Screen>
  );
}
