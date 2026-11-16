import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';

import { photoSource } from '@/features/photos/api';
import { useThemeColors } from '@/theme/theme-view';

import {
  formatDateTime,
  GENDER_LABEL,
  isAiFirst,
  reviewPhotoChange,
  reviewSelfie,
  setReviewMode,
  useAdminSettings,
  usePhotoChangeQueue,
  useSelfieQueue,
  type PhotoChangeItem,
  type ReviewTarget,
  type SelfieReviewItem,
} from './api';
import { ActionButton, Card, ListState, useActionError } from './parts';

/**
 * 심사 방식 스위치 (각 심사 탭의 오른쪽 위).
 * 켜짐 = AI 가 먼저 보고 통과하면 바로 반영, 애매한 것만 관리자가 봅니다.
 * 꺼짐 = 모든 건을 관리자가 직접 승인합니다.
 */
function ModeSwitch({ target }: { target: ReviewTarget }) {
  const colors = useThemeColors();
  const settings = useAdminSettings();
  const { error, run } = useActionError();
  const [saving, setSaving] = useState(false);
  const ai = isAiFirst(settings.data, target);

  const change = (next: boolean) =>
    run(async () => {
      setSaving(true);
      try {
        await setReviewMode(target, next);
      } finally {
        setSaving(false);
      }
    }, '심사 방식을 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.');

  return (
    <Card>
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text className="text-base font-semibold text-fg">{ai ? 'AI 먼저 검토' : '관리자 직접 승인'}</Text>
          <Text className="text-sm leading-5 text-muted">
            {ai
              ? 'AI 검수를 통과하면 바로 반영하고, AI가 판단하기 애매한 것만 이 목록으로 와요.'
              : '모든 건이 이 목록으로 오고, 관리자가 직접 승인·반려해요.'}
          </Text>
        </View>
        <View className="items-center gap-1">
          <Switch
            accessibilityLabel="AI 먼저 검토"
            value={ai}
            disabled={!settings.data || saving}
            onValueChange={change}
            trackColor={{ false: colors.line, true: colors.brand }}
          />
          <Text className="text-xs font-semibold text-muted">AI 먼저</Text>
        </View>
      </View>
      {error ? <Text className="text-sm text-red-600">{error}</Text> : null}
      {ai ? (
        <Text className="text-xs leading-4 text-muted">
          주의: AI는 노출·유해물·AI 생성 여부와 셀카에 얼굴이 한 명 보이는지만 확인해요. 셀카와 프로필 사진이
          같은 사람인지는 아직 자동으로 비교하지 못해요 (얼굴 비교 API 연결 전). 같은 사람인지까지 확인하려면
          "관리자 직접 승인"으로 두세요.
        </Text>
      ) : null}
    </Card>
  );
}

function Selfie({ url }: { url: string | null }) {
  return (
    <View className="flex-1 gap-1">
      <Text className="text-xs font-semibold text-muted">방금 찍은 셀카</Text>
      <View className="aspect-[3/4] overflow-hidden rounded-xl bg-field">
        {url ? (
          <Image source={{ uri: url }} cachePolicy="none" style={{ flex: 1 }} contentFit="cover" />
        ) : (
          <View className="flex-1 items-center justify-center px-3">
            <Text className="text-center text-sm text-muted">셀카 파일이 없어요</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function PhotoGrid({ title, urls, emptyText }: { title: string; urls: string[]; emptyText: string }) {
  return (
    <View className="flex-1 gap-1">
      <Text className="text-xs font-semibold text-muted">
        {title} ({urls.length})
      </Text>
      <View className="flex-row flex-wrap gap-1">
        {urls.length > 0 ? (
          urls.map((url) => (
            <View
              key={url}
              className={`aspect-[3/4] overflow-hidden rounded-xl bg-field ${urls.length === 1 ? 'w-full' : 'w-[48%]'}`}>
              <Image source={photoSource(url)} transition={150} style={{ flex: 1 }} contentFit="cover" />
            </View>
          ))
        ) : (
          <View className="aspect-[3/4] w-full items-center justify-center rounded-xl bg-field px-3">
            <Text className="text-center text-sm text-muted">{emptyText}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function SignupCard({ item }: { item: SelfieReviewItem }) {
  const { error, run } = useActionError();
  const decide = (approve: boolean) =>
    run(() => reviewSelfie(item.id, approve), '처리하지 못했어요. 잠시 후 다시 시도해 주세요.');

  return (
    <Card>
      <View className="flex-row items-center justify-between gap-2">
        <Text className="text-base font-semibold text-fg">
          {item.nickname} · {item.age}세 · {GENDER_LABEL[item.gender]}
        </Text>
        <Text className="text-xs text-muted">제출 {formatDateTime(item.selfie_submitted_at)}</Text>
      </View>

      <View className="flex-row gap-3">
        <Selfie url={item.selfieUrl} />
        <PhotoGrid title="프로필 사진" urls={item.photoUrls} emptyText="프로필 사진이 없어요" />
      </View>

      <Text className="text-xs leading-4 text-muted">
        셀카와 프로필 사진이 같은 사람인지 확인하세요. 승인·반려 즉시 셀카 파일은 영구 삭제됩니다.
      </Text>
      {error ? <Text className="text-sm text-red-600">{error}</Text> : null}
      <View className="flex-row justify-end gap-2">
        <ActionButton title="반려" tone="danger" confirm onPress={() => decide(false)} />
        <ActionButton title="승인" tone="primary" onPress={() => decide(true)} />
      </View>
    </Card>
  );
}

/** 관리자 > 신규회원 심사: 가입하며 찍은 셀카와 프로필 사진을 비교합니다. */
export function SignupReview() {
  const queue = useSelfieQueue();
  const items = queue.data ?? [];
  return (
    <View className="gap-3">
      <ModeSwitch target="signup" />
      <ListState
        loading={queue.isPending}
        error={queue.isError}
        empty={items.length === 0}
        emptyText="심사를 기다리는 신규 회원이 없어요."
        onRetry={() => queue.refetch()}
      />
      {items.map((item) => (
        <SignupCard key={item.id} item={item} />
      ))}
    </View>
  );
}

/** 반려 사유 (회원의 사진 관리 화면에 그대로 보입니다) */
const REJECT_REASONS = [
  '셀카와 같은 사람인지 확인하기 어려워요.',
  '얼굴이 잘 보이지 않는 사진이에요.',
  '프로필 사진으로 적절하지 않아요.',
];

function PhotoChangeCard({ item }: { item: PhotoChangeItem }) {
  const { error, run } = useActionError();
  const [reason, setReason] = useState(REJECT_REASONS[0]);
  const decide = (approve: boolean) =>
    run(
      () => reviewPhotoChange(item.id, approve, approve ? undefined : reason),
      '처리하지 못했어요. 잠시 후 다시 시도해 주세요.',
    );

  return (
    <Card>
      <View className="flex-row items-center justify-between gap-2">
        <Text className="text-base font-semibold text-fg">
          {item.nickname} · {item.age}세 · {GENDER_LABEL[item.gender]}
        </Text>
        <Text className="text-xs text-muted">
          요청 {item.requested_at ? formatDateTime(item.requested_at) : '-'}
        </Text>
      </View>

      <View className="flex-row gap-3">
        <Selfie url={item.selfieUrl} />
        <PhotoGrid title="새로 올린 사진" urls={item.newUrls} emptyText="새 사진이 없어요" />
      </View>

      <View className="gap-1">
        <Text className="text-xs font-semibold text-muted">지금 프로필 사진 ({item.currentUrls.length})</Text>
        <View className="flex-row flex-wrap gap-1">
          {item.currentUrls.map((url) => (
            <View key={url} className="aspect-[3/4] w-[15%] overflow-hidden rounded-lg bg-field">
              <Image source={photoSource(url)} transition={150} style={{ flex: 1 }} contentFit="cover" />
            </View>
          ))}
        </View>
      </View>

      <Text className="text-xs leading-4 text-muted">
        셀카와 새 사진이 같은 사람인지 확인하세요. 승인하면 새 사진이 바로 공개되고, 반려하면 지금 사진이
        그대로 유지됩니다. 어느 쪽이든 셀카 파일은 즉시 영구 삭제됩니다.
      </Text>

      <View className="gap-1.5">
        <Text className="text-xs font-semibold text-muted">반려할 때 회원에게 보여줄 사유</Text>
        <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-1.5">
          {REJECT_REASONS.map((text) => {
            const selected = reason === text;
            return (
              <Pressable
                key={text}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                aria-checked={selected}
                onPress={() => setReason(text)}
                className={`rounded-full border px-3 py-1.5 ${selected ? 'border-brand-500 bg-brand-50' : 'border-line bg-card'}`}>
                <Text className={`text-xs ${selected ? 'font-semibold text-brand-600' : 'text-muted'}`}>
                  {text}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {error ? <Text className="text-sm text-red-600">{error}</Text> : null}
      <View className="flex-row justify-end gap-2">
        <ActionButton title="반려" tone="danger" confirm onPress={() => decide(false)} />
        <ActionButton title="승인" tone="primary" onPress={() => decide(true)} />
      </View>
    </Card>
  );
}

/** 관리자 > 사진수정 심사: 기존 회원이 새로 올린 사진과 방금 찍은 셀카를 비교합니다. */
export function PhotoChangeReview() {
  const queue = usePhotoChangeQueue();
  const items = queue.data ?? [];
  return (
    <View className="gap-3">
      <ModeSwitch target="photo_change" />
      <ListState
        loading={queue.isPending}
        error={queue.isError}
        empty={items.length === 0}
        emptyText="검토를 기다리는 사진 변경 요청이 없어요."
        onRetry={() => queue.refetch()}
      />
      {items.map((item) => (
        <PhotoChangeCard key={item.id} item={item} />
      ))}
    </View>
  );
}
