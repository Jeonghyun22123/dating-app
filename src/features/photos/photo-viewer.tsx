import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { photoSource } from '@/features/photos/api';

/**
 * 사진 크게 보기. 화면 가득 사진을 보여주고 옆으로 밀어 넘깁니다.
 * 마우스로 볼 때는 양옆 화살표로 넘길 수 있습니다.
 */
export function PhotoViewer({
  urls,
  initialIndex,
  onClose,
}: {
  urls: string[];
  /** null 이면 닫힌 상태 */
  initialIndex: number | null;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [index, setIndex] = useState(0);
  const open = initialIndex !== null;

  // 열릴 때 누른 사진부터 보여줍니다.
  useEffect(() => {
    if (initialIndex === null) return;
    setIndex(initialIndex);
    const timer = setTimeout(
      () => scrollRef.current?.scrollTo({ x: initialIndex * width, animated: false }),
      0,
    );
    return () => clearTimeout(timer);
  }, [initialIndex, width]);

  const goTo = (next: number) => {
    const clamped = Math.max(0, Math.min(next, urls.length - 1));
    scrollRef.current?.scrollTo({ x: clamped * width, animated: true });
    setIndex(clamped);
  };

  return (
    <Modal visible={open} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View testID="photo-viewer" className="flex-1 bg-black">
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(event) => setIndex(Math.round(event.nativeEvent.contentOffset.x / width))}>
          {urls.map((url) => (
            <View key={url} testID="viewer-photo" style={{ width, height }}>
              <Image source={photoSource(url)} style={{ flex: 1 }} contentFit="contain" />
            </View>
          ))}
        </ScrollView>

        <View
          pointerEvents="box-none"
          style={{ top: insets.top + 8 }}
          className="absolute left-0 right-0 flex-row items-center justify-between px-4">
          <View className="rounded-full bg-white/15 px-3 py-1.5">
            <Text
              accessibilityLabel={`크게 보기 ${index + 1} / ${urls.length}`}
              className="text-sm font-semibold text-white">
              {index + 1} / {urls.length}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="닫기"
            hitSlop={10}
            onPress={onClose}
            className="h-10 w-10 items-center justify-center rounded-full bg-white/15">
            <Ionicons name="close" size={24} color="#ffffff" />
          </Pressable>
        </View>

        {index > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="이전 사진 크게 보기"
            onPress={() => goTo(index - 1)}
            style={{ top: height / 2 - 22 }}
            className="absolute left-3 h-11 w-11 items-center justify-center rounded-full bg-white/15">
            <Ionicons name="chevron-back" size={24} color="#ffffff" />
          </Pressable>
        ) : null}
        {index < urls.length - 1 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="다음 사진 크게 보기"
            onPress={() => goTo(index + 1)}
            style={{ top: height / 2 - 22 }}
            className="absolute right-3 h-11 w-11 items-center justify-center rounded-full bg-white/15">
            <Ionicons name="chevron-forward" size={24} color="#ffffff" />
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
}
