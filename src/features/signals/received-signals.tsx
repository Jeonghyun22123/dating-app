import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { formatTime } from '@/features/chat/api';
import { SafetySheet } from '@/features/safety/safety-sheet';
import { useThemeColors } from '@/theme/theme-view';

import { dropSignal, respondSignal, type ReceivedSignal } from './api';

function SignalCard({ signal, myId }: { signal: ReceivedSignal; myId: string }) {
  const router = useRouter();
  const colors = useThemeColors();
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [safetyOpen, setSafetyOpen] = useState(false);

  async function respond(accept: boolean) {
    setError(null);
    setBusy(accept ? 'accept' : 'decline');
    try {
      const matchId = await respondSignal(signal.sender_id, accept);
      if (matchId) router.push(`/chat/${matchId}`);
    } catch {
      setError('처리하지 못했어요. 잠시 후 다시 시도해 주세요.');
      setBusy(null);
    }
  }

  return (
    <View className="gap-3 rounded-2xl border border-brand-300 bg-card p-4">
      <View className="flex-row items-center gap-3">
        <Avatar url={signal.photoUrl} name={signal.nickname} size={48} />
        <View className="flex-1">
          <Text className="text-base font-semibold text-fg">
            {signal.nickname}, {signal.age}
          </Text>
          <Text className="text-sm text-muted">
            {signal.neighborhood_name} · {formatTime(signal.sent_at)}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${signal.nickname}님 신고 또는 차단`}
          hitSlop={8}
          onPress={() => setSafetyOpen(true)}>
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.muted} />
        </Pressable>
      </View>

      <View className="rounded-2xl bg-brand-50 px-4 py-3">
        <Text className="text-base leading-6 text-fg">{signal.message}</Text>
      </View>

      {error ? <Text className="text-sm text-red-600">{error}</Text> : null}
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button
            title="거절"
            variant="secondary"
            onPress={() => respond(false)}
            loading={busy === 'decline'}
            disabled={busy !== null}
          />
        </View>
        <View className="flex-[2]">
          <Button
            title="수락하고 대화하기"
            onPress={() => respond(true)}
            loading={busy === 'accept'}
            disabled={busy !== null}
          />
        </View>
      </View>

      <SafetySheet
        visible={safetyOpen}
        onClose={() => setSafetyOpen(false)}
        myId={myId}
        target={{ id: signal.sender_id, nickname: signal.nickname }}
        onRemoved={() => dropSignal(signal.sender_id)}
      />
    </View>
  );
}

/** 채팅 탭 위쪽에 보여주는 "받은 시그널" 목록. 없으면 아무것도 그리지 않습니다. */
export function ReceivedSignals({ signals, myId }: { signals: ReceivedSignal[]; myId: string }) {
  if (signals.length === 0) return null;
  return (
    <View className="gap-3">
      <View className="gap-1">
        <Text className="text-lg font-bold text-fg">받은 시그널 {signals.length}</Text>
        <Text className="text-sm text-muted">수락하면 바로 대화가 시작돼요. 거절은 상대에게 알려지지 않아요.</Text>
      </View>
      {signals.map((signal) => (
        <SignalCard key={signal.sender_id} signal={signal} myId={myId} />
      ))}
    </View>
  );
}
