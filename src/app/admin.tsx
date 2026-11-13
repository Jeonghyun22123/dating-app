import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAdminStats } from '@/features/admin/api';
import { Dashboard } from '@/features/admin/dashboard';
import { Reports } from '@/features/admin/reports';
import { SelfieQueue } from '@/features/admin/selfie-queue';
import { Users } from '@/features/admin/users';

type Section = 'dashboard' | 'selfies' | 'reports' | 'users';

/**
 * 관리자 페이지 (/admin).
 * 이 화면에 들어올 수 있는지는 _layout 의 가드가 정하지만, 그건 화면 노출용일 뿐이고
 * 실제 데이터 접근 권한은 DB 함수와 Edge Function 이 호출마다 다시 확인합니다.
 */
export default function AdminScreen() {
  const router = useRouter();
  const [section, setSection] = useState<Section>('dashboard');
  const { data: stats } = useAdminStats();

  const tabs: { value: Section; label: string; count?: number }[] = [
    { value: 'dashboard', label: '대시보드' },
    { value: 'selfies', label: '셀카 심사', count: stats?.selfies_pending },
    { value: 'reports', label: '신고', count: stats?.reports_pending },
    { value: 'users', label: '회원' },
  ];

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="items-center border-b border-line bg-card px-4 pt-4">
        <View className="w-full max-w-3xl gap-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-2xl font-bold text-fg">관리자</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
              <Text className="text-sm font-semibold text-muted">앱으로 돌아가기</Text>
            </Pressable>
          </View>
          <View accessibilityRole="tablist" className="flex-row gap-1">
            {tabs.map((tab) => {
              const selected = section === tab.value;
              return (
                <Pressable
                  key={tab.value}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  onPress={() => setSection(tab.value)}
                  className={`flex-row items-center gap-1.5 border-b-2 px-3 py-2.5 ${selected ? 'border-brand-500' : 'border-transparent'}`}>
                  <Text className={`text-sm font-semibold ${selected ? 'text-brand-600' : 'text-muted'}`}>
                    {tab.label}
                  </Text>
                  {tab.count ? (
                    <View className="min-w-5 items-center rounded-full bg-brand-500 px-1.5 py-0.5">
                      <Text className="text-xs font-bold text-white">{tab.count}</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      <ScrollView contentContainerClassName="items-center px-4 py-5" keyboardShouldPersistTaps="handled">
        <View className="w-full max-w-3xl">
          {section === 'dashboard' ? <Dashboard /> : null}
          {section === 'selfies' ? <SelfieQueue /> : null}
          {section === 'reports' ? <Reports /> : null}
          {section === 'users' ? <Users /> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
