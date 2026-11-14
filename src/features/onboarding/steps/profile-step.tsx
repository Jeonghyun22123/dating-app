import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { ErrorText, Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { defaultPreferences } from '@/features/preferences/api';
import { PreferencesForm } from '@/features/preferences/preferences-form';
import { createProfile, refreshMyProfile } from '@/features/profile/api';
import { HOBBY_TAGS, LIMITS, PURPOSES } from '@/features/profile/constants';
import { AnalyticsEvent, track } from '@/lib/analytics';
import { useOnboardingStore } from '@/stores/onboarding-store';
import type { Purpose } from '@/types/db';

export function ProfileStep({ userId, progress }: { userId: string; progress: string }) {
  const { identity, setIdentity } = useOnboardingStore();
  const [nickname, setNickname] = useState('');
  const [purpose, setPurpose] = useState<Purpose | null>(null);
  const [hobbies, setHobbies] = useState<string[]>([]);
  const [bio, setBio] = useState('');
  // 나이 기본값(내 나이 ±5세)은 앞 단계에서 입력한 생년월일로 정합니다.
  const [prefs, setPrefs] = useState(() => defaultPreferences(identity?.birthDate ?? '2000-01-01'));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function toggleHobby(tag: string) {
    setHobbies((current) =>
      current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag],
    );
  }

  async function handleSave() {
    if (!identity) return;
    const name = nickname.trim();
    if (name.length < LIMITS.nicknameMin || name.length > LIMITS.nicknameMax) {
      return setError(`닉네임은 ${LIMITS.nicknameMin}~${LIMITS.nicknameMax}자로 입력해 주세요.`);
    }
    if (!purpose) return setError('만남 목적을 선택해 주세요.');
    if (hobbies.length === 0) return setError('취미를 1개 이상 선택해 주세요.');
    const prefGender = prefs.gender;
    if (!prefGender) return setError('만나고 싶은 성별을 선택해 주세요.');

    setError(null);
    setSaving(true);
    try {
      await createProfile(userId, identity, { nickname: name, purpose, hobbies, bio }, { ...prefs, gender: prefGender });
      track(AnalyticsEvent.ProfileCompleted, { purpose, hobby_count: hobbies.length });
      await refreshMyProfile(userId);
    } catch (e) {
      const message = (e as { message?: string }).message ?? '';
      setError(
        message.includes('19세')
          ? '만 19세 이상만 가입할 수 있습니다.'
          : '프로필을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      progress={progress}
      title="프로필을 만들어 볼까요?"
      subtitle="어떤 사람인지, 어떤 만남을 원하는지 알려주세요."
      footer={
        <>
          <ErrorText>{error}</ErrorText>
          <Button title="저장하고 계속" onPress={handleSave} loading={saving} />
          <Button title="이전" variant="ghost" onPress={() => setIdentity(null)} disabled={saving} />
        </>
      }>
      <TextField
        label="닉네임"
        value={nickname}
        onChangeText={setNickname}
        placeholder="2~20자"
        maxLength={LIMITS.nicknameMax}
      />

      <View className="gap-2">
        <Text className="text-sm font-medium text-muted">만남 목적</Text>
        {PURPOSES.map((item) => {
          const selected = purpose === item.value;
          return (
            <Pressable
              key={item.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              aria-checked={selected}
              onPress={() => setPurpose(item.value)}
              className={`rounded-2xl border px-4 py-3 ${selected ? 'border-brand-500 bg-brand-50' : 'border-line bg-card'}`}>
              <Text className={`text-base font-semibold ${selected ? 'text-brand-600' : 'text-fg'}`}>
                {item.label}
              </Text>
              <Text className="text-sm text-muted">{item.description}</Text>
            </Pressable>
          );
        })}
      </View>

      <View className="gap-2">
        <Text className="text-sm font-medium text-muted">
          취미 ({hobbies.length}/{LIMITS.hobbiesMax})
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {HOBBY_TAGS.map((tag) => {
            const selected = hobbies.includes(tag);
            return (
              <Chip
                key={tag}
                label={tag}
                selected={selected}
                disabled={!selected && hobbies.length >= LIMITS.hobbiesMax}
                onPress={() => toggleHobby(tag)}
              />
            );
          })}
        </View>
      </View>

      <TextField
        label="자기소개 (선택)"
        value={bio}
        onChangeText={setBio}
        placeholder="주말엔 주로 뭘 하는지, 어떤 사람을 만나고 싶은지 적어보세요."
        multiline
        maxLength={LIMITS.bioMax}
        hint={`${bio.length}/${LIMITS.bioMax}`}
      />

      <View className="gap-4 border-t border-line pt-6">
        <View className="gap-1">
          <Text className="text-xl font-bold text-fg">만나고 싶은 사람</Text>
          <Text className="text-sm text-muted">나중에 설정에서 언제든 바꿀 수 있어요.</Text>
        </View>
        <PreferencesForm value={prefs} onChange={setPrefs} />
      </View>
    </Screen>
  );
}
