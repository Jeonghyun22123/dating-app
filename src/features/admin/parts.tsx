import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useThemeColors } from '@/theme/theme-view';

/** 목록 공통 상태 표시: 불러오는 중 / 오류 / 비어 있음 */
export function ListState({
  loading,
  error,
  empty,
  emptyText,
  onRetry,
}: {
  loading: boolean;
  error: boolean;
  empty: boolean;
  emptyText: string;
  onRetry: () => void;
}) {
  const colors = useThemeColors();
  if (loading) {
    return (
      <View className="items-center py-16">
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }
  if (error) {
    return (
      <View className="items-center gap-3 py-16">
        <Text className="text-base text-muted">불러오지 못했어요.</Text>
        <Pressable accessibilityRole="button" onPress={onRetry}>
          <Text className="text-base font-semibold text-brand-600">다시 시도</Text>
        </Pressable>
      </View>
    );
  }
  if (empty) {
    return (
      <View className="items-center py-16">
        <Text className="text-base text-muted">{emptyText}</Text>
      </View>
    );
  }
  return null;
}

export function Card({ children }: { children: ReactNode }) {
  return <View className="gap-3 rounded-2xl border border-line bg-card p-4">{children}</View>;
}

export function Badge({ label, tone }: { label: string; tone: 'neutral' | 'green' | 'red' | 'amber' }) {
  const styles = {
    neutral: ['bg-field', 'text-muted'],
    green: ['bg-emerald-50', 'text-emerald-700'],
    red: ['bg-red-50', 'text-red-700'],
    amber: ['bg-amber-50', 'text-amber-700'],
  }[tone];
  return (
    <View className={`rounded-full px-2.5 py-0.5 ${styles[0]}`}>
      <Text className={`text-xs font-semibold ${styles[1]}`}>{label}</Text>
    </View>
  );
}

type ActionProps = {
  title: string;
  onPress: () => Promise<void> | void;
  tone?: 'primary' | 'danger' | 'plain';
  /** true 면 한 번 더 눌러야 실행됩니다 (정지·반려 같은 되돌리기 번거로운 작업용). */
  confirm?: boolean;
  disabled?: boolean;
};

/** 관리자 화면용 작은 버튼. 실행 중 표시와 두 번 눌러 확인을 지원합니다. */
export function ActionButton({ title, onPress, tone = 'plain', confirm, disabled }: ActionProps) {
  const colors = useThemeColors();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  // 확인 대기 상태는 4초 뒤 자동으로 풀립니다.
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);

  async function handlePress() {
    if (confirm && !armed) return setArmed(true);
    setArmed(false);
    setBusy(true);
    try {
      await onPress();
    } finally {
      setBusy(false);
    }
  }

  const container = {
    primary: 'bg-brand-500',
    danger: armed ? 'bg-red-600' : 'border border-red-300 bg-card',
    plain: 'border border-line bg-card',
  }[tone];
  const label = {
    primary: 'text-white',
    danger: armed ? 'text-white' : 'text-red-600',
    plain: 'text-fg',
  }[tone];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={handlePress}
      className={`h-10 items-center justify-center rounded-xl px-4 ${container} ${disabled || busy ? 'opacity-50' : ''}`}>
      {busy ? (
        <ActivityIndicator size="small" color={tone === 'primary' || armed ? '#ffffff' : colors.muted} />
      ) : (
        <Text className={`text-sm font-semibold ${label}`}>{armed ? '한 번 더 눌러 확인' : title}</Text>
      )}
    </Pressable>
  );
}

/** 작업 실패 문구를 보관하는 작은 도우미. */
export function useActionError() {
  const [error, setError] = useState<string | null>(null);
  async function run(action: () => Promise<void>, message: string) {
    setError(null);
    try {
      await action();
    } catch (e) {
      const detail = (e as { message?: string }).message;
      setError(detail && /[가-힣]/.test(detail) ? detail : message);
    }
  }
  return { error, run };
}
