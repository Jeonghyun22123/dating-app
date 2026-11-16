import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { updateEconomy, useAdminSettings, type Economy } from './api';
import { ActionButton, Card, ListState, useActionError } from './parts';

const ECONOMY_FIELDS: {
  key: keyof Economy;
  label: string;
  unit: string;
  step: number;
  min: number;
  max: number;
}[] = [
  { key: 'daily_swipe_limit', label: '무료 회원 하루 둘러보기 횟수', unit: '번', step: 5, min: 5, max: 1000 },
  {
    key: 'signal_heart_cost',
    label: '시그널 1번 가격 (무료 5회 이후)',
    unit: '하트',
    step: 1,
    min: 0,
    max: 1000,
  },
  { key: 'spotlight_heart_cost', label: '스포트라이트 1번 가격', unit: '하트', step: 1, min: 0, max: 1000 },
  { key: 'spotlight_minutes', label: '스포트라이트 지속 시간', unit: '분', step: 5, min: 5, max: 1440 },
];

/** 관리자 > 설정: 하루 횟수 제한과 하트 가격 */
function EconomySection({ saved }: { saved: Economy }) {
  const [values, setValues] = useState<Economy>(saved);
  const [done, setDone] = useState(false);
  const { error, run } = useActionError();
  useEffect(() => setValues(saved), [saved]);
  const changed = ECONOMY_FIELDS.some((f) => values[f.key] !== saved[f.key]);

  return (
    <Card>
      <Text className="text-base font-semibold text-fg">횟수 제한과 하트 가격</Text>
      {ECONOMY_FIELDS.map((f) => (
        <View key={f.key} className="flex-row items-center justify-between gap-3">
          <Text className="flex-1 text-sm text-muted">{f.label}</Text>
          <View className="flex-row items-center gap-2">
            <ActionButton
              title="−"
              onPress={() => {
                setValues({ ...values, [f.key]: Math.max(f.min, values[f.key] - f.step) });
                setDone(false);
              }}
            />
            <Text
              accessibilityLabel={`${f.label} ${values[f.key]}${f.unit}`}
              className="w-20 text-center text-base font-bold text-fg">
              {values[f.key]}
              {f.unit}
            </Text>
            <ActionButton
              title="+"
              onPress={() => {
                setValues({ ...values, [f.key]: Math.min(f.max, values[f.key] + f.step) });
                setDone(false);
              }}
            />
          </View>
        </View>
      ))}
      {error ? <Text className="text-sm text-red-600">{error}</Text> : null}
      {done ? (
        <Text className="text-sm text-emerald-600">저장했어요. 회원들의 앱에 바로 적용돼요.</Text>
      ) : null}
      <View className="flex-row justify-end">
        <ActionButton
          title="가격·횟수 저장"
          tone="primary"
          disabled={!changed}
          onPress={() =>
            run(async () => {
              setDone(false);
              await updateEconomy(values);
              setDone(true);
            }, '저장하지 못했어요. 잠시 후 다시 시도해 주세요.')
          }
        />
      </View>
    </Card>
  );
}

/** 관리자 > 설정: 가격·횟수. (심사 방식은 각 심사 탭의 오른쪽 위 스위치에서 바꿉니다) */
export function AdminSettingsSection() {
  const settings = useAdminSettings();

  if (!settings.data) {
    return (
      <ListState
        loading={settings.isPending}
        error={settings.isError}
        empty={false}
        emptyText=""
        onRetry={() => settings.refetch()}
      />
    );
  }

  return (
    <View className="gap-3">
      {settings.data.economy ? <EconomySection saved={settings.data.economy} /> : null}
      <Text className="text-sm leading-5 text-subtle">
        심사 방식(AI 먼저 / 관리자 직접 승인)은 "신규회원 심사"와 "사진수정 심사" 탭의 오른쪽 위에서 각각 바꿀
        수 있어요. 설정 변경은 관리자 작업 기록에 남습니다.
      </Text>
    </View>
  );
}
