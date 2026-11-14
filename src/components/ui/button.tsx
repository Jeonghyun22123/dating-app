import { ActivityIndicator, Pressable, Text } from 'react-native';
import { useThemeColors } from '@/theme/theme-view';

type Props = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
};

const container = {
  primary: 'bg-brand-500 active:bg-brand-600',
  secondary: 'border border-line bg-card active:bg-field',
  ghost: 'active:bg-field',
};
const label = {
  primary: 'text-white',
  secondary: 'text-fg',
  ghost: 'text-muted',
};

export function Button({ title, onPress, variant = 'primary', loading, disabled }: Props) {
  const colors = useThemeColors();
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      aria-disabled={!!inactive}
      aria-busy={!!loading}
      disabled={inactive}
      onPress={onPress}
      className={`h-14 flex-row items-center justify-center rounded-2xl px-5 ${container[variant]} ${inactive ? 'opacity-50' : ''}`}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#ffffff' : colors.muted} />
      ) : (
        <Text className={`text-base font-semibold ${label[variant]}`}>{title}</Text>
      )}
    </Pressable>
  );
}
