import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { ThemeView, useThemeColors } from '@/theme/theme-view';

import { NoSignalsLeftError, sendSignal, SIGNAL_MESSAGE_MAX } from './api';

type Props = {
  visible: boolean;
  onClose: () => void;
  myId: string;
  target: { id: string; nickname: string };
  /** 남은 시그널 횟수 */
  credits: number;
  /** 전송에 성공하면 호출. matchId 가 있으면 상대가 이미 관심을 보낸 상태라 바로 연결된 것입니다. */
  onSent: (result: { matchId: string | null }) => void;
};

/** 시그널 메시지를 적어 보내는 하단 창. */
export function SignalComposeSheet({ visible, onClose, myId, target, credits, onSent }: Props) {
  const colors = useThemeColors();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const empty = credits <= 0 || exhausted;

  function close() {
    setMessage('');
    setError(null);
    onClose();
  }

  async function handleSend() {
    if (!message.trim() || sending) return;
    setError(null);
    setSending(true);
    try {
      const result = await sendSignal(myId, target.id, message);
      setMessage('');
      onSent({ matchId: result.matchId });
    } catch (e) {
      if (e instanceof NoSignalsLeftError) {
        setExhausted(true);
      } else {
        const detail = (e as { message?: string }).message ?? '';
        setError(/[가-힣]/.test(detail) ? detail : '시그널을 보내지 못했어요. 잠시 후 다시 시도해 주세요.');
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      {/* Modal 은 별도 창에 그려지므로 테마 색을 다시 적용합니다 */}
      <ThemeView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable accessibilityLabel="닫기" className="flex-1 bg-black/50" onPress={close} />
          <View className="items-center bg-card px-6 pb-8 pt-6">
            <View className="w-full max-w-md gap-3">
              <Text className="text-lg font-bold text-fg">{target.nickname}님에게 시그널 보내기</Text>

              {empty ? (
                <>
                  <Text className="text-base leading-6 text-muted">
                    시그널을 모두 사용했어요. 추가 시그널은 곧 하트로 받을 수 있게 준비하고 있어요.
                  </Text>
                  <Text className="text-sm leading-5 text-subtle">
                    "관심 있어요"는 횟수 제한 없이 계속 보낼 수 있어요.
                  </Text>
                </>
              ) : (
                <>
                  <Text className="text-sm leading-5 text-muted">
                    메시지가 상대에게 바로 전달돼요. 상대가 수락하면 이 메시지로 대화가 시작됩니다.
                  </Text>
                  <TextInput
                    accessibilityLabel="시그널 메시지"
                    className="min-h-24 rounded-2xl border border-line bg-bg px-4 py-3 text-base text-fg"
                    placeholder="첫인사를 건네보세요"
                    placeholderTextColor={colors.subtle}
                    value={message}
                    onChangeText={setMessage}
                    maxLength={SIGNAL_MESSAGE_MAX}
                    multiline
                    textAlignVertical="top"
                    autoFocus
                  />
                  <View className="flex-row justify-between">
                    <Text className="text-sm text-subtle">남은 시그널 {credits}회</Text>
                    <Text className="text-sm text-subtle">
                      {message.length}/{SIGNAL_MESSAGE_MAX}
                    </Text>
                  </View>
                  {error ? <Text className="text-sm text-red-600">{error}</Text> : null}
                  <Button title="시그널 보내기" onPress={handleSend} loading={sending} disabled={!message.trim()} />
                </>
              )}
              <Button title={empty ? '닫기' : '취소'} variant="ghost" onPress={close} disabled={sending} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </ThemeView>
    </Modal>
  );
}
