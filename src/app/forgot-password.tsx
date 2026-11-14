import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { Button } from '@/components/ui/button';
import { ErrorText, Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { authErrorMessage, isValidEmail, requestPasswordReset } from '@/lib/auth';

/** 비밀번호 찾기: 가입한 이메일로 재설정 링크를 보냅니다. */
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/sign-in'));

  async function handleSend() {
    if (!isValidEmail(email)) return setError('이메일 주소를 정확히 입력해 주세요.');
    setError(null);
    setSending(true);
    try {
      await requestPasswordReset(email);
      setSentTo(email.trim());
    } catch (e) {
      setError(authErrorMessage(e as { message?: string; code?: string }));
    } finally {
      setSending(false);
    }
  }

  if (sentTo) {
    return (
      <Screen
        title="메일함을 확인해 주세요"
        subtitle={`${sentTo} 로 비밀번호 재설정 링크를 보냈어요. 링크를 누르면 새 비밀번호를 정할 수 있어요.`}
        onBack={back}>
        <Text className="text-sm leading-5 text-subtle">
          가입한 이메일이 아니면 메일이 가지 않아요. 메일이 보이지 않으면 스팸함을 확인해 주세요.
        </Text>
        <Button title="로그인 화면으로" variant="secondary" onPress={back} />
      </Screen>
    );
  }

  return (
    <Screen
      title="비밀번호 찾기"
      subtitle="가입한 이메일을 입력하면 비밀번호를 다시 정할 수 있는 링크를 보내드려요."
      onBack={back}
      footer={
        <>
          <ErrorText>{error}</ErrorText>
          <Button title="재설정 링크 보내기" onPress={handleSend} loading={sending} />
        </>
      }>
      <TextField
        label="이메일"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        inputMode="email"
        onSubmitEditing={handleSend}
      />
    </Screen>
  );
}
