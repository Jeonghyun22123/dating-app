import { vars } from 'nativewind';
import { type ReactNode, useMemo } from 'react';
import { View, type ViewProps } from 'react-native';

import { useThemeStore } from '@/stores/theme-store';

import { getTheme, hex, themeVariables } from './themes';

/**
 * 안쪽 화면에 현재 테마의 색을 적용하는 뷰.
 * 앱 최상단에서 한 번 감싸고, Modal 은 별도의 창에 그려져 색이 전달되지 않으므로
 * Modal 안쪽 내용도 이 뷰로 한 번 더 감싸야 합니다.
 */
export function ThemeView({ children, style, ...props }: ViewProps & { children: ReactNode }) {
  const themeId = useThemeStore((s) => s.themeId);
  const variables = useMemo(() => vars(themeVariables(getTheme(themeId))), [themeId]);
  return (
    <View style={[variables, style]} {...props}>
      {children}
    </View>
  );
}

/** 클래스로 색을 줄 수 없는 곳(아이콘, 로딩 표시, 입력창 안내 글자, 탭 바)에 쓰는 실제 색 값 */
export function useThemeColors() {
  const themeId = useThemeStore((s) => s.themeId);
  return useMemo(() => {
    const theme = getTheme(themeId);
    const p = theme.palette;
    return {
      dark: theme.dark,
      bg: hex(p.bg),
      card: hex(p.card),
      field: hex(p.field),
      line: hex(p.line),
      fg: hex(p.fg),
      muted: hex(p.muted),
      subtle: hex(p.subtle),
      brand: hex(p.brand500),
      brandText: hex(p.brand600),
    };
  }, [themeId]);
}
