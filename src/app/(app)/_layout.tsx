import { Stack } from 'expo-router';

import { useInboxRealtime } from '@/features/chat/api';
import { useAuthStore } from '@/stores/auth-store';

export default function AppLayout() {
  const myId = useAuthStore((s) => s.session?.user.id);
  // 어느 화면에 있든 새 매칭·메시지를 받아 채팅 탭 배지를 갱신합니다.
  useInboxRealtime(myId);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="chat/[matchId]" />
      <Stack.Screen name="selfie" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}
