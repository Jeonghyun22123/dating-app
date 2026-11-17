import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { importRegions, REGION_DATA_CREDIT, useRegionCount } from '@/features/location/api';

import {
  backfillEmbeddings,
  updateEconomy,
  useAdminSettings,
  type BackfillResult,
  type Economy,
} from './api';
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

const BACKFILL_REASON: Record<string, string> = {
  no_api_key: 'OpenAI 키가 등록되지 않았어요. Supabase Edge Function 시크릿에 OPENAI_API_KEY 를 넣어 주세요.',
  openai_error: 'OpenAI 요청이 실패했어요. 키와 결제 수단(크레딧)을 확인해 주세요.',
};

/** 성향 기반 추천: 임베딩이 없는 회원(키 등록 전 가입자, 테스트용 가짜 프로필)을 채웁니다. */
function EmbeddingSection() {
  const { error, run } = useActionError();
  const [result, setResult] = useState<BackfillResult | null>(null);
  return (
    <Card>
      <Text className="text-base font-semibold text-fg">성향 기반 추천</Text>
      <Text className="text-sm leading-5 text-muted">
        만남 목적·취미·자기소개로 성향을 분석해, 둘러보기에서 비슷한 사람을 먼저 보여줍니다. 새 회원과
        프로필을 고친 회원은 자동으로 분석돼요. 키를 등록하기 전에 가입한 회원은 아래 버튼으로 한 번에 채울 수
        있어요.
      </Text>
      {error ? <Text className="text-sm text-red-600">{error}</Text> : null}
      {result ? (
        'skipped' in result ? (
          <Text className="text-sm text-red-600">
            {BACKFILL_REASON[result.reason] ?? '분석하지 못했어요.'}
          </Text>
        ) : (
          <Text className="text-sm text-emerald-600">
            {result.processed}명을 분석했어요.{' '}
            {result.remaining > 0
              ? `아직 ${result.remaining}명 남았어요. 한 번 더 눌러 주세요.`
              : '모두 채웠어요.'}
          </Text>
        )
      ) : null}
      <View className="flex-row justify-end">
        <ActionButton
          title="분석 안 된 회원 채우기"
          onPress={() =>
            run(async () => {
              setResult(null);
              setResult(await backfillEmbeddings());
            }, '요청하지 못했어요. update-profile-embedding 함수가 배포되어 있는지 확인해 주세요.')
          }
        />
      </View>
    </Card>
  );
}

/** 동네(행정동) 경계 데이터: 동네 선택 목록과 현재 위치 인증에 필요합니다. */
function RegionSection() {
  const count = useRegionCount();
  const { error, run } = useActionError();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [finished, setFinished] = useState(false);
  const regionCount = typeof count.data === 'number' ? count.data : null;
  const empty = regionCount === 0;
  return (
    <Card>
      <Text className="text-base font-semibold text-fg">동네 데이터</Text>
      <Text className="text-sm leading-5 text-muted">
        동네 선택 목록과 현재 위치 인증에 쓰는 전국 읍·면·동 경계예요. 처음 한 번, 그리고 행정구역이 바뀐 새
        데이터로 앱을 업데이트했을 때 불러오면 됩니다.
      </Text>
      <Text className={`text-sm font-semibold ${empty || count.isError ? 'text-red-600' : 'text-fg'}`}>
        {count.isError
          ? '확인하지 못했어요. supabase_regions.sql 을 먼저 실행해 주세요.'
          : regionCount === null
            ? '확인 중…'
            : empty
              ? '아직 불러오지 않았어요. 불러오기 전에는 회원이 동네를 설정할 수 없어요.'
              : `${regionCount.toLocaleString('ko-KR')}개 동네가 들어 있어요.`}
      </Text>
      {progress ? (
        <Text className="text-sm text-muted">
          {progress.done.toLocaleString('ko-KR')} / {progress.total.toLocaleString('ko-KR')} 불러오는 중…
        </Text>
      ) : null}
      {finished ? <Text className="text-sm text-emerald-600">동네 데이터를 모두 불러왔어요.</Text> : null}
      {error ? <Text className="text-sm text-red-600">{error}</Text> : null}
      <View className="flex-row justify-end">
        <ActionButton
          title={empty ? '동네 데이터 불러오기' : '동네 데이터 다시 불러오기'}
          tone={empty ? 'primary' : 'plain'}
          onPress={() =>
            run(async () => {
              setFinished(false);
              try {
                await importRegions((done, total) => setProgress({ done, total }));
                setFinished(true);
              } finally {
                setProgress(null);
              }
            }, '불러오지 못했어요. supabase_regions.sql 을 실행했는지 확인해 주세요.')
          }
        />
      </View>
      <Text className="text-xs leading-4 text-subtle">{REGION_DATA_CREDIT}</Text>
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
      <RegionSection />
      <EmbeddingSection />
      <Text className="text-sm leading-5 text-subtle">
        심사 방식(AI 먼저 / 관리자 직접 승인)은 "신규회원 심사"와 "사진수정 심사" 탭의 오른쪽 위에서 각각 바꿀
        수 있어요. 설정 변경은 관리자 작업 기록에 남습니다.
      </Text>
    </View>
  );
}
