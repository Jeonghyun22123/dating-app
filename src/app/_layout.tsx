import '../global.css';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Button } from '@/components/ui/button';
import { LoadingScreen, Screen } from '@/components/ui/screen';
import { useMyProfile } from '@/features/profile/api';
import { signOut } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/env';
import { AppProviders } from '@/providers/app-providers';
import { useAuthStore } from '@/stores/auth-store';

/**
 * 로그인/온보딩 상태에 따라 들어갈 수 있는 화면 묶음을 나눕니다.
 *   로그아웃 상태        → sign-in, sign-up
 *   로그인 + 온보딩 전   → onboarding
 *   로그인 + 온보딩 완료 → (app)
 *   로그인 + 관리자      → admin (추가로 접근 가능)
 *   정지된 계정          → 안내 화면만
 * 조건에 맞지 않는 주소로 들어오면 Expo Router 가 허용된 화면으로 돌려보냅니다.
 */
function RootNavigator() {
  const { session, isReady } = useAuthStore();
  const profile = useMyProfile();

  if (!isSupabaseConfigured) {
    return (
      <Screen
        title="Supabase 설정이 필요해요"
        subtitle=".env.example 을 .env.local 로 복사해 Supabase URL 과 anon 키를 채운 뒤 개발 서버를 다시 시작하세요.">
        <Text className="text-sm text-neutral-500">배포 환경이라면 호스팅 서비스의 환경변수에 같은 값을 등록하세요.</Text>
      </Screen>
    );
  }

  if (!isReady || (session && profile.isPending)) return <LoadingScreen />;

  if (session && profile.isError) {
    return (
      <Screen title="프로필을 불러오지 못했어요" subtitle="네트워크 연결을 확인한 뒤 다시 시도해 주세요.">
        <Button title="다시 시도" onPress={() => profile.refetch()} loading={profile.isRefetching} />
      </Screen>
    );
  }

  if (session && profile.data?.is_banned) {
    return (
      <Screen
        title="이용이 정지된 계정이에요"
        subtitle="커뮤니티 가이드 위반으로 계정 이용이 제한되었습니다. 문의가 있으면 고객센터로 연락해 주세요.">
        <Button title="로그아웃" variant="secondary" onPress={signOut} />
      </Screen>
    );
  }

  const signedIn = !!session;
  // 화면 노출용 확인일 뿐입니다. 실제 권한은 DB 함수가 매번 다시 검사합니다.
  const isAdmin = signedIn && profile.data?.role === 'admin';
  const onboarded = !!profile.data?.onboarding_completed_at;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !onboarded}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && onboarded}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={isAdmin}>
        <Stack.Screen name="admin" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    // 카드 밀기 같은 제스처가 동작하려면 앱 전체를 이 뷰로 감싸야 합니다.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppProviders>
        <StatusBar style="dark" />
        <RootNavigator />
      </AppProviders>
    </GestureHandlerRootView>
  );
}
