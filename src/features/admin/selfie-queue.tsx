import { Image } from 'expo-image';

import { photoSource } from '@/features/photos/api';
import { Text, View } from 'react-native';

import { formatDateTime, GENDER_LABEL, reviewSelfie, useSelfieQueue, type SelfieReviewItem } from './api';
import { ActionButton, Card, ListState, useActionError } from './parts';

function ReviewCard({ item }: { item: SelfieReviewItem }) {
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
        <View className="flex-1 gap-1">
          <Text className="text-xs font-semibold text-muted">방금 찍은 셀카</Text>
          <View className="aspect-[3/4] overflow-hidden rounded-xl bg-field">
            {item.selfieUrl ? (
              <Image source={{ uri: item.selfieUrl }} cachePolicy="none" style={{ flex: 1 }} contentFit="cover" />
            ) : (
              <View className="flex-1 items-center justify-center px-3">
                <Text className="text-center text-sm text-muted">셀카 파일이 없어요</Text>
              </View>
            )}
          </View>
        </View>
        <View className="flex-1 gap-1">
          <Text className="text-xs font-semibold text-muted">프로필 사진 ({item.photoUrls.length})</Text>
          <View className="flex-row flex-wrap gap-1">
            {item.photoUrls.length > 0 ? (
              item.photoUrls.map((url) => (
                <View
                  key={url}
                  className={`aspect-[3/4] overflow-hidden rounded-xl bg-field ${item.photoUrls.length === 1 ? 'w-full' : 'w-[48%]'}`}>
                  <Image source={photoSource(url)} transition={150} style={{ flex: 1 }} contentFit="cover" />
                </View>
              ))
            ) : (
              <View className="aspect-[3/4] w-full items-center justify-center rounded-xl bg-field px-3">
                <Text className="text-center text-sm text-muted">프로필 사진이 없어요</Text>
              </View>
            )}
          </View>
        </View>
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

export function SelfieQueue() {
  const queue = useSelfieQueue();
  const items = queue.data ?? [];
  return (
    <View className="gap-3">
      <ListState
        loading={queue.isPending}
        error={queue.isError}
        empty={items.length === 0}
        emptyText="심사를 기다리는 셀카가 없어요."
        onRetry={() => queue.refetch()}
      />
      {items.map((item) => (
        <ReviewCard key={item.id} item={item} />
      ))}
    </View>
  );
}
