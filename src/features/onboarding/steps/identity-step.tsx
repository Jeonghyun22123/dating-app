import { type ComponentRef, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { ErrorText, Screen } from '@/components/ui/screen';
import { validateIdentity } from '@/features/identity/adult-verification';
import { selfDeclaredIdentity } from '@/features/identity/identity-provider';
import { signOut } from '@/lib/auth';
import { useOnboardingStore } from '@/stores/onboarding-store';
import type { Gender } from '@/types/db';
import { useThemeColors } from '@/theme/theme-view';

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'female', label: '여성' },
  { value: 'male', label: '남성' },
];

const dateInput =
  'h-14 rounded-2xl border border-line bg-card px-4 text-center text-base text-fg focus:border-brand-500';

/**
 * 성별·생년월일 입력 (자기 신고).
 * PortOne 본인인증을 붙일 때는 이 화면의 입력란을 "본인인증 하기" 버튼으로 바꾸고,
 * 결과를 같은 setIdentity 로 넘기면 이후 단계는 그대로 동작합니다.
 */
export function IdentityStep({ progress }: { progress: string }) {
  const colors = useThemeColors();
  const setIdentity = useOnboardingStore((s) => s.setIdentity);
  const [gender, setGender] = useState<Gender | null>(null);
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [error, setError] = useState<string | null>(null);
  const monthRef = useRef<ComponentRef<typeof TextInput>>(null);
  const dayRef = useRef<ComponentRef<typeof TextInput>>(null);

  const digits = (value: string) => value.replace(/\D/g, '');

  function handleNext() {
    const result = validateIdentity(gender, { year, month, day });
    if (!result.ok) return setError(result.message);
    setError(null);
    setIdentity(selfDeclaredIdentity(result.identity));
  }

  return (
    <Screen
      progress={progress}
      title="기본 정보를 알려주세요"
      subtitle="성별과 생년월일은 가입 후 변경할 수 없어요."
      footer={
        <>
          <Button title="다음" onPress={handleNext} />
          <Button title="로그아웃" variant="ghost" onPress={signOut} />
        </>
      }>
      <View className="gap-2">
        <Text className="text-sm font-medium text-muted">성별</Text>
        <View className="flex-row gap-3">
          {GENDERS.map((item) => {
            const selected = gender === item.value;
            return (
              <Pressable
                key={item.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                aria-checked={selected}
                onPress={() => setGender(item.value)}
                className={`h-14 flex-1 items-center justify-center rounded-2xl border ${selected ? 'border-brand-500 bg-brand-50' : 'border-line bg-card'}`}>
                <Text className={`text-base ${selected ? 'font-semibold text-brand-600' : 'text-muted'}`}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="gap-2">
        <Text className="text-sm font-medium text-muted">생년월일</Text>
        <View className="flex-row gap-3">
          <TextInput
            accessibilityLabel="태어난 연도"
            className={`${dateInput} flex-[1.4]`}
            placeholder="YYYY"
            placeholderTextColor={colors.subtle}
            inputMode="numeric"
            maxLength={4}
            value={year}
            onChangeText={(value) => {
              const next = digits(value);
              setYear(next);
              if (next.length === 4) monthRef.current?.focus();
            }}
          />
          <TextInput
            ref={monthRef}
            accessibilityLabel="태어난 월"
            className={`${dateInput} flex-1`}
            placeholder="MM"
            placeholderTextColor={colors.subtle}
            inputMode="numeric"
            maxLength={2}
            value={month}
            onChangeText={(value) => {
              const next = digits(value);
              setMonth(next);
              if (next.length === 2) dayRef.current?.focus();
            }}
          />
          <TextInput
            ref={dayRef}
            accessibilityLabel="태어난 일"
            className={`${dateInput} flex-1`}
            placeholder="DD"
            placeholderTextColor={colors.subtle}
            inputMode="numeric"
            maxLength={2}
            value={day}
            onChangeText={(value) => setDay(digits(value))}
            onSubmitEditing={handleNext}
          />
        </View>
        <ErrorText>{error}</ErrorText>
      </View>
    </Screen>
  );
}
