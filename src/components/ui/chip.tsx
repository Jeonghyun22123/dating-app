import { Pressable, Text } from 'react-native';

type Props = { label: string; selected: boolean; onPress: () => void; disabled?: boolean };

export function Chip({ label, selected, onPress, disabled }: Props) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`rounded-full border px-4 py-2 ${selected ? 'border-brand-500 bg-brand-500' : 'border-line bg-card'} ${disabled ? 'opacity-40' : ''}`}>
      <Text className={`text-sm ${selected ? 'font-semibold text-white' : 'text-muted'}`}>{label}</Text>
    </Pressable>
  );
}
