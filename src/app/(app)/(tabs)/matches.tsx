import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { formatTime, useMatches, type MatchSummary } from '@/features/chat/api';
import { useAuthStore } from '@/stores/auth-store';

function MatchRow({ match, myId, onPress }: { match: MatchSummary; myId?: string; onPress: () => void }) {
  const preview = !match.is_active
    ? '대화가 종료되었어요'
    : match.last_message
      ? `${match.last_sender_id === myId ? '나: ' : ''}${match.last_message}`
      : '새로운 인연이에요. 먼저 인사해 보세요.';
  const unread = match.unread_count > 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${match.nickname}님과의 대화`}
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-2xl bg-white p-3 active:bg-neutral-100">
      <Avatar url={match.photoUrl} name={match.nickname} />
      <View className="flex-1 gap-1">
        <View className="flex-row items-center justify-between gap-2">
          <Text className="text-base font-semibold text-neutral-900">{match.nickname}</Text>
          <Text className="text-xs text-neutral-400">{formatTime(match.last_message_at ?? match.matched_at)}</Text>
        </View>
        <View className="flex-row items-center justify-between gap-2">
          <Text
            numberOfLines={1}
            className={`flex-1 text-sm ${unread ? 'font-semibold text-neutral-900' : 'text-neutral-500'}`}>
            {preview}
          </Text>
          {unread ? (
            <View className="min-w-5 items-center rounded-full bg-brand-500 px-1.5 py-0.5">
              <Text className="text-xs font-bold text-white">{match.unread_count > 99 ? '99+' : match.unread_count}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export default function MatchesScreen() {
  const router = useRouter();
  const myId = useAuthStore((s) => s.session?.user.id);
  const matches = useMatches();
  const { refetch } = matches;

  // 이 탭으로 돌아올 때마다 목록을 새로 받아옵니다 (실시간 연결이 끊겼던 경우 대비).
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  return (
    <Screen title="채팅">
      {matches.isPending ? (
        <View className="items-center py-24">
          <ActivityIndicator size="large" color="#f43f5e" />
        </View>
      ) : matches.isError ? (
        <View className="gap-4 py-16">
          <Text className="text-center text-base text-neutral-600">채팅 목록을 불러오지 못했어요.</Text>
          <Button title="다시 시도" variant="secondary" onPress={() => matches.refetch()} />
        </View>
      ) : matches.data.length === 0 ? (
        <View className="gap-2 py-16">
          <Text className="text-center text-xl font-bold text-neutral-900">아직 연결된 사람이 없어요</Text>
          <Text className="text-center text-base leading-6 text-neutral-600">
            둘러보기에서 관심을 표현하면, 서로 통했을 때 여기에서 대화할 수 있어요.
          </Text>
        </View>
      ) : (
        <View className="gap-2">
          {matches.data.map((match) => (
            <MatchRow
              key={match.match_id}
              match={match}
              myId={myId}
              onPress={() => router.push(`/chat/${match.match_id}`)}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}
