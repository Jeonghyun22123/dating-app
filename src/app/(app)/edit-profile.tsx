import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { ErrorText, LoadingScreen, Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { refreshMyProfile, updateProfile, useMyProfile } from '@/features/profile/api';
import { HOBBY_TAGS, LIMITS, PURPOSES } from '@/features/profile/constants';
import type { Profile, Purpose } from '@/types/db';

function EditForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [nickname, setNickname] = useState(profile.nickname);
  const [purpose, setPurpose] = useState<Purpose>(profile.purpose);
  const [hobbies, setHobbies] = useState<string[]>(profile.hobbies);
  const [bio, setBio] = useState(profile.bio ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile'));

  function toggleHobby(tag: string) {
    setHobbies((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));
  }

  async function handleSave() {
    const name = nickname.trim();
    if (name.length < LIMITS.nicknameMin || name.length > LIMITS.nicknameMax) {
      return setError(`닉네임은 ${LIMITS.nicknameMin}~${LIMITS.nicknameMax}자로 입력해 주세요.`);
    }
    if (hobbies.length === 0) return setError('취미를 1개 이상 선택해 주세요.');
    setError(null);
    setSaving(true);
    try {
      await updateProfile(profile.id, { nickname: name, purpose, hobbies, bio });
      await refreshMyProfile(profile.id);
      back();
    } catch {
      setError('저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
      setSaving(false);
    }
  }

  return (
    <Screen
      title="프로필 수정"
      onBack={back}
      footer={
        <>
          <ErrorText>{error}</ErrorText>
          <Button title="저장" onPress={handleSave} loading={saving} />
        </>
      }>
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button title="사진 관리" variant="secondary" onPress={() => router.push('/edit-photos')} />
        </View>
        <View className="flex-1">
          <Button title="동네 다시 설정" variant="secondary" onPress={() => router.push('/edit-location')} />
        </View>
      </View>

      <TextField label="닉네임" value={nickname} onChangeText={setNickname} maxLength={LIMITS.nicknameMax} />

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
        label="자기소개"
        value={bio}
        onChangeText={setBio}
        placeholder="주말엔 주로 뭘 하는지, 어떤 사람을 만나고 싶은지 적어보세요."
        multiline
        maxLength={LIMITS.bioMax}
        hint={`${bio.length}/${LIMITS.bioMax} · 50자 이상 적으면 신뢰 점수가 올라가요`}
      />

      <Text className="text-sm leading-5 text-subtle">성별과 생년월일은 바꿀 수 없어요.</Text>
    </Screen>
  );
}

/** 내 프로필 > 프로필 수정 */
export default function EditProfileScreen() {
  const { data: profile } = useMyProfile();
  if (!profile) return <LoadingScreen />;
  return <EditForm profile={profile} />;
}
