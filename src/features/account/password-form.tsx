import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { ErrorText, Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { authErrorMessage, PASSWORD_MIN, updatePassword } from '@/lib/auth';

type Props = {
  title: string;
  subtitle: string;
  onDone: () => void;
  onBack?: () => void;
  /** 재설정 링크로 들어온 경우의 보조 버튼 (예: 로그아웃) */
  secondary?: { title: string; onPress: () => void };
};

/** 새 비밀번호 입력 (설정의 비밀번호 변경, 메일 링크로 들어온 비밀번호 재설정 공용). */
export function NewPasswordScreen({ title, subtitle, onDone, onBack, secondary }: Props) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSave() {
    if (password.length < PASSWORD_MIN) return setError(`비밀번호는 ${PASSWORD_MIN}자 이상으로 설정해 주세요.`);
    if (password !== confirm) return setError('비밀번호가 서로 일치하지 않습니다.');
    setError(null);
    setSaving(true);
    try {
      await updatePassword(password);
      setDone(true);
    } catch (e) {
      setError(authErrorMessage(e as { message?: string; code?: string }));
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <Screen title="비밀번호를 바꿨어요" subtitle="다음 로그인부터 새 비밀번호를 사용하세요.">
        <Button title="확인" onPress={onDone} />
      </Screen>
    );
  }

  return (
    <Screen
      title={title}
      subtitle={subtitle}
      onBack={onBack}
      footer={
        <>
          <ErrorText>{error}</ErrorText>
          <Button title="비밀번호 바꾸기" onPress={handleSave} loading={saving} />
          {secondary ? (
            <Button title={secondary.title} variant="ghost" onPress={secondary.onPress} disabled={saving} />
          ) : null}
        </>
      }>
      <TextField
        label="새 비밀번호"
        value={password}
        onChangeText={setPassword}
        placeholder={`${PASSWORD_MIN}자 이상`}
        secureTextEntry
        autoComplete="new-password"
      />
      <TextField
        label="새 비밀번호 확인"
        value={confirm}
        onChangeText={setConfirm}
        placeholder="한 번 더 입력"
        secureTextEntry
        autoComplete="new-password"
        onSubmitEditing={handleSave}
      />
    </Screen>
  );
}
