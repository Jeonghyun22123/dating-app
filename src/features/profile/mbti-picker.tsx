import { Pressable, Text, View } from 'react-native';

/** MBTI 4가지 축. 각 축에서 하나씩 고르면 유형(예: ENFP)이 됩니다. */
const AXES: [string, string, string, string][] = [
  ['E', '외향', 'I', '내향'],
  ['S', '감각', 'N', '직관'],
  ['T', '사고', 'F', '감정'],
  ['J', '판단', 'P', '인식'],
];

/** 고른 글자 4칸 (아직 안 고른 칸은 null) */
export type MbtiDraft = (string | null)[];

export const toMbtiDraft = (mbti: string | null | undefined): MbtiDraft =>
  mbti && /^[EI][SN][TF][JP]$/.test(mbti) ? mbti.split('') : [null, null, null, null];

/** 4칸을 다 고르면 유형 문자열, 하나도 안 고르면 null, 일부만 고르면 undefined(미완성) */
export function mbtiFromDraft(draft: MbtiDraft): string | null | undefined {
  if (draft.every((letter) => letter === null)) return null;
  if (draft.some((letter) => letter === null)) return undefined;
  return draft.join('');
}

/** MBTI 고르기 (선택 사항). 축마다 두 글자 중 하나를 고르고, "선택 안 함"으로 비울 수 있습니다. */
export function MbtiPicker({ value, onChange }: { value: MbtiDraft; onChange: (next: MbtiDraft) => void }) {
  const result = mbtiFromDraft(value);
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-medium text-muted">MBTI (선택)</Text>
        <Text accessibilityLabel={`MBTI ${result ?? '없음'}`} className="text-base font-bold text-brand-600">
          {result ?? (result === null ? '선택 안 함' : value.map((l) => l ?? '·').join(''))}
        </Text>
      </View>
      {AXES.map(([a, aLabel, b, bLabel], index) => (
        <View key={a} className="flex-row gap-2">
          {[
            [a, aLabel],
            [b, bLabel],
          ].map(([letter, label]) => {
            const selected = value[index] === letter;
            return (
              <Pressable
                key={letter}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                aria-checked={selected}
                accessibilityLabel={`${letter} ${label}`}
                onPress={() => onChange(value.map((current, i) => (i === index ? letter : current)))}
                className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border py-2.5 ${selected ? 'border-brand-500 bg-brand-500' : 'border-line bg-card'}`}>
                <Text className={`text-base font-bold ${selected ? 'text-white' : 'text-fg'}`}>{letter}</Text>
                <Text className={`text-sm ${selected ? 'text-white' : 'text-muted'}`}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
      {result !== null ? (
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => onChange([null, null, null, null])}
          className="self-end">
          <Text className="text-sm text-muted underline">선택 안 함</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
