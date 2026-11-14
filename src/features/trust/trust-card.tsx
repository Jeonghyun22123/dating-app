import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Text, View } from 'react-native';

import { supabase } from '@/lib/supabase';
import { useThemeColors } from '@/theme/theme-view';

type TrustItemKey = 'selfie' | 'adult' | 'photos' | 'bio' | 'tenure';

type TrustBreakdown = {
  score: number;
  level: 'high' | 'verified' | null;
  max_score: number;
  /** 관리자가 조치 완료한 신고로 깎인 점수 합계 */
  penalty: number;
  items: { key: TrustItemKey; points: number; earned: boolean }[];
};

const ITEM_LABEL: Record<TrustItemKey, { title: string; how: string }> = {
  selfie: { title: '셀카 본인 인증', how: '실시간 셀카가 승인되면 받아요' },
  adult: { title: '성인 본인인증', how: '휴대폰 본인인증 도입 후 받을 수 있어요 (준비 중)' },
  photos: { title: '프로필 사진 3장 이상', how: '검수를 통과한 사진이 3장 이상이면 받아요' },
  bio: { title: '자기소개 50자 이상', how: '자기소개를 조금 더 자세히 적어보세요' },
  tenure: { title: '성실 이용', how: '가입 30일이 지나고 조치된 신고가 없으면 받아요' },
};

const LEVEL_LABEL = { high: '신뢰 높음', verified: '본인 인증' } as const;

export function useTrustBreakdown(userId: string | undefined) {
  return useQuery({
    queryKey: ['trust', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_trust_breakdown');
      if (error) throw error;
      return data as TrustBreakdown | null;
    },
  });
}

/**
 * 내 신뢰 점수와 올리는 방법. 점수는 서버가 자동으로 계산하며 본인만 숫자를 볼 수 있습니다.
 * (다른 사람에게는 "신뢰 높음" / "본인 인증" 배지로만 보입니다)
 */
export function TrustCard({ userId }: { userId: string }) {
  const colors = useThemeColors();
  const { data } = useTrustBreakdown(userId);
  // 점수를 불러오지 못했거나 형식이 예상과 다르면 카드를 그리지 않습니다 (프로필 화면은 그대로 보이도록).
  if (!data || typeof data.score !== 'number' || !Array.isArray(data.items)) return null;

  return (
    <View className="gap-4 rounded-3xl bg-card p-5">
      <View className="flex-row items-end justify-between">
        <View className="gap-1">
          <Text className="text-sm font-semibold text-muted">신뢰 점수</Text>
          <View className="flex-row items-baseline gap-1">
            <Text accessibilityLabel={`신뢰 점수 ${data.score.toFixed(1)}점`} className="text-4xl font-bold text-fg">
              {data.score.toFixed(1)}
            </Text>
            <Text className="text-base text-subtle">/ {data.max_score.toFixed(1)}</Text>
          </View>
        </View>
        {data.level ? (
          <View className="rounded-full bg-brand-50 px-3 py-1.5">
            <Text className="text-sm font-semibold text-brand-600">{LEVEL_LABEL[data.level]} 배지</Text>
          </View>
        ) : null}
      </View>

      <View className="gap-3">
        {data.items.map((item) => (
          <View key={item.key} className="flex-row items-start gap-3">
            <Ionicons
              name={item.earned ? 'checkmark-circle' : 'ellipse-outline'}
              size={22}
              color={item.earned ? colors.brand : colors.subtle}
            />
            <View className="flex-1">
              <Text className={`text-base ${item.earned ? 'font-semibold text-fg' : 'text-muted'}`}>
                {ITEM_LABEL[item.key].title}
              </Text>
              {item.earned ? null : <Text className="text-sm text-subtle">{ITEM_LABEL[item.key].how}</Text>}
            </View>
            <Text className={`text-base ${item.earned ? 'font-semibold text-brand-600' : 'text-subtle'}`}>
              +{item.points.toFixed(1)}
            </Text>
          </View>
        ))}
        {data.penalty > 0 ? (
          <View className="flex-row items-start gap-3">
            <Ionicons name="alert-circle" size={22} color="#dc2626" />
            <Text className="flex-1 text-base text-fg">운영 정책 위반으로 조치된 신고</Text>
            <Text className="text-base font-semibold text-red-600">-{data.penalty.toFixed(1)}</Text>
          </View>
        ) : null}
      </View>

      <Text className="text-sm leading-5 text-subtle">
        3.0점 이상이면 "신뢰 높음", 2.0점 이상이면 "본인 인증" 배지가 프로필에 표시돼요. 점수 숫자는 나에게만 보여요.
      </Text>
    </View>
  );
}
