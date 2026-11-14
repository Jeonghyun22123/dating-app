import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { ErrorText, Screen } from '@/components/ui/screen';
import type { Profile } from '@/types/db';

import { preferencesFromProfile, savePreferences } from './api';
import { PreferencesForm } from './preferences-form';

type Props = {
  profile: Profile;
  title: string;
  subtitle: string;
  saveLabel: string;
  onSaved?: () => void;
  onCancel?: () => void;
};

/** 만남 조건을 고쳐 저장하는 화면 (설정에서 열거나, 조건이 없는 기존 가입자에게 먼저 보여줍니다). */
export function PreferencesScreen({ profile, title, subtitle, saveLabel, onSaved, onCancel }: Props) {
  const [prefs, setPrefs] = useState(() => preferencesFromProfile(profile));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const gender = prefs.gender;
    if (!gender) return setError('만나고 싶은 성별을 선택해 주세요.');
    setError(null);
    setSaving(true);
    try {
      await savePreferences(profile.id, { ...prefs, gender });
      onSaved?.();
    } catch {
      setError('저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      title={title}
      subtitle={subtitle}
      footer={
        <>
          <ErrorText>{error}</ErrorText>
          <Button title={saveLabel} onPress={handleSave} loading={saving} />
          {onCancel ? <Button title="취소" variant="ghost" onPress={onCancel} disabled={saving} /> : null}
        </>
      }>
      <PreferencesForm value={prefs} onChange={setPrefs} />
    </Screen>
  );
}
