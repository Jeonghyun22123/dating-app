import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { TextLink } from '@/components/ui/text-link';
import { ErrorText, Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { authErrorMessage, isValidEmail, signIn } from '@/lib/auth';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!isValidEmail(email)) return setError('이메일 주소를 정확히 입력해 주세요.');
    if (!password) return setError('비밀번호를 입력해 주세요.');
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
      // 성공하면 세션이 바뀌면서 _layout 의 가드가 알아서 다음 화면으로 보냅니다.
    } catch (e) {
      setError(authErrorMessage(e as { message?: string; code?: string }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen title="다시 만나서 반가워요" subtitle="이메일로 로그인해 주세요.">
      <View className="gap-4">
        <TextField
          label="이메일"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          inputMode="email"
        />
        <TextField
          label="비밀번호"
          value={password}
          onChangeText={setPassword}
          placeholder="비밀번호"
          secureTextEntry
          autoComplete="current-password"
          onSubmitEditing={handleSubmit}
        />
        <ErrorText>{error}</ErrorText>
      </View>
      <View className="gap-4">
        <Button title="로그인" onPress={handleSubmit} loading={loading} />
        <TextLink prompt="아직 계정이 없나요?" label="회원가입" href="/sign-up" />
      </View>
    </Screen>
  );
}
