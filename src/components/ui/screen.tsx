import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors } from '@/theme/theme-view';
import { useMarkAppReady } from '@/features/splash/store';

type Props = {
  title?: string;
  subtitle?: string;
  /** 예: "2 / 5" */
  progress?: string;
  children: ReactNode;
  /** 화면 아래에 고정되는 영역 (주로 버튼) */
  footer?: ReactNode;
  /** 있으면 제목 위에 뒤로 가기 버튼을 보여줍니다 */
  onBack?: () => void;
  /** 제목 위에 넣을 내용 (예: 로그인 화면의 로고) */
  hero?: ReactNode;
};

/** 모든 화면의 공통 틀: 안전 영역, 키보드 대응, 스크롤, 웹에서의 최대 너비. */
export function Screen({ title, subtitle, progress, children, footer, onBack, hero }: Props) {
  const colors = useThemeColors();
  // 일반 화면이 그려지면 첫 화면 준비가 끝난 것으로 보고 표지를 걷습니다.
  useMarkAppReady();
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          className="flex-1"
          contentContainerClassName="items-center px-6 pb-8 pt-10"
          keyboardShouldPersistTaps="handled">
          <View className="w-full max-w-md gap-6">
            {onBack ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="뒤로"
                hitSlop={8}
                onPress={onBack}
                className="-mb-2 -ml-1 self-start">
                <Ionicons name="chevron-back" size={28} color={colors.fg} />
              </Pressable>
            ) : null}
            {hero}
            {title ? (
              <View className="gap-2">
                {progress ? <Text className="text-sm font-semibold text-brand-600">{progress}</Text> : null}
                <Text className="text-3xl font-bold text-fg">{title}</Text>
                {subtitle ? <Text className="text-base leading-6 text-muted">{subtitle}</Text> : null}
              </View>
            ) : null}
            {children}
          </View>
        </ScrollView>
        {footer ? (
          <View className="items-center border-t border-line bg-bg px-6 py-4">
            <View className="w-full max-w-md gap-3">{footer}</View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function LoadingScreen() {
  const colors = useThemeColors();
  return (
    <View className="flex-1 items-center justify-center bg-bg">
      <ActivityIndicator size="large" color={colors.brand} />
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return children ? <Text className="text-sm text-red-600">{children}</Text> : null;
}
