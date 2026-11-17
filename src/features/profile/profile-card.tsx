import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRef, useState, type ComponentProps } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { photoSource } from '@/features/photos/api';
import { PhotoViewer } from '@/features/photos/photo-viewer';

const shadow = {
  textShadowColor: 'rgba(0,0,0,0.5)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 4,
} as const;

export type CardPhoto = {
  key: string;
  url: string;
  /** 아직 검수 중이라 본인에게만 보이는 사진 */ pending?: boolean;
};

/** 이름 옆 배지. high = 신뢰 높음, verified = 본인 인증, pending/rejected = 셀카 인증 상태(내 프로필에서만 사용) */
export type CardBadge = 'high' | 'verified' | 'pending' | 'rejected' | null;

type Props = {
  photos: CardPhoto[];
  nickname: string;
  age: number;
  /** MBTI (예: ENFP) */
  mbti?: string | null;
  badge: CardBadge;
  /** 예: "성수동 · 취미 메이트" */
  subtitle: string;
  bio?: string | null;
  hobbies: string[];
  /** 카드 오른쪽 위 버튼 (예: 프로필 수정) */
  action?: { label: string; icon: ComponentProps<typeof Ionicons>['name']; onPress: () => void };
  /** 사진이 없을 때 보여줄 문구와, 눌렀을 때 동작 */
  emptyText?: string;
  onEmptyPress?: () => void;
};

/**
 * 프로필 카드 (내 프로필 탭과 상대 프로필 화면이 함께 씁니다).
 * 둘러보기 카드처럼 사진 위에 정보를 올리고, 사진은 옆으로 밀어 넘기며, 누르면 화면 가득 크게 봅니다.
 */
export function ProfileCard({
  photos,
  nickname,
  age,
  mbti,
  badge,
  subtitle,
  bio,
  hobbies,
  action,
  emptyText = '등록된 사진이 없어요',
  onEmptyPress,
}: Props) {
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [width, setWidth] = useState(0);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const index = Math.min(photoIndex, Math.max(photos.length - 1, 0));

  const goTo = (next: number) => {
    const clamped = Math.max(0, Math.min(next, photos.length - 1));
    scrollRef.current?.scrollTo({ x: clamped * width, animated: true });
    setPhotoIndex(clamped);
  };

  return (
    <View
      className="aspect-[4/5] w-full overflow-hidden rounded-3xl bg-neutral-800"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {photos.length > 0 ? (
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(event) => {
            if (width > 0) setPhotoIndex(Math.round(event.nativeEvent.contentOffset.x / width));
          }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          {photos.map((photo, i) => (
            <View key={photo.key} testID="my-photo" style={{ width: width || undefined, height: '100%' }}>
              <Image
                source={photoSource(photo.url)}
                transition={150}
                style={{ flex: 1 }}
                contentFit="cover"
              />
              {photo.pending ? (
                <View
                  pointerEvents="none"
                  className="absolute left-3 top-[76px] rounded-full bg-black/55 px-3 py-1.5">
                  <Text className="text-xs font-semibold text-white">검수 중 · 아직 나에게만 보여요</Text>
                </View>
              ) : null}
              {/* 사진을 누르면 화면 가득 크게 봅니다. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`사진 ${i + 1} 크게 보기`}
                className="absolute bottom-0 left-0 right-0 top-0"
                onPress={() => setViewerIndex(i)}
              />
            </View>
          ))}
        </ScrollView>
      ) : (
        <Pressable
          accessibilityRole={onEmptyPress ? 'button' : undefined}
          disabled={!onEmptyPress}
          onPress={onEmptyPress}
          className="absolute bottom-0 left-0 right-0 top-0 items-center justify-center gap-2 pb-24">
          <Ionicons name="image-outline" size={40} color="#d4d4d4" />
          <Text className="text-base text-neutral-300">{emptyText}</Text>
        </Pressable>
      )}

      {/* 위쪽: 사진 위치 표시, 오른쪽 위 버튼 */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 110 }}
      />
      <View pointerEvents="box-none" className="absolute left-0 right-0 top-0 gap-3 p-3">
        {photos.length > 1 ? (
          <View pointerEvents="none" className="flex-row gap-1">
            {photos.map((photo, i) => (
              <View
                key={photo.key}
                className={`h-1 flex-1 rounded-full ${i === index ? 'bg-white' : 'bg-white/40'}`}
              />
            ))}
          </View>
        ) : null}
        <View pointerEvents="box-none" className="flex-row items-center justify-between">
          {photos.length > 1 ? (
            <View pointerEvents="none" className="rounded-full bg-black/35 px-3 py-1.5">
              <Text
                accessibilityLabel={`사진 ${index + 1} / ${photos.length}`}
                className="text-sm font-semibold text-white">
                {index + 1} / {photos.length}
              </Text>
            </View>
          ) : (
            <View />
          )}
          {action ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={action.onPress}
              className="flex-row items-center gap-1.5 rounded-full bg-black/45 px-3.5 py-2">
              <Ionicons name={action.icon} size={16} color="#ffffff" />
              <Text className="text-sm font-semibold text-white">{action.label}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* 마우스로 볼 때는 밀어서 넘길 수 없으므로 웹에서는 양옆에 화살표를 둡니다. */}
      {Platform.OS === 'web' && index > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="이전 사진"
          onPress={() => goTo(index - 1)}
          className="absolute left-2 top-[38%] h-9 w-9 items-center justify-center rounded-full bg-black/35">
          <Ionicons name="chevron-back" size={20} color="#ffffff" />
        </Pressable>
      ) : null}
      {Platform.OS === 'web' && index < photos.length - 1 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="다음 사진"
          onPress={() => goTo(index + 1)}
          className="absolute right-2 top-[38%] h-9 w-9 items-center justify-center rounded-full bg-black/35">
          <Ionicons name="chevron-forward" size={20} color="#ffffff" />
        </Pressable>
      ) : null}

      {/* 아래쪽: 다른 사람에게 보이는 프로필 정보 */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.88)']}
        locations={[0, 0.45, 1]}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '62%' }}
      />
      <View pointerEvents="none" className="absolute bottom-0 left-0 right-0 gap-2.5 p-4">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text style={shadow} className="text-3xl font-bold text-white">
            {nickname}, {age}
          </Text>
          {mbti ? (
            <View testID="mbti" className="rounded-full border border-white/70 px-2.5 py-0.5">
              <Text className="text-sm font-bold tracking-wider text-white">{mbti}</Text>
            </View>
          ) : null}
          {badge === 'high' ? (
            <View className="flex-row items-center gap-1 rounded-full bg-amber-400 px-2.5 py-1">
              <Ionicons name="shield-checkmark" size={14} color="#422006" />
              <Text className="text-xs font-semibold text-amber-950">신뢰 높음</Text>
            </View>
          ) : badge === 'verified' ? (
            <View className="flex-row items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1">
              <Ionicons name="checkmark-circle" size={14} color="#ffffff" />
              <Text className="text-xs font-semibold text-white">본인 인증</Text>
            </View>
          ) : badge ? (
            <View className="flex-row items-center gap-1 rounded-full bg-white/25 px-2.5 py-1">
              <Ionicons
                name={badge === 'rejected' ? 'alert-circle' : 'time-outline'}
                size={14}
                color="#ffffff"
              />
              <Text className="text-xs font-semibold text-white">
                {badge === 'rejected' ? '셀카 인증 반려' : '셀카 인증 심사 중'}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={shadow} className="text-base text-white">
          {subtitle}
        </Text>
        {bio ? (
          <Text style={shadow} numberOfLines={3} className="text-base leading-6 text-white/95">
            {bio}
          </Text>
        ) : null}
        {hobbies.length > 0 ? (
          <View className="flex-row flex-wrap gap-1.5">
            {hobbies.map((hobby) => (
              <View key={hobby} className="rounded-full bg-white/25 px-3 py-1">
                <Text className="text-sm text-white">{hobby}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <PhotoViewer
        urls={photos.map((photo) => photo.url)}
        initialIndex={viewerIndex}
        onClose={() => setViewerIndex(null)}
      />
    </View>
  );
}
