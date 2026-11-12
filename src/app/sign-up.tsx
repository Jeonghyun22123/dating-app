import { Link } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { ErrorText, Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { AnalyticsEvent, track } from '@/lib/analytics';
import { authErrorMessage, isValidEmail, PASSWORD_MIN, signUp } from '@/lib/auth';

export default function SignUpScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSubmit() {
    if (!isValidEmail(email)) return setError('이메일 주소를 정확히 입력해 주세요.');
    if (password.length < PASSWORD_MIN) return setError(`비밀번호는 ${PASSWORD_MIN}자 이상으로 설정해 주세요.`);
    if (password !== passwordConfirm) return setError('비밀번호가 서로 일치하지 않습니다.');
    setError(null);
    setLoading(true);
    try {
      const result = await signUp(email, password);
      track(AnalyticsEvent.SignUpCompleted);
      if (result === 'confirm_email') setSentTo(email.trim());
    } catch (e) {
      setError(authErrorMessage(e as { message?: string; code?: string }));
    } finally {
      setLoading(false);
    }
  }

  if (sentTo) {
    return (
      <Screen
        title="메일함을 확인해 주세요"
        subtitle={`${sentTo} 로 인증 메일을 보냈어요. 메일의 링크를 누르면 가입이 완료됩니다.`}>
        <Text className="text-sm leading-5 text-neutral-500">
          메일이 보이지 않으면 스팸함을 확인해 주세요. 이미 가입된 이메일이라면 메일이 오지 않을 수 있어요.
        </Text>
        <Link href="/sign-in" replace className="text-base font-semibold text-brand-600">
          로그인 화면으로
        </Link>
      </Screen>
    );
  }

  return (
    <Screen title="회원가입" subtitle="만 19세 이상만 가입할 수 있어요.">
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
          placeholder={`${PASSWORD_MIN}자 이상`}
          secureTextEntry
          autoComplete="new-password"
        />
        <TextField
          label="비밀번호 확인"
          value={passwordConfirm}
          onChangeText={setPasswordConfirm}
          placeholder="비밀번호를 한 번 더 입력"
          secureTextEntry
          autoComplete="new-password"
          onSubmitEditing={handleSubmit}
        />
        <ErrorText>{error}</ErrorText>
      </View>
      <View className="gap-4">
        <Button title="가입하기" onPress={handleSubmit} loading={loading} />
        <View className="flex-row justify-center gap-1">
          <Text className="text-base text-neutral-600">이미 계정이 있나요?</Text>
          <Link href="/sign-in" replace className="text-base font-semibold text-brand-600">
            로그인
          </Link>
        </View>
      </View>
    </Screen>
  );
}
