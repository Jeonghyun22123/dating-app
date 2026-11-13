import { Text, TextInput, type TextInputProps, View } from 'react-native';
import { useThemeColors } from '@/theme/theme-view';

type Props = TextInputProps & {
  label?: string;
  error?: string | null;
  hint?: string;
};

export function TextField({ label, error, hint, multiline, ...props }: Props) {
  const colors = useThemeColors();
  return (
    <View className="gap-2">
      {label ? <Text className="text-sm font-medium text-muted">{label}</Text> : null}
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.subtle}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        className={`rounded-2xl border bg-card px-4 text-base text-fg ${multiline ? 'min-h-32 py-3' : 'h-14'} ${error ? 'border-red-500' : 'border-line focus:border-brand-500'}`}
        {...props}
      />
      {error ? (
        <Text className="text-sm text-red-600">{error}</Text>
      ) : hint ? (
        <Text className="text-sm text-muted">{hint}</Text>
      ) : null}
    </View>
  );
}
