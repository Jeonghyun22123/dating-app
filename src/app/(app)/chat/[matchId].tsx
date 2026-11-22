import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import {
  ChatImageError,
  formatClock,
  formatDateLine,
  markRead,
  MESSAGE_MAX,
  pickChatPhoto,
  sendChatImage,
  sendMessage,
  unmatch,
  useChatImageUrl,
  useChatRealtime,
  useMatches,
  useMessages,
  type Message,
  type PickedChatPhoto,
} from '@/features/chat/api';
import { SafetySheet } from '@/features/safety/safety-sheet';
import { AnalyticsEvent, track } from '@/lib/analytics';
import { useAuthStore } from '@/stores/auth-store';
import { ThemeView, useThemeColors } from '@/theme/theme-view';
import { useMarkAppReady } from '@/features/splash/store';
import { Button } from '@/components/ui/button';
import { photoSource } from '@/features/photos/api';
import { PhotoViewer } from '@/features/photos/photo-viewer';

const AVATAR = 36;

type Row = {
  message: Message;
  mine: boolean;
  /** 날짜가 바뀌는 첫 메시지: 위에 날짜 구분선을 그립니다 */
  newDay: boolean;
  /** 상대가 연달아 보낸 메시지 묶음의 첫 번째: 사진과 닉네임을 보여줍니다 */
  groupStart: boolean;
  /** 같은 사람이 같은 분에 보낸 묶음의 마지막: 시각을 보여줍니다 */
  showTime: boolean;
};

const dayOf = (iso: string) => new Date(iso).toDateString();
const minuteOf = (iso: string) => iso.slice(0, 16);

/**
 * 메시지 목록(최신이 앞)에 묶음 정보를 붙입니다.
 * 뒤집힌 목록이라 index + 1 이 시간상 바로 앞 메시지, index - 1 이 바로 뒤 메시지입니다.
 */
function toRows(messages: Message[], myId: string | undefined): Row[] {
  return messages.map((message, index) => {
    const older = messages[index + 1];
    const newer = messages[index - 1];
    const newDay = !older || dayOf(older.created_at) !== dayOf(message.created_at);
    return {
      message,
      mine: message.sender_id === myId,
      newDay,
      groupStart: newDay || older.sender_id !== message.sender_id,
      showTime:
        !newer ||
        newer.sender_id !== message.sender_id ||
        minuteOf(newer.created_at) !== minuteOf(message.created_at),
    };
  });
}

/** 사진 메시지. 누르면 화면 가득 크게 봅니다. */
function ChatImage({ path, mine }: { path: string; mine: boolean }) {
  const colors = useThemeColors();
  const { data: url, isError } = useChatImageUrl(path);
  const [viewer, setViewer] = useState<number | null>(null);
  return (
    <>
      <Pressable
        testID={mine ? 'chat-image-mine' : 'chat-image-theirs'}
        accessibilityRole="button"
        accessibilityLabel="사진 크게 보기"
        disabled={!url}
        onPress={() => setViewer(0)}
        style={{ width: 220, height: 280 }}
        className="items-center justify-center overflow-hidden rounded-2xl bg-field">
        {url ? (
          <Image
            source={photoSource(url)}
            transition={150}
            style={{ width: 220, height: 280 }}
            contentFit="cover"
          />
        ) : isError ? (
          <Text className="px-4 text-center text-sm text-muted">사진을 불러오지 못했어요</Text>
        ) : (
          <ActivityIndicator color={colors.brand} />
        )}
      </Pressable>
      {url ? <PhotoViewer urls={[url]} initialIndex={viewer} onClose={() => setViewer(null)} /> : null}
    </>
  );
}

function Bubble({
  row,
  other,
  onOpenProfile,
}: {
  row: Row;
  other: { nickname: string; photoUrl: string | null };
  onOpenProfile?: () => void;
}) {
  const { message, mine, newDay, groupStart, showTime } = row;
  const meta = showTime ? (
    <View className={`pb-0.5 ${mine ? 'items-end' : 'items-start'}`}>
      {mine && message.is_read ? <Text className="text-xs text-subtle">읽음</Text> : null}
      <Text className="text-xs text-subtle">{formatClock(message.created_at)}</Text>
    </View>
  ) : mine && message.is_read ? (
    // 시각을 생략하는 묶음 중간 메시지도 읽음 여부는 보여줍니다.
    <Text className="pb-0.5 text-xs text-subtle">읽음</Text>
  ) : null;

  return (
    <View className={showTime ? 'mb-3' : 'mb-1'}>
      {newDay ? (
        <View className="mb-3 mt-1 items-center">
          <View className="rounded-full bg-field px-3 py-1">
            <Text className="text-xs text-muted">{formatDateLine(message.created_at)}</Text>
          </View>
        </View>
      ) : null}

      {mine ? (
        <View className="max-w-[82%] flex-row items-end gap-1.5 self-end">
          {meta}
          {message.image_url ? (
            <ChatImage path={message.image_url} mine />
          ) : (
            <View testID="bubble-mine" className="shrink rounded-2xl bg-brand-500 px-4 py-2.5">
              <Text className="text-base leading-6 text-white">{message.content}</Text>
            </View>
          )}
        </View>
      ) : (
        <View className="max-w-[88%] flex-row gap-2 self-start">
          {/* 묶음의 첫 메시지에만 사진을 보여주고, 나머지는 자리만 비워 줄을 맞춥니다. */}
          <View style={{ width: AVATAR }}>
            {groupStart ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${other.nickname}님 프로필 보기`}
                disabled={!onOpenProfile}
                onPress={onOpenProfile}>
                <Avatar url={other.photoUrl} name={other.nickname} size={AVATAR} />
              </Pressable>
            ) : null}
          </View>
          <View className="shrink gap-1">
            {groupStart ? (
              <Text testID="bubble-name" className="text-sm text-muted">
                {other.nickname}
              </Text>
            ) : null}
            <View className="flex-row items-end gap-1.5">
              {message.image_url ? (
                <ChatImage path={message.image_url} mine={false} />
              ) : (
                <View testID="bubble-theirs" className="shrink rounded-2xl bg-card px-4 py-2.5">
                  <Text className="text-base leading-6 text-fg">{message.content}</Text>
                </View>
              )}
              {meta}
            </View>
          </View>
        </View>
      )}
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
  // 보내기 전에 미리 보는 사진 (+ 버튼으로 고른 것)
  const [pendingPhoto, setPendingPhoto] = useState<PickedChatPhoto | null>(null);
  const [sendingPhoto, setSendingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [safetyOpen, setSafetyOpen] = useState(false);

  useChatRealtime(matchId, myId);
  useMarkAppReady(!matchesPending && !messages.isPending);

  // 채팅방에 들어오면 받은 메시지를 읽음 처리합니다.
  useEffect(() => {
    if (myId) markRead(matchId, myId);
  }, [matchId, myId]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/matches'));

  async function handleAttach() {
    setError(null);
    try {
      const photo = await pickChatPhoto();
      if (photo) setPendingPhoto(photo);
    } catch {
      setError('사진을 불러오지 못했어요.');
    }
  }

  async function handleSendPhoto() {
    if (!pendingPhoto || !myId || sendingPhoto) return;
    setError(null);
    setSendingPhoto(true);
    try {
      await sendChatImage(matchId, myId, pendingPhoto);
      track(AnalyticsEvent.MessageSent, { type: 'image' });
      setPendingPhoto(null);
    } catch (e) {
      setPendingPhoto(null);
      setError(
        e instanceof ChatImageError ? e.message : '사진을 보내지 못했어요. 잠시 후 다시 시도해 주세요.',
      );
    } finally {
      setSendingPhoto(false);
    }
  }

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
  // 뒤로 가기 옆 숫자: 이 대화를 뺀 다른 대화들에 쌓인 안 읽은 메시지 수
  const otherUnread = (matches ?? [])
    .filter((item) => item.match_id !== matchId)
    .reduce((sum, item) => sum + item.unread_count, 0);
  const other = { nickname: match?.nickname ?? '', photoUrl: match?.photoUrl ?? null };
  // 대화가 끝난 상대의 프로필은 볼 수 없습니다.
  const openProfile = match && active ? () => router.push(`/user/${match.other_id}`) : undefined;
  const rows = toRows(messages.data ?? [], myId);

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View className="flex-row items-center border-b border-line bg-card px-3 py-3">
          {/* 왼쪽: 뒤로 가기 + 다른 대화의 안 읽은 메시지 수 */}
          <View className="flex-1 items-start">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                otherUnread > 0 ? `뒤로, 다른 대화에 안 읽은 메시지 ${otherUnread}개` : '뒤로'
              }
              hitSlop={8}
              onPress={goBack}
              className="flex-row items-center gap-0.5">
              <Ionicons name="chevron-back" size={26} color={colors.fg} />
              {otherUnread > 0 ? (
                <Text testID="other-unread" className="text-base font-semibold text-fg">
                  {otherUnread > 99 ? '99+' : otherUnread}
                </Text>
              ) : null}
            </Pressable>
          </View>
          {/* 가운데: 상대 닉네임 (누르면 프로필) */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${other.nickname}님 프로필 보기`}
            disabled={!openProfile}
            onPress={openProfile}
            className="max-w-[60%] px-2">
            <Text numberOfLines={1} className="text-lg font-semibold text-fg">
              {other.nickname}
            </Text>
          </Pressable>
          <View className="flex-1 items-end">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="신고, 차단, 매칭 해제"
              hitSlop={8}
              onPress={() => setSafetyOpen(true)}>
              <Ionicons name="ellipsis-horizontal" size={24} color={colors.muted} />
            </Pressable>
          </View>
        </View>

        {messages.isPending ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : (
          <FlatList
            inverted
            data={rows}
            keyExtractor={(item) => item.message.id}
            renderItem={({ item }) => <Bubble row={item} other={other} onOpenProfile={openProfile} />}
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
              accessibilityLabel="사진 첨부"
              disabled={sendingPhoto}
              onPress={handleAttach}
              className="h-12 w-12 items-center justify-center rounded-full border border-line bg-field active:opacity-70">
              <Ionicons name="add" size={26} color={colors.fg} />
            </Pressable>
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

      <Modal
        visible={!!pendingPhoto}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingPhoto(null)}>
        <ThemeView className="flex-1 items-center justify-center bg-black/70 px-6">
          <View className="w-full max-w-sm gap-4 rounded-3xl bg-card p-5">
            <Text className="text-lg font-bold text-fg">이 사진을 보낼까요?</Text>
            {pendingPhoto ? (
              <View className="aspect-[4/5] w-full overflow-hidden rounded-2xl bg-field">
                <Image source={{ uri: pendingPhoto.uri }} style={{ flex: 1 }} contentFit="contain" />
              </View>
            ) : null}
            <Text className="text-sm leading-5 text-muted">
              전송 전에 유해한 사진이 아닌지 자동으로 확인해요. 촬영 위치 같은 정보는 지우고 보내요.
            </Text>
            <Button title="보내기" onPress={handleSendPhoto} loading={sendingPhoto} />
            <Button
              title="취소"
              variant="secondary"
              onPress={() => setPendingPhoto(null)}
              disabled={sendingPhoto}
            />
          </View>
        </ThemeView>
      </Modal>

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
