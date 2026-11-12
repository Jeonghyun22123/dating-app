import { ActivityIndicator, Pressable, Text } from 'react-native';

type Props = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
};

const container = {
  primary: 'bg-brand-500 active:bg-brand-600',
  secondary: 'border border-neutral-300 bg-white active:bg-neutral-100',
  ghost: 'active:bg-neutral-100',
};
const label = {
  primary: 'text-white',
  secondary: 'text-neutral-900',
  ghost: 'text-neutral-500',
};

export function Button({ title, onPress, variant = 'primary', loading, disabled }: Props) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      className={`h-14 flex-row items-center justify-center rounded-2xl px-5 ${container[variant]} ${inactive ? 'opacity-50' : ''}`}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#ffffff' : '#525252'} />
      ) : (
        <Text className={`text-base font-semibold ${label[variant]}`}>{title}</Text>
      )}
    </Pressable>
  );
}
