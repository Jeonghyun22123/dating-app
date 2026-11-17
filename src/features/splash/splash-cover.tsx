import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { G, Path } from 'react-native-svg';

import { BRAND, COVER, MARK_PATHS, MARK_STROKE, WORD_LETTERS, WORD_STROKE } from '@/features/brand/paths';
import { useThemeStore } from '@/stores/theme-store';

import { SPLASH_MAX_MS, SPLASH_MIN_MS, useSplashStore } from './store';

// 휴대폰 앱: 기본 시작 화면을 바로 닫지 않고, 같은 모양의 표지(아래)가 그려진 뒤에 닫습니다.
if (Platform.OS !== 'web') SplashScreen.preventAutoHideAsync().catch(() => {});

const START = Date.now();
const DRAW_MS = 600;
const STAGGER_MS = 50;

/** 남은 최소·최대 시간을 지켜 표지를 걷을 시점을 알려줍니다. */
function useShouldHide(start: number) {
  const ready = useSplashStore((s) => s.ready);
  const [hide, setHide] = useState(false);
  useEffect(() => {
    const elapsed = Date.now() - start;
    const max = setTimeout(() => setHide(true), Math.max(0, SPLASH_MAX_MS - elapsed));
    const min = ready ? setTimeout(() => setHide(true), Math.max(0, SPLASH_MIN_MS - elapsed)) : undefined;
    return () => {
      clearTimeout(max);
      if (min) clearTimeout(min);
    };
  }, [ready, start]);
  return hide;
}

/** 웹: 서버가 미리 그려 둔 표지(boot-splash.tsx)를 준비가 끝나면 부드럽게 걷어 냅니다. */
function WebSplashCover() {
  const start =
    typeof window === 'undefined' ? START : ((window as { __bootStart?: number }).__bootStart ?? START);
  const hide = useShouldHide(start);
  useEffect(() => {
    if (!hide || typeof document === 'undefined') return;
    const el = document.getElementById('boot-splash');
    if (!el) return;
    el.classList.add('boot-out');
    const timer = setTimeout(() => {
      el.remove();
      // 혹시 문서가 조금이라도 밀려 있으면 제자리로 돌립니다 (iOS 홈 화면 앱).
      window.scrollTo(0, 0);
      useSplashStore.setState({ done: true });
    }, 500);
    return () => clearTimeout(timer);
  }, [hide]);
  return null;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

function DrawnPath({ d, len, index, reduce }: { d: string; len: number; index: number; reduce: boolean }) {
  // 선 길이보다 조금 더 밀어 두어야 그리기 전 시작점·끝점에 둥근 점이 생기지 않습니다.
  const offset = useSharedValue(reduce ? 0 : len + 4);
  useEffect(() => {
    if (reduce) return;
    offset.value = withDelay(
      index * STAGGER_MS,
      withTiming(0, { duration: DRAW_MS, easing: Easing.bezier(0.6, 0, 0.3, 1) }),
    );
  }, [index, offset, reduce]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: offset.value }));
  return <AnimatedPath d={d} strokeDasharray={[len, len + 100]} animatedProps={props} />;
}

/** 휴대폰 앱: 같은 표지를 화면 위에 그리고, 선 그리기 → 두근 → 걷어 내기 순서로 움직입니다. */
function NativeSplashCover() {
  const themeId = useThemeStore((s) => s.themeId);
  const colors = BRAND[themeId] ?? BRAND.dark;
  const reduce = useReducedMotion();
  const hide = useShouldHide(START);
  const [gone, setGone] = useState(false);

  const drawEnd = DRAW_MS + STAGGER_MS * (MARK_PATHS.length - 1);
  const word = useSharedValue(reduce ? 1 : 0);
  const beat = useSharedValue(1);
  const cover = useSharedValue(1);

  useEffect(() => {
    if (reduce) return;
    word.value = withDelay(drawEnd - 200, withTiming(1, { duration: 450 }));
    const pulse = () =>
      withSequence(
        withTiming(1.06, { duration: 160 }),
        withTiming(0.99, { duration: 160 }),
        withTiming(1, { duration: 200 }),
      );
    beat.value = withDelay(
      drawEnd,
      withSequence(
        pulse(),
        withDelay(600, withRepeat(withSequence(pulse(), withTiming(1, { duration: 780 })), -1)),
      ),
    );
  }, [beat, drawEnd, reduce, word]);

  useEffect(() => {
    if (!hide) return;
    cover.value = withTiming(0, { duration: 450 }, () => {});
    const timer = setTimeout(() => {
      setGone(true);
      useSplashStore.setState({ done: true });
    }, 480);
    return () => clearTimeout(timer);
  }, [cover, hide]);

  const coverStyle = useAnimatedStyle(() => ({
    opacity: cover.value,
    transform: [{ scale: reduce ? 1 : 1 + (1 - cover.value) * 0.06 }],
  }));
  const logoStyle = useAnimatedStyle(() => ({ transform: [{ scale: beat.value }] }));
  const wordStyle = useAnimatedStyle(() => ({ opacity: word.value }));

  if (gone) return null;
  return (
    <Animated.View
      pointerEvents={hide ? 'none' : 'auto'}
      onLayout={() => SplashScreen.hideAsync().catch(() => {})}
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
        coverStyle,
      ]}>
      <Animated.View style={[{ width: '62%', maxWidth: 280, aspectRatio: 768 / 496 }, logoStyle]}>
        <Svg width="100%" height="100%" viewBox={COVER.viewBox}>
          <G
            fill="none"
            stroke={colors.ink}
            strokeWidth={MARK_STROKE}
            strokeLinecap="round"
            strokeLinejoin="round">
            {MARK_PATHS.map((path, index) => (
              <DrawnPath key={index} d={path.d} len={path.len} index={index} reduce={reduce} />
            ))}
          </G>
        </Svg>
        <Animated.View style={[StyleSheet.absoluteFill, wordStyle]}>
          <Svg width="100%" height="100%" viewBox={COVER.viewBox}>
            <G transform={`translate(${COVER.wordX} ${COVER.wordY}) scale(${COVER.wordScale})`}>
              <G
                fill="none"
                stroke={colors.ink}
                strokeWidth={WORD_STROKE}
                strokeLinecap="round"
                strokeLinejoin="round">
                {WORD_LETTERS.map((letter, index) => (
                  <Path key={index} d={letter.d} transform={`translate(${letter.x} 0)`} />
                ))}
              </G>
            </G>
          </Svg>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

/**
 * 앱을 처음 켤 때 화면을 덮는 로고 표지.
 * 첫 화면이 준비되면(markAppReady) 최소 1.5초, 최대 5초 규칙에 맞춰 부드럽게 사라집니다.
 */
export function SplashCover() {
  return Platform.OS === 'web' ? <WebSplashCover /> : <NativeSplashCover />;
}
