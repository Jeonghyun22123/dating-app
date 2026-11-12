import { Text, TextInput, type TextInputProps, View } from 'react-native';

type Props = TextInputProps & {
  label?: string;
  error?: string | null;
  hint?: string;
};

export function TextField({ label, error, hint, multiline, ...props }: Props) {
  return (
    <View className="gap-2">
      {label ? <Text className="text-sm font-medium text-neutral-700">{label}</Text> : null}
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#a3a3a3"
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        className={`rounded-2xl border bg-white px-4 text-base text-neutral-900 ${multiline ? 'min-h-32 py-3' : 'h-14'} ${error ? 'border-red-500' : 'border-neutral-300 focus:border-brand-500'}`}
        {...props}
      />
      {error ? (
        <Text className="text-sm text-red-600">{error}</Text>
      ) : hint ? (
        <Text className="text-sm text-neutral-500">{hint}</Text>
      ) : null}
    </View>
  );
}
