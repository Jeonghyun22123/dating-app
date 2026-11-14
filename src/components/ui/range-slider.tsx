import { useRef, useState } from 'react';
import { type LayoutChangeEvent, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

const THUMB = 28;

type Props = {
  min: number;
  max: number;
  step?: number;
  /** 손잡이가 하나면 [값], 범위(둘)면 [작은 값, 큰 값] */
  values: number[];
  onChange: (values: number[]) => void;
  /** 손잡이별 접근성 이름 (예: ['최소 나이', '최대 나이']) */
  labels: string[];
  /** 접근성 읽기용 값 표현 (예: 25 → "25세") */
  formatValue?: (value: number) => string;
};

/**
 * 좌우로 끌어서 값을 고르는 슬라이더. 손잡이 하나(단일 값) 또는 둘(범위)을 지원합니다.
 * 웹·iOS·Android 에서 똑같이 동작하도록 직접 만들었습니다 (웹에서는 마우스 드래그).
 * 세로 스크롤을 방해하지 않도록 가로로 움직였을 때만 반응합니다.
 */
export function RangeSlider({ min, max, step = 1, values, onChange, labels, formatValue = String }: Props) {
  const [width, setWidth] = useState(0);
  // 끌기 시작한 순간의 값들
  const startValues = useRef(values);
  // 끄는 동안 최신 값을 읽기 위한 참조 (제스처 콜백이 예전 값을 붙잡지 않도록)
  const latest = useRef(values);
  latest.current = values;

  const usable = Math.max(width - THUMB, 1);
  const toX = (value: number) => ((value - min) / (max - min)) * usable;
  const snap = (value: number) => Math.round(value / step) * step;

  function setValue(index: number, raw: number) {
    const current = latest.current;
    // 범위일 때는 두 손잡이가 서로를 넘어가지 못하게 합니다.
    const low = index === 1 ? current[0] : min;
    const high = index === 0 && current.length === 2 ? current[1] : max;
    const next = Math.min(Math.max(snap(raw), low), high);
    if (next === current[index]) return;
    const copy = [...current];
    copy[index] = next;
    onChange(copy);
  }

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  const fillLeft = values.length === 2 ? toX(values[0]) : 0;
  const fillRight = toX(values[values.length - 1]);

  return (
    <View onLayout={onLayout} style={{ height: 44, justifyContent: 'center' }}>
      {/* 전체 트랙 */}
      <View className="h-1.5 rounded-full bg-field" style={{ marginHorizontal: THUMB / 2 }} />
      {/* 선택된 구간 */}
      <View
        className="absolute h-1.5 rounded-full bg-brand-500"
        style={{ left: fillLeft + THUMB / 2, width: Math.max(fillRight - fillLeft, 0) }}
      />
      {values.map((value, index) => {
        const pan = Gesture.Pan()
          .runOnJS(true)
          .activeOffsetX([-4, 4])
          .failOffsetY([-12, 12])
          .onBegin(() => {
            startValues.current = latest.current;
          })
          .onUpdate((event) => {
            const start = startValues.current;
            // 두 손잡이가 같은 값에 겹쳐 있으면 위에 놓인 손잡이만 잡혀서 한쪽으로는 움직일 수 없게 됩니다.
            // 그럴 때는 끄는 방향으로 손잡이를 고릅니다 (왼쪽 → 작은 값, 오른쪽 → 큰 값).
            const active = start.length === 2 && start[0] === start[1] ? (event.translationX < 0 ? 0 : 1) : index;
            setValue(active, start[active] + (event.translationX / usable) * (max - min));
          });
        return (
          <GestureDetector key={labels[index]} gesture={pan}>
            <View
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel={labels[index]}
              accessibilityValue={{ min, max, now: value, text: formatValue(value) }}
              // 웹에서는 아래 aria-* 값으로 전달됩니다 (화면 낭독기가 현재 값을 읽을 수 있게)
              aria-valuemin={min}
              aria-valuemax={max}
              aria-valuenow={value}
              aria-valuetext={formatValue(value)}
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              onAccessibilityAction={(event) =>
                setValue(index, value + (event.nativeEvent.actionName === 'increment' ? step : -step))
              }
              hitSlop={10}
              className="absolute items-center justify-center rounded-full border-2 border-brand-500 bg-card"
              style={{ left: toX(value), width: THUMB, height: THUMB, userSelect: 'none', cursor: 'pointer' }}>
              <View className="h-2 w-2 rounded-full bg-brand-500" />
            </View>
          </GestureDetector>
        );
      })}
    </View>
  );
}
