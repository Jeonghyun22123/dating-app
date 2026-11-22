import '../global.css';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { Button } from '@/components/ui/button';
import { LoadingScreen, Screen } from '@/components/ui/screen';
import { NewPasswordScreen } from '@/features/account/password-form';
import { useConsentStatus } from '@/features/consent/api';
import { useMyProfile } from '@/features/profile/api';
import { signOut } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/env';
import { AppProviders } from '@/providers/app-providers';
import { useAuthStore } from '@/stores/auth-store';
import { useThemeStore } from '@/stores/theme-store';
import { ThemeView, useThemeColors } from '@/theme/theme-view';
import { WebSafeArea } from '@/theme/ios-viewport';
import { useWebStatusBar } from '@/theme/use-web-status-bar';
import { SplashCover } from '@/features/splash/splash-cover';

/**
 * 로그인/온보딩 상태에 따라 들어갈 수 있는 화면 묶음을 나눕니다.
 *   로그아웃 상태        → sign-in, sign-up
 *   로그인 + 약관 동의 전 → 동의 화면만 (가입 직후, 또는 약관 버전이 바뀐 뒤)
 *   로그인 + 온보딩 전   → onboarding
 *   로그인 + 온보딩 완료 → (app)
 *   로그인 + 관리자      → admin (추가로 접근 가능)
 *   정지된 계정          → 안내 화면만
 * 조건에 맞지 않는 주소로 들어오면 Expo Router 가 허용된 화면으로 돌려보냅니다.
 */
function RootNavigator() {
  const { session, isReady, recovering, setRecovering } = useAuthStore();
  const profile = useMyProfile();
  const themeReady = useThemeStore((s) => s.hydrated);
  const consent = useConsentStatus();

  if (!isSupabaseConfigured) {
    return (
      <Screen
        title="Supabase 설정이 필요해요"
        subtitle=".env.example 을 .env.local 로 복사해 Supabase URL 과 anon 키를 채운 뒤 개발 서버를 다시 시작하세요.">
        <Text className="text-sm text-muted">
          배포 환경이라면 호스팅 서비스의 환경변수에 같은 값을 등록하세요.
        </Text>
      </Screen>
    );
  }

  // 저장된 테마를 읽기 전에 그리면 잠깐 다른 색이 보이므로 기다립니다.
  if (!themeReady || !isReady || (session && (profile.isPending || consent.isPending)))
    return <LoadingScreen />;

  // 앱이 기대하는 컬럼(42703)이나 함수(PGRST202)가 DB 에 없으면 마이그레이션 SQL 을 아직 실행하지 않은 것입니다.
  const missing = (error: unknown) =>
    ['42703', 'PGRST202'].includes((error as { code?: string } | null)?.code ?? '');
  if (
    session &&
    ((profile.isError && missing(profile.error)) || (consent.isError && missing(consent.error)))
  ) {
    return (
      <Screen
        title="DB 업데이트가 필요해요"
        subtitle="앱이 새 버전으로 바뀌었는데 데이터베이스가 아직 이전 상태예요. Supabase 대시보드의 SQL Editor 에서 아직 실행하지 않은 SQL 파일(가장 최근: supabase_chat_images.sql)을 실행한 뒤 다시 시도해 주세요.">
        <Button
          title="다시 시도"
          onPress={() => {
            profile.refetch();
            consent.refetch();
          }}
          loading={profile.isRefetching || consent.isRefetching}
        />
        <Button title="로그아웃" variant="ghost" onPress={signOut} />
      </Screen>
    );
  }

  if (session && (profile.isError || consent.isError)) {
    return (
      <Screen title="프로필을 불러오지 못했어요" subtitle="네트워크 연결을 확인한 뒤 다시 시도해 주세요.">
        <Button
          title="다시 시도"
          onPress={() => {
            profile.refetch();
            consent.refetch();
          }}
          loading={profile.isRefetching || consent.isRefetching}
        />
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

  // 비밀번호 재설정 메일의 링크로 들어왔으면 새 비밀번호부터 정합니다.
  if (session && recovering) {
    return (
      <NewPasswordScreen
        title="새 비밀번호 설정"
        subtitle="앞으로 사용할 비밀번호를 입력해 주세요."
        onDone={() => setRecovering(false)}
        secondary={{ title: '로그아웃', onPress: signOut }}
      />
    );
  }

  const signedIn = !!session;
  // 약관 동의가 필요하면 동의 화면(과 약관 전문)만 열립니다.
  const needsConsent = signedIn && !!consent.data?.needs_consent;
  // 화면 노출용 확인일 뿐입니다. 실제 권한은 DB 함수가 매번 다시 검사합니다.
  const isAdmin = signedIn && profile.data?.role === 'admin';
  const onboarded = !!profile.data?.onboarding_completed_at;
  const member = signedIn && !needsConsent;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
        <Stack.Screen name="forgot-password" />
      </Stack.Protected>
      <Stack.Protected guard={needsConsent}>
        <Stack.Screen name="consent" />
      </Stack.Protected>
      <Stack.Protected guard={member && !onboarded}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={member && onboarded}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={member && isAdmin}>
        <Stack.Screen name="admin" />
      </Stack.Protected>
      {/* 약관 전문은 로그인 여부와 상관없이 열 수 있습니다 */}
      <Stack.Screen name="legal/[doc]" />
    </Stack>
  );
}

/** 어두운 테마에서는 상단 상태바(시계·배터리) 글자를 밝게 합니다. */
function ThemedStatusBar() {
  const colors = useThemeColors();
  // 웹(홈 화면에 추가한 웹앱 포함)은 시계 줄 색을 따로 맞춥니다.
  useWebStatusBar();
  return <StatusBar style={colors.dark ? 'light' : 'dark'} />;
}

/** 앱(네이티브)에서만 키보드 움직임을 화면이 매 순간 따라가도록 합니다. 웹은 그대로 둡니다. */
function NativeKeyboard({ children }: { children: React.ReactNode }) {
  if (Platform.OS === 'web') return <>{children}</>;
  return <KeyboardProvider>{children}</KeyboardProvider>;
}

export default function RootLayout() {
  return (
    // 카드 밀기 같은 제스처가 동작하려면 앱 전체를 이 뷰로 감싸야 합니다.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NativeKeyboard>
        {/* 앱 전체에 현재 테마의 색을 적용합니다 */}
        <ThemeView style={{ flex: 1 }}>
          {/* 웹: 시계 줄·홈 바 여백을 직접 읽어 알려줍니다 (아이폰 홈 화면 앱 보정) */}
          <WebSafeArea>
            <AppProviders>
              <ThemedStatusBar />
              <RootNavigator />
              <SplashCover />
            </AppProviders>
          </WebSafeArea>
        </ThemeView>
      </NativeKeyboard>
    </GestureHandlerRootView>
  );
}
