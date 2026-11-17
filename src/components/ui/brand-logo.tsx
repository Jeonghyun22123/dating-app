import Svg, { G, Path } from 'react-native-svg';

import { WORD_LETTERS, WORD_STROKE, WORD_WIDTH } from '@/features/brand/paths';
import { useThemeColors } from '@/theme/theme-view';

const PAD = 12;
const WIDTH = WORD_WIDTH + PAD * 2;
const HEIGHT = 100 + PAD * 2;

/**
 * MOMENT 글자 로고. 선으로 그린 벡터라 어떤 크기에서도 선명하고, 색은 현재 테마의 브랜드 색을 따릅니다.
 * 원본: assets/brand/wordmark.svg (앱 아이콘 원본은 assets/brand/icon.svg)
 */
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
        strokeWidth={WORD_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round">
        {WORD_LETTERS.map((letter, index) => (
          <Path key={index} d={letter.d} transform={`translate(${letter.x} 0)`} />
        ))}
      </G>
    </Svg>
  );
}
