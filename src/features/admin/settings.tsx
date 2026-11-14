import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';

import { ActionButton, Card, ListState, useActionError } from './parts';

type SelfieMode = 'manual' | 'auto';

type AdminSettings = {
  selfie_verification: { mode: SelfieMode; auto_approve_threshold: number };
  face_compare: { available: boolean };
};

const key = ['admin', 'settings'] as const;

const MODES: { value: SelfieMode; title: string; description: string }[] = [
  {
    value: 'manual',
    title: '관리자 직접 비교',
    description: '모든 셀카가 심사 대기열로 오고, 관리자가 프로필 사진과 눈으로 비교해 승인·반려합니다.',
  },
  {
    value: 'auto',
    title: '자동 얼굴 비교',
    description:
      '셀카를 프로필 사진과 자동으로 비교해, 일치도가 기준 이상이면 바로 승인합니다. 기준에 못 미치면 반려하지 않고 관리자 대기열로 보냅니다.',
  },
];

const STEP = 0.05;
const clamp = (value: number) => Math.min(0.95, Math.max(0.5, Math.round(value * 100) / 100));

/** 관리자 > 설정: 셀카 얼굴 일치 검증을 어떤 방식으로 운영할지 고릅니다. */
export function AdminSettingsSection() {
  const settings = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_settings');
      if (error) throw error;
      return data as AdminSettings;
    },
  });
  const saved = settings.data?.selfie_verification;
  const faceReady = settings.data?.face_compare.available ?? false;

  const [mode, setMode] = useState<SelfieMode>('manual');
  const [threshold, setThreshold] = useState(0.8);
  const [done, setDone] = useState(false);
  const { error, run } = useActionError();

  // 서버 값이 도착하면(또는 저장 후 바뀌면) 화면 값을 맞춥니다.
  useEffect(() => {
    if (saved) {
      setMode(saved.mode);
      setThreshold(saved.auto_approve_threshold);
    }
  }, [saved]);

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

  const changed = saved && (saved.mode !== mode || saved.auto_approve_threshold !== threshold);

  const save = () =>
    run(async () => {
      setDone(false);
      const { error: rpcError } = await supabase.rpc('admin_update_selfie_settings', {
        p_mode: mode,
        p_threshold: threshold,
      });
      if (rpcError) throw rpcError;
      await queryClient.invalidateQueries({ queryKey: key });
      setDone(true);
    }, '저장하지 못했어요. 잠시 후 다시 시도해 주세요.');

  return (
    <View className="gap-3">
      <Card>
        <Text className="text-base font-semibold text-fg">셀카 얼굴 일치 검증 방식</Text>
        <View accessibilityRole="radiogroup" className="gap-2">
          {MODES.map((item) => {
            const selected = mode === item.value;
            const locked = item.value === 'auto' && !faceReady;
            return (
              <Pressable
                key={item.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected, disabled: locked }}
                aria-checked={selected}
                aria-disabled={locked}
                accessibilityLabel={item.title}
                disabled={locked}
                onPress={() => {
                  setMode(item.value);
                  setDone(false);
                }}
                className={`gap-1 rounded-2xl border px-4 py-3 ${selected ? 'border-brand-500 bg-brand-50' : 'border-line bg-card'} ${locked ? 'opacity-50' : ''}`}>
                <Text className={`text-base font-semibold ${selected ? 'text-brand-600' : 'text-fg'}`}>
                  {item.title}
                </Text>
                <Text className="text-sm leading-5 text-muted">{item.description}</Text>
                {locked ? (
                  <Text className="text-sm font-semibold text-red-600">
                    얼굴 비교 API 가 아직 연결되지 않아 선택할 수 없습니다.
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card>
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1 gap-1">
            <Text className="text-base font-semibold text-fg">자동 승인 기준 (일치도)</Text>
            <Text className="text-sm leading-5 text-muted">
              자동 얼굴 비교에서 이 값 이상이면 승인합니다. 높을수록 엄격합니다.
              {mode === 'manual' ? ' 직접 비교 방식에서는 사용되지 않습니다.' : ''}
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            <ActionButton
              title="−"
              onPress={() => {
                setThreshold(clamp(threshold - STEP));
                setDone(false);
              }}
            />
            <Text
              accessibilityLabel={`자동 승인 기준 ${Math.round(threshold * 100)}퍼센트`}
              className="w-14 text-center text-lg font-bold text-fg">
              {Math.round(threshold * 100)}%
            </Text>
            <ActionButton
              title="+"
              onPress={() => {
                setThreshold(clamp(threshold + STEP));
                setDone(false);
              }}
            />
          </View>
        </View>
      </Card>

      {error ? <Text className="text-sm text-red-600">{error}</Text> : null}
      {done ? <Text className="text-sm text-emerald-600">저장했어요.</Text> : null}
      <View className="flex-row justify-end">
        <ActionButton title="설정 저장" tone="primary" disabled={!changed} onPress={save} />
      </View>
      <Text className="text-sm leading-5 text-subtle">
        어느 방식이든 셀카는 판정 즉시 영구 삭제되며, 얼굴 특징값은 저장하지 않습니다. 설정 변경은 관리자 작업
        기록에 남습니다.
      </Text>
    </View>
  );
}
