import * as Location from 'expo-location';
import { useState } from 'react';
import { Platform, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { ErrorText, Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { refreshMyProfile, saveLocation } from '@/features/profile/api';
import { LIMITS } from '@/features/profile/constants';

type Coords = { latitude: number; longitude: number };

export function LocationStep({ userId, progress }: { userId: string; progress: string }) {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [neighborhood, setNeighborhood] = useState('');
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLocate() {
    setError(null);
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setError('위치 권한이 필요해요. 기기 또는 브라우저 설정에서 위치 접근을 허용해 주세요.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const next = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setCoords(next);

      // 네이티브에서는 동네 이름을 자동으로 채워 봅니다 (웹은 지원하지 않아 직접 입력).
      if (Platform.OS !== 'web' && !neighborhood) {
        try {
          const [place] = await Location.reverseGeocodeAsync(next);
          const name = place?.district ?? place?.subregion ?? place?.city ?? '';
          if (name) setNeighborhood(name.slice(0, LIMITS.neighborhoodMax));
        } catch {
          // 자동 채우기 실패는 무시하고 직접 입력받습니다.
        }
      }
    } catch {
      setError('현재 위치를 가져오지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLocating(false);
    }
  }

  async function handleSave() {
    if (!coords) return setError('먼저 현재 위치를 확인해 주세요.');
    if (!neighborhood.trim()) return setError('동네 이름을 입력해 주세요.');
    setError(null);
    setSaving(true);
    try {
      await saveLocation(userId, coords, neighborhood);
      await refreshMyProfile(userId);
    } catch {
      setError('위치를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      progress={progress}
      title="어느 동네에 계신가요?"
      subtitle="가까운 사람을 추천하는 데 사용해요. 정확한 위치는 다른 사람에게 공개되지 않고, 대략적인 거리만 보여요."
      footer={
        <>
          <ErrorText>{error}</ErrorText>
          <Button title="저장하고 계속" onPress={handleSave} loading={saving} disabled={!coords} />
        </>
      }>
      <View className="gap-3">
        <Button
          title={coords ? '현재 위치 다시 확인' : '현재 위치 확인하기'}
          variant="secondary"
          onPress={handleLocate}
          loading={locating}
        />
        {coords ? <Text className="text-sm text-emerald-600">현재 위치를 확인했어요.</Text> : null}
      </View>
      <TextField
        label="동네 이름"
        value={neighborhood}
        onChangeText={setNeighborhood}
        placeholder="예: 성수동, 연남동"
        maxLength={LIMITS.neighborhoodMax}
        hint="프로필에 표시되는 이름이에요."
      />
    </Screen>
  );
}
