import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState, type ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { photoSource } from '@/features/photos/api';
import { PhotoViewer } from '@/features/photos/photo-viewer';

export type ViewPhoto = {
  key: string;
  url: string;
  /** 아직 검수 중이라 본인에게만 보이는 사진 */ pending?: boolean;
};

/** 이름 옆 배지. high = 신뢰 높음, verified = 본인 인증, pending/rejected = 셀카 인증 상태(내 프로필에서만 사용) */
export type ViewBadge = 'high' | 'verified' | 'pending' | 'rejected' | null;

function Badge({ badge }: { badge: ViewBadge }) {
  if (badge === 'high') {
    return (
      <View className="flex-row items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5">
        <Ionicons name="shield-checkmark" size={12} color="#422006" />
        <Text className="text-xs font-semibold text-amber-950">신뢰 높음</Text>
      </View>
    );
  }
  if (badge === 'verified') {
    return (
      <View className="flex-row items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5">
        <Ionicons name="checkmark-circle" size={12} color="#ffffff" />
        <Text className="text-xs font-semibold text-white">본인 인증</Text>
      </View>
    );
  }
  if (badge) {
    return (
      <View className="flex-row items-center gap-1 rounded-full bg-field px-2 py-0.5">
        <Ionicons name={badge === 'rejected' ? 'alert-circle' : 'time-outline'} size={12} color="#a3a3a3" />
        <Text className="text-xs font-semibold text-muted">
          {badge === 'rejected' ? '셀카 인증 반려' : '셀카 인증 심사 중'}
        </Text>
      </View>
    );
  }
  return null;
}

/**
 * 인스타그램 스타일 프로필 (내 프로필 탭과 상대 프로필 화면이 함께 씁니다).
 * 위: 동그란 대표 사진 + 오른쪽에 닉네임(나이)·MBTI·동네/목적.
 * 아래: 자기소개, 취미, 추가 사진 3열 격자(1:1로 잘라 보여줌). 사진을 누르면 원본 비율로 크게 봅니다.
 */
export function ProfileView({
  photos,
  nickname,
  age,
  mbti,
  badge,
  subtitle,
  bio,
  hobbies,
  action,
  emptyText = '추가로 올린 사진이 없어요',
  onEmptyPress,
}: {
  /** 첫 번째가 대표 사진 */
  photos: ViewPhoto[];
  nickname: string;
  age: number;
  mbti?: string | null;
  badge: ViewBadge;
  /** 예: "성수동 · 취미 메이트" */
  subtitle: string;
  bio?: string | null;
  hobbies: string[];
  /** 대표 사진 아래 전체 폭 버튼 (예: 프로필 수정) */
  action?: { label: string; icon: ComponentProps<typeof Ionicons>['name']; onPress: () => void };
  /** 추가 사진이 없을 때 보여줄 문구와, 눌렀을 때 동작 */
  emptyText?: string;
  onEmptyPress?: () => void;
}) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const extra = photos.slice(1);

  return (
    <>
      <View className="flex-row items-center gap-5">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="대표 사진 크게 보기"
          disabled={photos.length === 0}
          onPress={() => setViewerIndex(0)}>
          <Avatar url={photos[0]?.url} name={nickname} size={104} />
        </Pressable>
        <View className="flex-1 gap-1.5">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text className="text-2xl font-bold text-fg">
              {nickname}({age})
            </Text>
            <Badge badge={badge} />
          </View>
          {mbti ? (
            <Text testID="mbti" className="text-base font-bold tracking-wider text-brand-600">
              {mbti}
            </Text>
          ) : null}
          <Text className="text-sm text-muted">{subtitle}</Text>
        </View>
      </View>

      {bio ? <Text className="text-base leading-6 text-fg">{bio}</Text> : null}

      {hobbies.length > 0 ? (
        <View className="flex-row flex-wrap gap-1.5">
          {hobbies.map((hobby) => (
            <View key={hobby} className="rounded-full bg-field px-3 py-1">
              <Text className="text-sm text-fg">{hobby}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {action ? (
        <Pressable
          accessibilityRole="button"
          onPress={action.onPress}
          className="flex-row items-center justify-center gap-1.5 rounded-xl bg-field py-2.5 active:opacity-70">
          <Ionicons name={action.icon} size={16} color="#a3a3a3" />
          <Text className="text-sm font-semibold text-fg">{action.label}</Text>
        </Pressable>
      ) : null}

      <View className="h-px bg-line" />
      {extra.length > 0 ? (
        <View className="-mx-0.5 flex-row flex-wrap">
          {extra.map((photo, i) => (
            <View key={photo.key} testID="my-photo" style={{ width: '33.333%', aspectRatio: 1, padding: 2 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`사진 ${i + 2} 크게 보기`}
                onPress={() => setViewerIndex(i + 1)}
                className="flex-1 overflow-hidden rounded-lg bg-field">
                <Image
                  source={photoSource(photo.url)}
                  transition={150}
                  style={{ flex: 1 }}
                  contentFit="cover"
                />
                {photo.pending ? (
                  <View className="absolute bottom-0 left-0 right-0 bg-black/60 py-1">
                    <Text className="text-center text-xs text-white">검수 중</Text>
                  </View>
                ) : null}
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <Pressable
          accessibilityRole={onEmptyPress ? 'button' : undefined}
          disabled={!onEmptyPress}
          onPress={onEmptyPress}>
          <Text className="py-6 text-center text-sm text-subtle">{emptyText}</Text>
        </Pressable>
      )}

      <PhotoViewer
        urls={photos.map((photo) => photo.url)}
        initialIndex={viewerIndex}
        onClose={() => setViewerIndex(null)}
      />
    </>
  );
}
