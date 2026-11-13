import { type ReactNode, useEffect, useRef } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

type Action = 'like' | 'pass';

type Props = {
  children: ReactNode;
  disabled?: boolean;
  /** 카드를 충분히 밀었을 때 호출. false 를 돌려주면(처리 실패) 카드가 제자리로 돌아옵니다. */
  onDecide: (action: Action) => Promise<boolean>;
};

/** 이 거리(px) 이상 밀거나 빠르게 튕기면 결정으로 봅니다. */
const DISTANCE = 110;
const VELOCITY = 900;
const EXIT_MS = 180;

/**
 * 좌우로 밀어서 결정하는 카드.
 *   오른쪽으로 밀기 → 관심 있어요 / 왼쪽으로 밀기 → 다음에
 * 세로 스크롤과 사진 넘기기(탭)는 그대로 동작하도록 가로로 15px 이상 움직였을 때만 반응합니다.
 * 웹에서는 마우스 드래그로 동작합니다.
 */
export function SlideCard({ children, disabled, onDecide }: Props) {
  const { width } = useWindowDimensions();
  const x = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function decide(action: Action) {
    x.value = withTiming((action === 'like' ? 1 : -1) * width * 1.2, { duration: EXIT_MS });
    // 카드가 화면 밖으로 나간 뒤에 처리합니다.
    timer.current = setTimeout(async () => {
      const ok = await onDecide(action);
      if (!ok) x.value = withSpring(0);
    }, EXIT_MS);
  }

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .runOnJS(true)
    .activeOffsetX([-15, 15])
    .failOffsetY([-20, 20])
    .onUpdate((event) => {
      x.value = event.translationX;
    })
    .onEnd((event) => {
      const far = Math.abs(event.translationX) > DISTANCE;
      const fast = Math.abs(event.velocityX) > VELOCITY && Math.abs(event.translationX) > 30;
      if (far || fast) {
        decide(event.translationX > 0 ? 'like' : 'pass');
      } else {
        x.value = withSpring(0);
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
    opacity: interpolate(Math.abs(x.value), [0, width], [1, 0.4]),
  }));
  const likeStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [20, DISTANCE], [0, 1], 'clamp') }));
  const passStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [-DISTANCE, -20], [1, 0], 'clamp') }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={cardStyle}>
        {children}
        {/* 미는 방향에 따라 어떤 결정이 되는지 미리 보여줍니다.
            움직이는 스타일(style)과 Tailwind 클래스를 한 뷰에 섞지 않도록 뷰를 둘로 나눕니다. */}
        <Animated.View pointerEvents="none" aria-hidden style={[{ position: 'absolute', top: 28, left: 16 }, likeStyle]}>
          <View className="rounded-full bg-brand-500 px-4 py-2">
            <Text className="text-base font-bold text-white">관심 있어요</Text>
          </View>
        </Animated.View>
        <Animated.View pointerEvents="none" aria-hidden style={[{ position: 'absolute', top: 28, right: 16 }, passStyle]}>
          <View className="rounded-full bg-neutral-800 px-4 py-2">
            <Text className="text-base font-bold text-white">다음에</Text>
          </View>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}
