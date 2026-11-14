import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { ErrorText, Screen } from '@/components/ui/screen';
import { signOut } from '@/lib/auth';
import { useThemeColors } from '@/theme/theme-view';

import { acceptConsents, type ConsentStatus } from './api';
import type { LegalDocId } from './documents';

type Item = { id: LegalDocId; label: string; required: boolean };

const ITEMS: Item[] = [
  { id: 'terms', label: '이용약관', required: true },
  { id: 'privacy', label: '개인정보 수집·이용', required: true },
  { id: 'location', label: '위치정보 이용', required: true },
  { id: 'marketing', label: '이벤트·혜택 정보 수신', required: false },
];

function Check({ checked }: { checked: boolean }) {
  const colors = useThemeColors();
  return (
    <Ionicons
      name={checked ? 'checkmark-circle' : 'ellipse-outline'}
      size={26}
      color={checked ? colors.brand : colors.subtle}
    />
  );
}

/**
 * 약관 동의 화면. 가입 직후(프로필을 만들기 전)와, 약관 버전이 바뀐 뒤 처음 접속할 때 보여줍니다.
 * 필수 3개에 동의해야 다음으로 넘어갈 수 있습니다.
 */
export function ConsentScreen({ userId, status }: { userId: string; status: ConsentStatus }) {
  const router = useRouter();
  const [checked, setChecked] = useState<Record<LegalDocId, boolean>>({
    terms: false,
    privacy: false,
    location: false,
    marketing: status.marketing,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allChecked = ITEMS.every((item) => checked[item.id]);
  const requiredDone = ITEMS.filter((item) => item.required).every((item) => checked[item.id]);

  function toggleAll() {
    const next = !allChecked;
    setChecked({ terms: next, privacy: next, location: next, marketing: next });
  }

  async function handleAgree() {
    if (!requiredDone) return setError('필수 항목에 모두 동의해 주세요.');
    setError(null);
    setSaving(true);
    try {
      await acceptConsents(userId, status.version, checked.marketing);
    } catch (e) {
      const detail = (e as { message?: string }).message ?? '';
      setError(/[가-힣]/.test(detail) ? detail : '저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      title="서비스 이용 동의"
      subtitle="안전한 만남을 위해 아래 내용을 확인해 주세요."
      footer={
        <>
          <ErrorText>{error}</ErrorText>
          <Button title="동의하고 계속" onPress={handleAgree} loading={saving} disabled={!requiredDone} />
          <Button title="로그아웃" variant="ghost" onPress={signOut} disabled={saving} />
        </>
      }>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: allChecked }}
        aria-checked={allChecked}
        accessibilityLabel="전체 동의"
        onPress={toggleAll}
        className="flex-row items-center gap-3 rounded-2xl border border-line bg-card px-4 py-4">
        <Check checked={allChecked} />
        <View className="flex-1">
          <Text className="text-lg font-bold text-fg">전체 동의</Text>
          <Text className="text-sm text-muted">선택 항목(이벤트·혜택 수신)을 포함합니다.</Text>
        </View>
      </Pressable>

      <View className="gap-1">
        {ITEMS.map((item) => (
          <View key={item.id} className="flex-row items-center gap-3 px-2 py-2">
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: checked[item.id] }}
              aria-checked={checked[item.id]}
              accessibilityLabel={`${item.required ? '필수' : '선택'} ${item.label}`}
              onPress={() => setChecked({ ...checked, [item.id]: !checked[item.id] })}
              className="flex-1 flex-row items-center gap-3">
              <Check checked={checked[item.id]} />
              <Text className="flex-1 text-base text-fg">
                <Text className={item.required ? 'font-semibold text-brand-600' : 'text-muted'}>
                  {item.required ? '[필수] ' : '[선택] '}
                </Text>
                {item.label}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`${item.label} 전문 보기`}
              hitSlop={8}
              onPress={() => router.push(`/legal/${item.id}`)}>
              <Text className="text-sm text-subtle underline">보기</Text>
            </Pressable>
          </View>
        ))}
      </View>

      <Text className="text-sm leading-5 text-subtle">
        만 19세 이상만 이용할 수 있어요. 선택 항목은 동의하지 않아도 이용할 수 있고, 설정에서 언제든 바꿀 수 있어요.
      </Text>
    </Screen>
  );
}
