import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { ErrorText, Screen } from '@/components/ui/screen';
import {
  fullName,
  getCurrentCoords,
  LocationPermissionError,
  setMyRegion,
  type Coords,
  type Region,
} from '@/features/location/api';
import { RegionPicker } from '@/features/location/region-picker';
import { useMyProfile } from '@/features/profile/api';
import { useThemeColors } from '@/theme/theme-view';

/** 현재 위치로 찾은 좌표는 잠깐 동안 다시 쓰고, 그 뒤에는 새로 확인합니다. */
const COORDS_FRESH_MS = 2 * 60 * 1000;

/**
 * 동네 설정: 동네를 먼저 고르고, 현재 위치로 인증해야 저장됩니다.
 * 저장되는 위치는 GPS 좌표가 아니라 고른 동네의 중심점이라, 회원의 실제 위치는 어디에도 남지 않습니다.
 */
export function LocationStep({
  userId,
  progress,
  onDone,
  onBack,
}: {
  userId: string;
  progress?: string;
  /** 저장 후 호출 (프로필 수정에서 화면을 닫는 용도) */
  onDone?: () => void;
  onBack?: () => void;
}) {
  const colors = useThemeColors();
  const { data: profile } = useMyProfile();
  const isAdmin = profile?.role === 'admin';
  const [region, setRegion] = useState<Region | null>(null);
  const [coords, setCoords] = useState<{ value: Coords; at: number } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState<'verify' | 'admin' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = useCallback((next: Region, found?: Coords) => {
    setRegion(next);
    if (found) setCoords({ value: found, at: Date.now() });
    setError(null);
    setPickerOpen(false);
  }, []);

  async function save(skipVerify: boolean) {
    if (!region) return setError('먼저 동네를 선택해 주세요.');
    setError(null);
    setSaving(skipVerify ? 'admin' : 'verify');
    try {
      let position: Coords | undefined;
      if (!skipVerify) {
        position =
          coords && Date.now() - coords.at < COORDS_FRESH_MS ? coords.value : await getCurrentCoords();
      }
      await setMyRegion(userId, region.code, position);
      onDone?.();
    } catch (e) {
      const message = (e as { message?: string }).message;
      setError(
        e instanceof LocationPermissionError
          ? '위치 권한이 필요해요. 기기 또는 브라우저 설정에서 위치 접근을 허용해 주세요.'
          : message && /[가-힣]/.test(message)
            ? message
            : '동네를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.',
      );
      // 위치가 달랐다면 다음 시도에서 새로 확인하도록 저장해 둔 좌표를 버립니다.
      setCoords(null);
    } finally {
      setSaving(null);
    }
  }

  return (
    <Screen
      progress={progress}
      title="어느 동네에 계신가요?"
      onBack={onBack}
      subtitle="동네를 고른 뒤 현재 위치로 인증하면 저장돼요. 정확한 위치는 저장하지 않고, 동네의 중심 위치로 거리를 계산해요."
      footer={
        <>
          <ErrorText>{error}</ErrorText>
          <Button
            title="현재 위치로 인증하고 저장"
            onPress={() => save(false)}
            loading={saving === 'verify'}
            disabled={!region || saving !== null}
          />
          {isAdmin ? (
            <Button
              title="위치 인증 없이 저장 (관리자 테스트용)"
              variant="secondary"
              onPress={() => save(true)}
              loading={saving === 'admin'}
              disabled={!region || saving !== null}
            />
          ) : null}
        </>
      }>
      <View className="gap-2">
        <Text className="text-sm font-medium text-muted">동네</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={region ? `선택한 동네 ${fullName(region)}, 바꾸기` : '동네 선택하기'}
          onPress={() => setPickerOpen(true)}
          className="flex-row items-center gap-3 rounded-2xl border border-line bg-card px-4 py-4 active:bg-field">
          <Ionicons name="location" size={22} color={region ? colors.brand : colors.subtle} />
          <View className="flex-1">
            {region ? (
              <>
                <Text className="text-lg font-semibold text-fg">{region.dong}</Text>
                <Text className="text-sm text-muted">
                  {region.sido} {region.sigungu}
                </Text>
              </>
            ) : (
              <Text className="text-base text-muted">동네를 선택해 주세요</Text>
            )}
          </View>
          <Text className="text-sm font-semibold text-brand-600">{region ? '바꾸기' : '선택'}</Text>
        </Pressable>
        {profile?.neighborhood_name && !region ? (
          <Text className="text-sm text-muted">지금 설정된 동네: {profile.neighborhood_name}</Text>
        ) : null}
      </View>

      <Text className="text-sm leading-5 text-subtle">
        고른 동네 안이나 바로 붙어 있는 이웃 동네에 있을 때 인증돼요. 위치 확인에 쓴 좌표는 저장하지 않아요.
      </Text>

      <RegionPicker visible={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={handleSelect} />
    </Screen>
  );
}
