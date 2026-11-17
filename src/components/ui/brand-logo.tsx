import Svg, { G, Path } from 'react-native-svg';

import { useThemeColors } from '@/theme/theme-view';

/**
 * MOMENT 글자 로고. 선으로 그린 벡터라 어떤 크기에서도 선명하고, 색은 현재 테마의 브랜드 색을 따릅니다.
 * 원본: assets/brand/wordmark.svg (앱 아이콘 원본은 assets/brand/icon.svg)
 */
const LETTERS: { d: string; x: number }[] = [
  { d: 'M0 100V0L46 62L92 0V100', x: 0 }, // M
  { d: 'M50 0A50 50 0 1 1 49.99 0Z', x: 122 }, // O
  { d: 'M0 100V0L46 62L92 0V100', x: 252 }, // M
  { d: 'M68 0H0V100H68M0 50H58', x: 374 }, // E
  { d: 'M0 100V0L82 100V0', x: 472 }, // N
  { d: 'M0 0H84M42 0V100', x: 584 }, // T
];
const PAD = 12;
const WIDTH = 668 + PAD * 2;
const HEIGHT = 100 + PAD * 2;

export function BrandLogo({ width = 180, color }: { width?: number; color?: string }) {
  const colors = useThemeColors();
  return (
    <Svg
      accessibilityLabel="MOMENT"
      width={width}
      height={(width * HEIGHT) / WIDTH}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      style={{ alignSelf: 'center', marginTop: 16, marginBottom: 12 }}>
      <G
        transform={`translate(${PAD} ${PAD})`}
        fill="none"
        stroke={color ?? colors.brand}
        strokeWidth={16}
        strokeLinecap="round"
        strokeLinejoin="round">
        {LETTERS.map((letter, index) => (
          <Path key={index} d={letter.d} transform={`translate(${letter.x} 0)`} />
        ))}
      </G>
    </Svg>
  );
}
