import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { ErrorText, Screen } from '@/components/ui/screen';
import {
  deleteProfilePhoto,
  MAX_PHOTOS,
  moderationMessage,
  pickPhoto,
  uploadProfilePhoto,
  useMyPhotos,
  type PhotoWithUrl,
  photoSource,
} from '@/features/photos/api';

function PhotoTile({ photo, onDelete }: { photo: PhotoWithUrl; onDelete: () => void }) {
  const pending = photo.moderation_status === 'pending';
  return (
    <View className="aspect-[4/5] w-[31%] overflow-hidden rounded-2xl bg-neutral-200">
      {photo.url ? <Image source={photoSource(photo.url)} transition={150} style={{ flex: 1 }} contentFit="cover" /> : null}
      {pending ? (
        <View className="absolute bottom-0 left-0 right-0 bg-black/60 py-1">
          <Text className="text-center text-xs text-white">검수 대기</Text>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="사진 삭제"
        onPress={onDelete}
        hitSlop={8}
        className="absolute right-1 top-1 h-7 w-7 items-center justify-center rounded-full bg-black/60">
        <Text className="text-sm font-bold text-white">✕</Text>
      </Pressable>
    </View>
  );
}

export function PhotosStep({
  userId,
  progress,
  onDone,
}: {
  userId: string;
  progress: string;
  onDone: () => void;
}) {
  const photosQuery = useMyPhotos(userId);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 거절된 사진은 목록에서 숨깁니다 (파일은 서버가 이미 삭제).
  const photos = (photosQuery.data ?? []).filter((photo) => photo.moderation_status !== 'rejected');
  const totalRows = photosQuery.data?.length ?? 0;
  const canAdd = photos.length < MAX_PHOTOS && !uploading;

  async function handleAdd() {
    setError(null);
    setNotice(null);
    try {
      const uri = await pickPhoto();
      if (!uri) return;
      setUploading(true);

      // 거절된 사진의 기록이 자리를 차지하고 있으면 먼저 정리합니다 (1인당 최대 6장 제한).
      if (totalRows >= MAX_PHOTOS) {
        const rejected = (photosQuery.data ?? []).filter((photo) => photo.moderation_status === 'rejected');
        await Promise.all(rejected.map(deleteProfilePhoto));
      }

      const result = await uploadProfilePhoto(userId, uri, photos.length);
      if (result.status === 'rejected') {
        setError(moderationMessage(result.reason));
      } else if (result.status === 'pending') {
        setNotice('사진을 올렸어요. 검수가 끝나면 다른 사람에게 보여요.');
      } else if (result.test_mode) {
        setNotice('테스트 모드: AI 검수 없이 통과 처리되었어요.');
      }
    } catch {
      setError('사진을 올리지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(photo: PhotoWithUrl) {
    setError(null);
    try {
      await deleteProfilePhoto(photo);
    } catch {
      setError('사진을 삭제하지 못했어요.');
    }
  }

  return (
    <Screen
      progress={progress}
      title="프로필 사진을 올려주세요"
      subtitle={`얼굴이 잘 보이는 사진을 1장 이상, 최대 ${MAX_PHOTOS}장까지 등록할 수 있어요. 모든 사진은 AI 검수를 거칩니다.`}
      footer={
        <>
          <ErrorText>{error}</ErrorText>
          <Button title="다음" onPress={onDone} disabled={photos.length === 0 || uploading} />
        </>
      }>
      <View className="flex-row flex-wrap gap-[3.5%]">
        {photos.map((photo) => (
          <PhotoTile key={photo.id} photo={photo} onDelete={() => handleDelete(photo)} />
        ))}
        {photos.length < MAX_PHOTOS ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="사진 추가"
            disabled={!canAdd}
            onPress={handleAdd}
            className="aspect-[4/5] w-[31%] items-center justify-center rounded-2xl border-2 border-dashed border-neutral-300 bg-white">
            {uploading ? (
              <ActivityIndicator color="#f43f5e" />
            ) : (
              <Text className="text-3xl text-neutral-400">＋</Text>
            )}
          </Pressable>
        ) : null}
      </View>
      {uploading ? <Text className="text-sm text-neutral-500">사진을 올리고 검수하는 중이에요…</Text> : null}
      {notice ? <Text className="text-sm text-emerald-600">{notice}</Text> : null}
    </Screen>
  );
}
