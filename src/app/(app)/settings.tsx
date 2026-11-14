import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { ActivityIndicator, Pressable, Switch, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import {
  NOTIFICATION_ITEMS,
  saveNotificationPrefs,
  useNotificationPrefs,
  type NotificationPrefs,
} from '@/features/settings/api';
import { formatAgeRange, GENDER_CHOICES, preferencesFromProfile } from '@/features/preferences/api';
import { useMyProfile } from '@/features/profile/api';
import { signOut } from '@/lib/auth';
import { useAuthStore } from '@/stores/auth-store';
import { useThemeStore } from '@/stores/theme-store';
import { useThemeColors } from '@/theme/theme-view';
import { hex, THEMES, type Theme } from '@/theme/themes';
import type { Profile } from '@/types/db';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-semibold text-muted">{title}</Text>
      <View className="overflow-hidden rounded-2xl border border-line bg-card">{children}</View>
    </View>
  );
}

/** 테마 미리보기: 그 테마의 배경·카드·강조색을 작은 견본으로 보여줍니다 (현재 테마와 무관한 고정 색). */
function ThemeOption({ theme, selected, onPress }: { theme: Theme; selected: boolean; onPress: () => void }) {
  const p = theme.palette;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      accessibilityLabel={`${theme.label} 테마`}
      onPress={onPress}
      className="flex-row items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 active:bg-field">
      <View
        style={{ backgroundColor: hex(p.bg), borderColor: hex(p.line) }}
        className="h-12 w-12 items-center justify-center rounded-xl border">
        <View
          style={{ backgroundColor: hex(p.card) }}
          className="h-7 w-8 items-center justify-center rounded-md">
          <View style={{ backgroundColor: hex(p.brand500) }} className="h-2.5 w-5 rounded-full" />
        </View>
      </View>
      <View className="flex-1">
        <Text className="text-base font-semibold text-fg">{theme.label}</Text>
        <Text className="text-sm text-muted">{theme.description}</Text>
      </View>
      {selected ? <Ionicons name="checkmark-circle" size={24} color={hex(p.brand500)} /> : null}
    </Pressable>
  );
}

function NotificationSection({ userId }: { userId: string }) {
  const colors = useThemeColors();
  const prefs = useNotificationPrefs(userId);
  const [error, setError] = useState<string | null>(null);

  async function toggle(key: keyof NotificationPrefs, value: boolean) {
    if (!prefs.data) return;
    setError(null);
    try {
      await saveNotificationPrefs(userId, { ...prefs.data, [key]: value });
    } catch {
      setError('설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
  }

  return (
    <View className="gap-2">
      <Section title="알림">
        {prefs.isPending ? (
          <View className="items-center py-6">
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : prefs.isError ? (
          <View className="gap-1 px-4 py-4">
            <Text className="text-base text-fg">알림 설정을 불러오지 못했어요.</Text>
            <Text className="text-sm leading-5 text-muted">
              처음이라면 Supabase 에서 supabase_settings.sql 을 실행해야 합니다.
            </Text>
          </View>
        ) : (
          NOTIFICATION_ITEMS.map((item) => (
            <View
              key={item.key}
              className="flex-row items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
              <View className="flex-1">
                <Text className="text-base font-semibold text-fg">{item.label}</Text>
                <Text className="text-sm text-muted">{item.description}</Text>
              </View>
              <Switch
                accessibilityLabel={item.label}
                value={prefs.data[item.key]}
                onValueChange={(value) => toggle(item.key, value)}
                trackColor={{ false: colors.line, true: colors.brand }}
                thumbColor="#ffffff"
                // 웹 전용 색 지정 (react-native-web)
                {...({ activeThumbColor: '#ffffff', activeTrackColor: colors.brand } as object)}
              />
            </View>
          ))
        )}
      </Section>
      {error ? <Text className="text-sm text-red-600">{error}</Text> : null}
      <Text className="text-sm leading-5 text-subtle">
        푸시 알림은 앱 출시 단계에서 제공될 예정이에요. 지금 고른 설정은 저장되어 그때부터 적용됩니다.
      </Text>
    </View>
  );
}

/** 설정 목록에 보여줄 현재 조건 요약 (예: "여성 · 25세 ~ 35세 · 30km 이내") */
function summarize(profile: Profile) {
  const prefs = preferencesFromProfile(profile);
  const gender = GENDER_CHOICES.find((choice) => choice.value === prefs.gender)?.label ?? '성별 미설정';
  return `${gender} · ${formatAgeRange(prefs.ageMin, prefs.ageMax)} · ${prefs.distanceKm}km 이내`;
}

export default function SettingsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const userId = useAuthStore((s) => s.session?.user.id);
  const email = useAuthStore((s) => s.session?.user.email);
  const { themeId, setTheme } = useThemeStore();
  const version = Constants.expoConfig?.version ?? '';
  const { data: profile } = useMyProfile();

  return (
    <Screen>
      <View className="flex-row items-center gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="뒤로"
          hitSlop={8}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}>
          <Ionicons name="chevron-back" size={28} color={colors.fg} />
        </Pressable>
        <Text className="text-3xl font-bold text-fg">설정</Text>
      </View>

      {profile ? (
        <Section title="만남">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="만남 조건"
            onPress={() => router.push('/preferences')}
            className="flex-row items-center gap-3 px-4 py-3 active:bg-field">
            <View className="flex-1">
              <Text className="text-base font-semibold text-fg">만남 조건</Text>
              <Text className="text-sm text-muted">{summarize(profile)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.subtle} />
          </Pressable>
        </Section>
      ) : null}

      <Section title="화면 테마">
        {THEMES.map((theme) => (
          <ThemeOption
            key={theme.id}
            theme={theme}
            selected={themeId === theme.id}
            onPress={() => setTheme(theme.id)}
          />
        ))}
      </Section>

      {userId ? <NotificationSection userId={userId} /> : null}

      <Section title="계정">
        <View className="px-4 py-3">
          <Text className="text-sm text-muted">로그인한 이메일</Text>
          <Text className="text-base text-fg">{email}</Text>
        </View>
      </Section>
      <Button title="로그아웃" variant="secondary" onPress={signOut} />

      {version ? <Text className="text-center text-sm text-subtle">버전 {version}</Text> : null}
    </Screen>
  );
}
