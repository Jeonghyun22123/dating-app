import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemeView, useThemeColors } from '@/theme/theme-view';

import {
  fullName,
  getCurrentCoords,
  LocationPermissionError,
  regionAt,
  useRegionList,
  type Coords,
  type Region,
} from './api';

const normalize = (text: string) => text.replace(/\s+/g, '');

type Props = {
  visible: boolean;
  onClose: () => void;
  /** 동네를 고르면 호출. 현재 위치로 찾은 경우 그 좌표도 함께 넘겨 다시 위치를 묻지 않게 합니다. */
  onSelect: (region: Region, coords?: Coords) => void;
};

/**
 * 동네 선택 팝업: 시·도 → 시·군·구 → 읍·면·동 순서로 고르거나, 이름으로 검색하거나, 현재 위치로 찾습니다.
 */
export function RegionPicker({ visible, onClose, onSelect }: Props) {
  const colors = useThemeColors();
  const regions = useRegionList();
  const [query, setQuery] = useState('');
  const [sido, setSido] = useState<string | null>(null);
  const [sigungu, setSigungu] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = useMemo(() => regions.data ?? [], [regions.data]);
  const term = normalize(query);

  // 검색어가 있으면 검색 결과, 없으면 지금 단계의 목록
  const items: { key: string; label: string; sub?: string; onPress: () => void }[] = useMemo(() => {
    if (term) {
      return list
        .filter((r) => normalize(fullName(r)).includes(term))
        .slice(0, 80)
        .map((r) => ({
          key: r.code,
          label: r.dong,
          sub: `${r.sido} ${r.sigungu}`,
          onPress: () => onSelect(r),
        }));
    }
    if (!sido) {
      return [...new Set(list.map((r) => r.sido))].map((name) => ({
        key: name,
        label: name,
        onPress: () => setSido(name),
      }));
    }
    if (!sigungu) {
      return [...new Set(list.filter((r) => r.sido === sido).map((r) => r.sigungu))].map((name) => ({
        key: name,
        label: name,
        onPress: () => setSigungu(name),
      }));
    }
    return list
      .filter((r) => r.sido === sido && r.sigungu === sigungu)
      .sort((a, b) => a.dong.localeCompare(b.dong, 'ko'))
      .map((r) => ({ key: r.code, label: r.dong, onPress: () => onSelect(r) }));
  }, [list, term, sido, sigungu, onSelect]);

  const step = term ? '검색 결과' : !sido ? '시·도' : !sigungu ? '시·군·구' : '읍·면·동';
  const goUp = () => (sigungu ? setSigungu(null) : setSido(null));

  async function findHere() {
    setError(null);
    setLocating(true);
    try {
      const coords = await getCurrentCoords();
      const found = await regionAt(coords);
      if (!found) {
        setError('지금 위치에서 동네를 찾지 못했어요. 목록에서 직접 골라 주세요.');
        return;
      }
      onSelect(found, coords);
    } catch (e) {
      setError(
        e instanceof LocationPermissionError
          ? '위치 권한이 필요해요. 기기 또는 브라우저 설정에서 위치 접근을 허용해 주세요.'
          : '현재 위치를 가져오지 못했어요. 목록에서 직접 골라 주세요.',
      );
    } finally {
      setLocating(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ThemeView className="flex-1 bg-bg">
        <SafeAreaView className="flex-1">
          <View className="w-full max-w-md flex-1 gap-3 self-center px-5 pt-3">
            <View className="flex-row items-center justify-between">
              <Text className="text-2xl font-bold text-fg">동네 선택</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="닫기" hitSlop={10} onPress={onClose}>
                <Ionicons name="close" size={28} color={colors.fg} />
              </Pressable>
            </View>

            <View className="flex-row items-center gap-2 rounded-2xl bg-field px-4">
              <Ionicons name="search" size={18} color={colors.subtle} />
              <TextInput
                accessibilityLabel="동네 이름 검색"
                className="h-12 flex-1 text-base text-fg"
                placeholder="동네 이름으로 검색 (예: 성수)"
                placeholderTextColor={colors.subtle}
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
              />
            </View>

            <Pressable
              accessibilityRole="button"
              disabled={locating}
              onPress={findHere}
              className="flex-row items-center justify-center gap-2 rounded-2xl border border-line bg-card py-3 active:bg-field">
              {locating ? (
                <ActivityIndicator color={colors.brand} />
              ) : (
                <Ionicons name="locate" size={18} color={colors.brand} />
              )}
              <Text className="text-base font-semibold text-brand-600">현재 위치로 찾기</Text>
            </Pressable>
            {error ? <Text className="text-sm text-red-600">{error}</Text> : null}

            <View className="flex-row items-center gap-2">
              {!term && sido ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="이전 단계"
                  hitSlop={8}
                  onPress={goUp}>
                  <Ionicons name="chevron-back" size={22} color={colors.fg} />
                </Pressable>
              ) : null}
              <Text className="text-sm font-semibold text-muted">
                {!term && sido ? `${sido}${sigungu ? ` › ${sigungu}` : ''} · ` : ''}
                {step}
              </Text>
            </View>

            {regions.isPending ? (
              <ActivityIndicator className="mt-10" color={colors.brand} />
            ) : regions.isError ? (
              <Text className="mt-10 text-center text-base text-muted">동네 목록을 불러오지 못했어요.</Text>
            ) : list.length === 0 ? (
              <Text className="mt-10 text-center text-base leading-6 text-muted">
                동네 데이터가 아직 준비되지 않았어요.{'\n'}관리자에게 문의해 주세요.
              </Text>
            ) : (
              <FlatList
                data={items}
                keyExtractor={(item) => item.key}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  <Text className="mt-10 text-center text-base text-muted">검색 결과가 없어요.</Text>
                }
                renderItem={({ item }) => (
                  <Pressable
                    accessibilityRole="button"
                    onPress={item.onPress}
                    className="flex-row items-center justify-between border-b border-line py-3.5 active:bg-field">
                    <View className="flex-1">
                      <Text className="text-base text-fg">{item.label}</Text>
                      {item.sub ? <Text className="text-sm text-muted">{item.sub}</Text> : null}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.subtle} />
                  </Pressable>
                )}
              />
            )}
          </View>
        </SafeAreaView>
      </ThemeView>
    </Modal>
  );
}
