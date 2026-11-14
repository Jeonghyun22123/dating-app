import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { ErrorText, Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { deleteAccount } from '@/lib/auth';

const CONFIRM_WORD = '탈퇴';

/** 설정 > 회원 탈퇴. 확인 문구를 직접 입력해야 진행됩니다. */
export default function DeleteAccountScreen() {
  const router = useRouter();
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/settings'));

  async function handleDelete() {
    if (typed.trim() !== CONFIRM_WORD) return;
    setError(null);
    setDeleting(true);
    try {
      // 성공하면 로그아웃되면서 _layout 의 가드가 로그인 화면으로 보냅니다.
      await deleteAccount();
    } catch {
      setError('탈퇴를 처리하지 못했어요. 잠시 후 다시 시도해 주세요.');
      setDeleting(false);
    }
  }

  return (
    <Screen
      title="회원 탈퇴"
      subtitle="탈퇴하면 되돌릴 수 없어요. 아래 내용을 확인해 주세요."
      onBack={back}
      footer={
        <>
          <ErrorText>{error}</ErrorText>
          <Button
            title="탈퇴하기"
            onPress={handleDelete}
            loading={deleting}
            disabled={typed.trim() !== CONFIRM_WORD}
          />
          <Button title="취소" variant="ghost" onPress={back} disabled={deleting} />
        </>
      }>
      <View className="gap-3 rounded-2xl border border-line bg-card p-4">
        <Text className="text-base font-semibold text-fg">바로 삭제되는 정보</Text>
        <Text className="text-base leading-6 text-muted">
          프로필, 사진, 만남 조건, 관심·시그널 기록, 매칭과 모든 대화, 남은 시그널
        </Text>
        <Text className="mt-2 text-base font-semibold text-fg">보관되는 정보</Text>
        <Text className="text-base leading-6 text-muted">
          다른 회원이 나를 신고한 기록과 내가 접수한 신고는 분쟁 해결과 악용 방지를 위해 남아요. 이름은 "탈퇴한
          사용자"로 표시돼요.
        </Text>
      </View>
      <TextField
        label={`확인을 위해 "${CONFIRM_WORD}"라고 입력해 주세요`}
        value={typed}
        onChangeText={setTyped}
        placeholder={CONFIRM_WORD}
        autoCapitalize="none"
      />
    </Screen>
  );
}
