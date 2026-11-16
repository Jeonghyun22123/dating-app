import { Stack } from 'expo-router';
import { useEffect } from 'react';

import { useInboxRealtime } from '@/features/chat/api';
import { hasPreferences } from '@/features/preferences/api';
import { PreferencesScreen } from '@/features/preferences/preferences-screen';
import { refreshEmbedding, useMyProfile } from '@/features/profile/api';
import { useSessionTracking } from '@/features/sessions/use-session-tracking';
import { useAuthStore } from '@/stores/auth-store';

export default function AppLayout() {
  const myId = useAuthStore((s) => s.session?.user.id);
  // 어느 화면에 있든 새 매칭·메시지를 받아 채팅 탭 배지를 갱신합니다.
  useInboxRealtime(myId);
  useSessionTracking(myId);

  // 만남 조건이 생기기 전에 가입한 사용자는 조건을 먼저 입력받습니다 (저장하면 자동으로 넘어갑니다).
  const { data: profile } = useMyProfile();
  // 성향 분석(임베딩)이 아직 없는 회원은 앱을 열 때 한 번 만들어 둡니다. 이미 있으면 서버가 건너뜁니다.
  const hasProfile = !!profile;
  useEffect(() => {
    if (myId && hasProfile) refreshEmbedding(true);
  }, [myId, hasProfile]);
  if (profile && !hasPreferences(profile)) {
    return (
      <PreferencesScreen
        profile={profile}
        title="만나고 싶은 사람을 알려주세요"
        subtitle="새로 생긴 설정이에요. 고른 조건에 맞는 사람만 추천해 드릴게요. 나중에 설정에서 바꿀 수 있어요."
        saveLabel="저장하고 시작하기"
      />
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="chat/[matchId]" />
      <Stack.Screen name="user/[id]" />
      <Stack.Screen name="selfie" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="preferences" />
      <Stack.Screen name="edit-profile" />
      <Stack.Screen name="edit-photos" />
      <Stack.Screen name="edit-location" />
      <Stack.Screen name="change-password" />
      <Stack.Screen name="delete-account" />
      <Stack.Screen name="wallet" />
      <Stack.Screen name="likes" />
    </Stack>
  );
}
