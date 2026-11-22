import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { photoSource } from '@/features/photos/api';

/**
 * 사진 크게 보기. 화면 가득 사진을 보여주고 옆으로 밀어 넘깁니다.
 * 사진을 아래로 끌어내려도 닫힙니다 (끌수록 배경이 옅어지고, 멀리 또는 빠르게 끌면 닫힘).
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
  const dragY = useSharedValue(0);

  // 열릴 때마다 끌린 위치를 처음으로 되돌립니다.
  useEffect(() => {
    if (open) dragY.value = 0;
  }, [open, dragY]);

  function dismiss() {
    dragY.value = withTiming(height, { duration: 180, easing: Easing.out(Easing.cubic) });
    setTimeout(onClose, 180);
  }

  const pan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetY([-9999, 12])
    .failOffsetX([-12, 12])
    .onUpdate((event) => {
      dragY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (event.translationY > 120 || event.velocityY > 900) dismiss();
      else dragY.value = withTiming(0, { duration: 180 });
    });

  const photoStyle = useAnimatedStyle(() => ({ transform: [{ translateY: dragY.value }] }));
  // 끌수록 검은 배경이 옅어져서 뒤 화면이 비칩니다.
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dragY.value, [0, height * 0.5], [1, 0.15], 'clamp'),
  }));

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
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView testID="photo-viewer" style={{ flex: 1 }}>
        <Animated.View
          pointerEvents="none"
          style={[
            { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: '#000' },
            backdropStyle,
          ]}
        />
        <GestureDetector gesture={pan}>
          <Animated.View style={[{ flex: 1 }, photoStyle]}>
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
          </Animated.View>
        </GestureDetector>

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
      </GestureHandlerRootView>
    </Modal>
  );
}
