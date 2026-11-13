import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import {
  formatTime,
  markRead,
  MESSAGE_MAX,
  sendMessage,
  unmatch,
  useChatRealtime,
  useMatches,
  useMessages,
  type Message,
} from '@/features/chat/api';
import { SafetySheet } from '@/features/safety/safety-sheet';
import { AnalyticsEvent, track } from '@/lib/analytics';
import { useAuthStore } from '@/stores/auth-store';
import { useThemeColors } from '@/theme/theme-view';

function Bubble({ message, mine }: { message: Message; mine: boolean }) {
  return (
    <View className={`mb-2 max-w-[80%] ${mine ? 'self-end items-end' : 'self-start items-start'}`}>
      <View className={`rounded-2xl px-4 py-2.5 ${mine ? 'bg-brand-500' : 'bg-card'}`}>
        <Text className={`text-base leading-6 ${mine ? 'text-white' : 'text-fg'}`}>{message.content}</Text>
      </View>
      <Text className="mt-1 text-xs text-subtle">
        {mine && message.is_read ? '읽음 · ' : ''}
        {formatTime(message.created_at)}
      </Text>
    </View>
  );
}

export default function ChatScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const myId = useAuthStore((s) => s.session?.user.id);
  const { data: matches, isPending: matchesPending } = useMatches();
  const match = matches?.find((item) => item.match_id === matchId);
  const messages = useMessages(matchId);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [safetyOpen, setSafetyOpen] = useState(false);

  useChatRealtime(matchId, myId);

  // 채팅방에 들어오면 받은 메시지를 읽음 처리합니다.
  useEffect(() => {
    if (myId) markRead(matchId, myId);
  }, [matchId, myId]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/matches'));

  async function handleSend() {
    const content = draft.trim();
    if (!content || !myId || sending) return;
    setError(null);
    setSending(true);
    setDraft('');
    try {
      await sendMessage(matchId, myId, content);
      track(AnalyticsEvent.MessageSent);
    } catch {
      setDraft(content);
      setError('메시지를 보내지 못했어요.');
    } finally {
      setSending(false);
    }
  }

  // 목록에 없는 매칭(차단됨, 남의 대화, 잘못된 주소)은 열 수 없습니다.
  if (!matchesPending && !match) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-4 bg-bg px-6">
        <Text className="text-center text-base text-muted">대화를 찾을 수 없어요.</Text>
        <Pressable accessibilityRole="button" onPress={goBack}>
          <Text className="text-base font-semibold text-brand-600">채팅 목록으로</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const active = match?.is_active ?? true;

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View className="flex-row items-center gap-3 border-b border-line bg-card px-4 py-3">
          <Pressable accessibilityRole="button" accessibilityLabel="뒤로" hitSlop={8} onPress={goBack}>
            <Ionicons name="chevron-back" size={26} color={colors.fg} />
          </Pressable>
          {match ? <Avatar url={match.photoUrl} name={match.nickname} size={36} /> : null}
          <Text className="flex-1 text-lg font-semibold text-fg">{match?.nickname ?? ''}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="신고, 차단, 매칭 해제"
            hitSlop={8}
            onPress={() => setSafetyOpen(true)}>
            <Ionicons name="ellipsis-horizontal" size={24} color={colors.muted} />
          </Pressable>
        </View>

        {messages.isPending ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : (
          <FlatList
            inverted
            data={messages.data ?? []}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <Bubble message={item} mine={item.sender_id === myId} />}
            contentContainerClassName="px-4 py-3"
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              // 뒤집힌 목록 안에서는 내용도 뒤집히므로 다시 돌려 놓습니다.
              <View className="items-center py-16" style={{ transform: [{ scaleY: -1 }] }}>
                <Text className="text-base text-muted">첫 메시지를 보내 대화를 시작해 보세요.</Text>
              </View>
            }
          />
        )}

        {error ? <Text className="px-4 pb-1 text-sm text-red-600">{error}</Text> : null}

        {active ? (
          <View className="flex-row items-end gap-2 border-t border-line bg-card px-4 py-3">
            <TextInput
              accessibilityLabel="메시지 입력"
              className="max-h-32 min-h-12 flex-1 rounded-2xl bg-field px-4 py-3 text-base text-fg"
              placeholder="메시지 보내기"
              placeholderTextColor={colors.subtle}
              value={draft}
              onChangeText={setDraft}
              maxLength={MESSAGE_MAX}
              multiline
              rows={1}
              // 웹: Enter 로 전송, Shift+Enter 로 줄바꿈
              onKeyPress={(event) => {
                const key = event.nativeEvent as unknown as { key: string; shiftKey?: boolean };
                if (Platform.OS === 'web' && key.key === 'Enter' && !key.shiftKey) {
                  event.preventDefault();
                  handleSend();
                }
              }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="보내기"
              disabled={!draft.trim() || sending}
              onPress={handleSend}
              className={`h-12 w-12 items-center justify-center rounded-full bg-brand-500 ${!draft.trim() || sending ? 'opacity-40' : ''}`}>
              <Ionicons name="arrow-up" size={22} color="#ffffff" />
            </Pressable>
          </View>
        ) : (
          <View className="border-t border-line bg-card px-4 py-4">
            <Text className="text-center text-sm text-muted">대화가 종료되어 메시지를 보낼 수 없어요.</Text>
          </View>
        )}
      </KeyboardAvoidingView>

      {myId && match ? (
        <SafetySheet
          visible={safetyOpen}
          onClose={() => setSafetyOpen(false)}
          myId={myId}
          target={{ id: match.other_id, nickname: match.nickname }}
          matchId={matchId}
          onUnmatch={active ? () => unmatch(matchId) : undefined}
          onRemoved={goBack}
        />
      ) : null}
    </SafeAreaView>
  );
}
