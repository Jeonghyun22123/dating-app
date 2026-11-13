import { type ReactNode, type Ref, useEffect, useImperativeHandle, useRef } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

type Action = 'like' | 'pass';

export type SlideCardHandle = {
  /** 버튼으로 결정했을 때도 카드가 같은 방식으로 날아가게 합니다. */
  decide: (action: Action) => void;
};

type Props = {
  children: ReactNode;
  /** 바로 다음 카드. 맨 위 카드를 밀수록 뒤에서 올라옵니다. */
  behind?: ReactNode;
  disabled?: boolean;
  /** 카드가 화면 밖으로 나간 뒤 호출. false 를 돌려주면(처리 실패) 카드가 제자리로 돌아옵니다. */
  onDecide: (action: Action) => Promise<boolean>;
  ref?: Ref<SlideCardHandle>;
};

/** 이 거리(px) 이상 밀거나 빠르게 튕기면 결정으로 봅니다. */
const DISTANCE = 110;
const VELOCITY = 900;
const EXIT_MS = 260;
const SPRING = { damping: 16, stiffness: 170, mass: 0.9 };

/**
 * 좌우로 밀어서 결정하는 카드.
 *   오른쪽으로 밀기 → 관심 있어요 / 왼쪽으로 밀기 → 다음에
 *
 * 움직임
 *   - 맨 위 카드: 손을 따라가며 살짝 기울고 떠오르고, 멀어질수록 투명해지다가 날아갑니다.
 *   - 뒤 카드: 작고 흐린 상태로 깔려 있다가, 위 카드가 밀리는 만큼 커지고 선명해지며 올라옵니다.
 *   - 조금만 밀다 놓으면 탄성 있게 제자리로 돌아옵니다.
 * 세로 스크롤과 사진 넘기기(탭)는 그대로 동작하도록 가로로 15px 이상 움직였을 때만 반응합니다.
 * 웹에서는 마우스 드래그로 동작합니다.
 */
export function SlideCard({ children, behind, disabled, onDecide, ref }: Props) {
  const { width } = useWindowDimensions();
  const x = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaving = useRef(false);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function decide(action: Action) {
    if (leaving.current) return;
    leaving.current = true;
    x.value = withTiming((action === 'like' ? 1 : -1) * width * 1.3, {
      duration: EXIT_MS,
      easing: Easing.out(Easing.cubic),
    });
    // 카드가 날아간 뒤에 처리합니다.
    timer.current = setTimeout(async () => {
      const ok = await onDecide(action);
      if (!ok) {
        leaving.current = false;
        x.value = withSpring(0, SPRING);
      }
    }, EXIT_MS);
  }

  useImperativeHandle(ref, () => ({ decide }));

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .runOnJS(true)
    .activeOffsetX([-15, 15])
    .failOffsetY([-20, 20])
    .onUpdate((event) => {
      if (!leaving.current) x.value = event.translationX;
    })
    .onEnd((event) => {
      if (leaving.current) return;
      const far = Math.abs(event.translationX) > DISTANCE;
      const fast = Math.abs(event.velocityX) > VELOCITY && Math.abs(event.translationX) > 30;
      if (far || fast) {
        decide(event.translationX > 0 ? 'like' : 'pass');
      } else {
        x.value = withSpring(0, SPRING);
      }
    });

  const topStyle = useAnimatedStyle(() => {
    const distance = Math.abs(x.value);
    return {
      opacity: interpolate(distance, [0, DISTANCE, width * 1.1], [1, 0.92, 0], 'clamp'),
      transform: [
        { translateX: x.value },
        { translateY: interpolate(distance, [0, width], [0, -36], 'clamp') },
        { rotate: `${interpolate(x.value, [-width, width], [-13, 13], 'clamp')}deg` },
      ],
    };
  });

  const behindStyle = useAnimatedStyle(() => {
    const progress = interpolate(Math.abs(x.value), [0, width * 0.55], [0, 1], 'clamp');
    return {
      opacity: interpolate(progress, [0, 1], [0.5, 1]),
      transform: [
        { translateY: interpolate(progress, [0, 1], [18, 0]) },
        { scale: interpolate(progress, [0, 1], [0.92, 1]) },
      ],
    };
  });

  const likeStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [20, DISTANCE], [0, 1], 'clamp') }));
  const passStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [-DISTANCE, -20], [1, 0], 'clamp') }));

  // 카드가 화면에 주어진 영역을 꽉 채우도록 모든 층을 flex: 1 로 둡니다.
  return (
    <View style={{ flex: 1 }}>
      {behind ? (
        // 맨 위 카드와 같은 영역 안에서만 보이도록 잘라 둡니다 (길이가 달라도 아래로 삐져나오지 않게).
        <View
          pointerEvents="none"
          aria-hidden
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', borderRadius: 24 }}>
          <Animated.View style={[{ flex: 1 }, behindStyle]}>{behind}</Animated.View>
        </View>
      ) : null}

      <GestureDetector gesture={pan}>
        {/* userSelect: 끄는 동안 카드의 글자가 선택(파란 블록)되지 않게 합니다 (웹) */}
        <Animated.View style={[{ flex: 1, userSelect: 'none' }, topStyle]}>
          {children}
          {/* 미는 방향에 따라 어떤 결정이 되는지 미리 보여줍니다.
              움직이는 스타일(style)과 Tailwind 클래스를 한 뷰에 섞지 않도록 뷰를 둘로 나눕니다. */}
          <Animated.View pointerEvents="none" aria-hidden style={[{ position: 'absolute', top: '38%', left: 20 }, likeStyle]}>
            <View className="rounded-full bg-brand-500 px-5 py-2.5">
              <Text className="text-lg font-bold text-white">관심 있어요</Text>
            </View>
          </Animated.View>
          <Animated.View pointerEvents="none" aria-hidden style={[{ position: 'absolute', top: '38%', right: 20 }, passStyle]}>
            <View className="rounded-full bg-neutral-800 px-5 py-2.5">
              <Text className="text-lg font-bold text-white">다음에</Text>
            </View>
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
