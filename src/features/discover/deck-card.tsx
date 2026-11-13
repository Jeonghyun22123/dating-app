import { type ReactNode, useEffect, useRef } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

export type DeckAction = 'like' | 'pass';

type Props = {
  /** 이 카드 자신의 가로 위치. 카드마다 따로 가지며, 부모가 만들어 넘겨줍니다. */
  x: SharedValue<number>;
  /**
   * 바로 앞(위)에 있는 카드의 가로 위치. 없으면 이 카드가 맨 위입니다.
   * 앞 카드가 밀려날수록 이 카드가 커지고 선명해지며 올라옵니다.
   */
  frontX?: SharedValue<number>;
  disabled?: boolean;
  /** 카드가 화면 밖으로 날아간 뒤 호출됩니다. */
  onDecide: (action: DeckAction) => void;
  /** decide: 버튼으로 결정할 때도 같은 방식으로 날아가게 하는 함수 */
  children: (decide: (action: DeckAction) => void) => ReactNode;
};

/** 이 거리(px) 이상 밀거나 빠르게 튕기면 결정으로 봅니다. */
const DISTANCE = 110;
const VELOCITY = 900;
const EXIT_MS = 260;
const SPRING = { damping: 16, stiffness: 170, mass: 0.9 };

/**
 * 카드 더미의 카드 한 장. 좌우로 밀어서 결정합니다.
 *   오른쪽으로 밀기 → 관심 있어요 / 왼쪽으로 밀기 → 다음에
 *
 * 깜빡임 없이 이어지게 하는 핵심:
 *   뒤에 깔려 있던 카드가 "같은 컴포넌트 그대로" 맨 위 카드가 됩니다 (새로 만들지 않음).
 *   모양은 두 값으로만 정해집니다 — 자기 위치(x)와, 앞 카드가 얼마나 비켜났는지(frontX).
 *   앞 카드가 완전히 날아간 순간의 모양과 맨 위 카드의 모양이 똑같아서, 역할이 바뀌어도
 *   화면에는 아무 변화가 없습니다. 사진도 다시 불러오지 않습니다.
 *
 * 세로 방향 움직임과 사진 넘기기(탭)는 방해하지 않도록 가로로 15px 이상 움직였을 때만 반응합니다.
 * 웹에서는 마우스 드래그로 동작합니다.
 */
export function DeckCard({ x, frontX, disabled, onDecide, children }: Props) {
  const { width } = useWindowDimensions();
  const isTop = !frontX;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaving = useRef(false);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function decide(action: DeckAction) {
    if (leaving.current || !isTop || disabled) return;
    leaving.current = true;
    x.value = withTiming((action === 'like' ? 1 : -1) * width * 1.3, {
      duration: EXIT_MS,
      easing: Easing.out(Easing.cubic),
    });
    // 카드가 날아간 뒤에 알립니다.
    timer.current = setTimeout(() => onDecide(action), EXIT_MS);
  }

  const pan = Gesture.Pan()
    .enabled(isTop && !disabled)
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

  const cardStyle = useAnimatedStyle(() => {
    const distance = Math.abs(x.value);
    // 앞 카드가 비켜난 정도 (0 = 뒤에 깔림, 1 = 완전히 올라옴). 앞 카드가 없으면 항상 1.
    const risen = frontX ? interpolate(Math.abs(frontX.value), [0, width * 0.55], [0, 1], 'clamp') : 1;
    return {
      opacity:
        interpolate(distance, [0, DISTANCE, width * 1.1], [1, 0.92, 0], 'clamp') * interpolate(risen, [0, 1], [0.5, 1]),
      transform: [
        { translateX: x.value },
        { translateY: interpolate(distance, [0, width], [0, -36], 'clamp') + interpolate(risen, [0, 1], [18, 0]) },
        { rotate: `${interpolate(x.value, [-width, width], [-13, 13], 'clamp')}deg` },
        { scale: interpolate(risen, [0, 1], [0.92, 1]) },
      ],
    };
  });

  const likeStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [20, DISTANCE], [0, 1], 'clamp') }));
  const passStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [-DISTANCE, -20], [1, 0], 'clamp') }));

  return (
    <GestureDetector gesture={pan}>
      {/* userSelect: 끄는 동안 카드의 글자가 선택(파란 블록)되지 않게 합니다 (웹) */}
      <Animated.View
        pointerEvents={isTop ? 'auto' : 'none'}
        aria-hidden={!isTop}
        style={[
          { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: isTop ? 2 : 1, userSelect: 'none' },
          cardStyle,
        ]}>
        {children(decide)}
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
  );
}
