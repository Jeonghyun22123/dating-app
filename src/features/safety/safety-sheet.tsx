import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';

import { blockUser, REPORT_REASONS, reportUser, type ReportReason } from './api';

type Props = {
  visible: boolean;
  onClose: () => void;
  myId: string;
  target: { id: string; nickname: string };
  /** 채팅방에서 열었을 때만 전달 → 신고 시 대화 증거가 함께 접수됩니다. */
  matchId?: string;
  /** 매칭 해제 메뉴를 보여줄지 (채팅방 전용) */
  onUnmatch?: () => Promise<void>;
  /** 차단·해제 등으로 이 상대를 더 볼 수 없게 된 뒤 호출 */
  onRemoved: () => void;
};

type Mode = 'menu' | 'report' | 'reported';

/** 신고 · 차단 · 매칭 해제를 모아 둔 하단 시트. */
export function SafetySheet({ visible, onClose, myId, target, matchId, onUnmatch, onRemoved }: Props) {
  const [mode, setMode] = useState<Mode>('menu');
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setMode('menu');
    setReason(null);
    setDescription('');
    setError(null);
    onClose();
  }

  async function run(action: () => Promise<void>, failMessage: string) {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch {
      setError(failMessage);
    } finally {
      setBusy(false);
    }
  }

  const handleReport = () =>
    run(async () => {
      if (!reason) return;
      await reportUser({ reporterId: myId, reportedUserId: target.id, matchId, reason, description });
      setMode('reported');
    }, '신고를 접수하지 못했어요. 잠시 후 다시 시도해 주세요.');

  const handleBlock = () =>
    run(async () => {
      await blockUser(myId, target.id);
      close();
      onRemoved();
    }, '차단하지 못했어요. 잠시 후 다시 시도해 주세요.');

  const handleUnmatch = () =>
    run(async () => {
      await onUnmatch?.();
      close();
      onRemoved();
    }, '매칭을 해제하지 못했어요. 잠시 후 다시 시도해 주세요.');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable accessibilityLabel="닫기" className="flex-1 bg-black/50" onPress={close} />
      <View className="items-center bg-white px-6 pb-8 pt-6">
        <View className="w-full max-w-md gap-3">
          {mode === 'menu' ? (
            <>
              <Text className="text-lg font-bold text-neutral-900">{target.nickname}님</Text>
              <Button title="신고하기" variant="secondary" onPress={() => setMode('report')} disabled={busy} />
              <Button title="차단하기" variant="secondary" onPress={handleBlock} loading={busy} />
              {onUnmatch ? (
                <Button title="매칭 해제" variant="secondary" onPress={handleUnmatch} disabled={busy} />
              ) : null}
              <Text className="text-sm leading-5 text-neutral-500">
                차단하면 서로의 추천과 채팅 목록에서 사라지고, 상대에게는 알림이 가지 않아요.
              </Text>
            </>
          ) : null}

          {mode === 'report' ? (
            <>
              <Text className="text-lg font-bold text-neutral-900">신고 사유를 선택해 주세요</Text>
              {REPORT_REASONS.map((item) => {
                const selected = reason === item.value;
                return (
                  <Pressable
                    key={item.value}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    onPress={() => setReason(item.value)}
                    className={`rounded-2xl border px-4 py-3 ${selected ? 'border-brand-500 bg-brand-50' : 'border-neutral-300 bg-white'}`}>
                    <Text className={`text-base ${selected ? 'font-semibold text-brand-600' : 'text-neutral-800'}`}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
              <TextField
                value={description}
                onChangeText={setDescription}
                placeholder="자세한 내용을 적어주세요 (선택)"
                maxLength={1000}
              />
              {matchId ? (
                <Text className="text-sm leading-5 text-neutral-500">
                  신고하면 이 대화의 최근 메시지가 증거로 운영팀에 전달됩니다.
                </Text>
              ) : null}
              <Button title="신고 접수" onPress={handleReport} loading={busy} disabled={!reason} />
            </>
          ) : null}

          {mode === 'reported' ? (
            <>
              <Text className="text-lg font-bold text-neutral-900">신고가 접수되었어요</Text>
              <Text className="text-base leading-6 text-neutral-600">
                운영팀이 확인 후 조치할게요. 이 사용자를 더 보고 싶지 않다면 차단할 수 있어요.
              </Text>
              <Button title="차단하기" onPress={handleBlock} loading={busy} />
            </>
          ) : null}

          {error ? <Text className="text-sm text-red-600">{error}</Text> : null}
          <Button title="닫기" variant="ghost" onPress={close} disabled={busy} />
        </View>
      </View>
    </Modal>
  );
}
