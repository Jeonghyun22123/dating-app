import { Pressable, Text, View } from 'react-native';

import { RangeSlider } from '@/components/ui/range-slider';

import { formatAgeRange, GENDER_CHOICES, PREF_LIMITS, type MatchPreferences } from './api';

type Props = {
  value: MatchPreferences;
  onChange: (value: MatchPreferences) => void;
};

/**
 * "만나고 싶은 사람" 입력 영역: 성별, 나이 범위, 거리.
 * 온보딩의 프로필 단계, 설정의 만남 조건 화면, 기존 가입자용 안내 화면에서 함께 씁니다.
 */
export function PreferencesForm({ value, onChange }: Props) {
  return (
    <View className="gap-6">
      <View className="gap-2">
        <Text className="text-sm font-medium text-muted">성별</Text>
        <View className="flex-row gap-2">
          {GENDER_CHOICES.map((choice) => {
            const selected = value.gender === choice.value;
            return (
              <Pressable
                key={choice.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                aria-checked={selected}
                accessibilityLabel={`만나고 싶은 성별 ${choice.label}`}
                onPress={() => onChange({ ...value, gender: choice.value })}
                className={`h-12 flex-1 items-center justify-center rounded-2xl border ${selected ? 'border-brand-500 bg-brand-50' : 'border-line bg-card'}`}>
                <Text className={`text-base ${selected ? 'font-semibold text-brand-600' : 'text-muted'}`}>
                  {choice.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="gap-1">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-medium text-muted">나이</Text>
          <Text className="text-base font-semibold text-fg">{formatAgeRange(value.ageMin, value.ageMax)}</Text>
        </View>
        <RangeSlider
          min={PREF_LIMITS.ageMin}
          max={PREF_LIMITS.ageMax}
          values={[value.ageMin, value.ageMax]}
          onChange={([ageMin, ageMax]) => onChange({ ...value, ageMin, ageMax })}
          labels={['최소 나이', '최대 나이']}
          formatValue={(age) => `${age}세`}
        />
      </View>

      <View className="gap-1">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-medium text-muted">거리</Text>
          <Text className="text-base font-semibold text-fg">{value.distanceKm}km 이내</Text>
        </View>
        <RangeSlider
          min={PREF_LIMITS.distanceMin}
          max={PREF_LIMITS.distanceMax}
          step={PREF_LIMITS.distanceStep}
          values={[value.distanceKm]}
          onChange={([distanceKm]) => onChange({ ...value, distanceKm })}
          labels={['거리']}
          formatValue={(km) => `${km}km`}
        />
      </View>

      <Text className="text-sm leading-5 text-subtle">
        내 조건에 맞고, 상대의 조건에도 내가 맞을 때만 서로에게 추천돼요. 조건은 다른 사람에게 공개되지 않아요.
      </Text>
    </View>
  );
}
