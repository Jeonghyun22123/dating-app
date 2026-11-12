import type { ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = {
  title?: string;
  subtitle?: string;
  /** 예: "2 / 5" */
  progress?: string;
  children: ReactNode;
  /** 화면 아래에 고정되는 영역 (주로 버튼) */
  footer?: ReactNode;
};

/** 모든 화면의 공통 틀: 안전 영역, 키보드 대응, 스크롤, 웹에서의 최대 너비. */
export function Screen({ title, subtitle, progress, children, footer }: Props) {
  return (
    <SafeAreaView className="flex-1 bg-neutral-50">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          className="flex-1"
          contentContainerClassName="items-center px-6 pb-8 pt-10"
          keyboardShouldPersistTaps="handled">
          <View className="w-full max-w-md gap-6">
            {title ? (
              <View className="gap-2">
                {progress ? <Text className="text-sm font-semibold text-brand-600">{progress}</Text> : null}
                <Text className="text-3xl font-bold text-neutral-900">{title}</Text>
                {subtitle ? <Text className="text-base leading-6 text-neutral-600">{subtitle}</Text> : null}
              </View>
            ) : null}
            {children}
          </View>
        </ScrollView>
        {footer ? (
          <View className="items-center border-t border-neutral-200 bg-neutral-50 px-6 py-4">
            <View className="w-full max-w-md gap-3">{footer}</View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function LoadingScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-neutral-50">
      <ActivityIndicator size="large" color="#f43f5e" />
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return children ? <Text className="text-sm text-red-600">{children}</Text> : null;
}
