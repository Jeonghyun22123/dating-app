import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { useWallet } from '@/features/wallet/api';
import { useThemeColors } from '@/theme/theme-view';

import { useReceivedLikesCount } from './api';

/**
 * 채팅 탭 위쪽의 "나에게 관심을 보낸 사람" 카드.
 * 무료 회원: 인원수와 흐린 자리만 (누구인지는 서버가 보내지 않음) / 프리미엄 회원: 눌러서 명단 보기
 */
export function LikesTeaser() {
  const router = useRouter();
  const colors = useThemeColors();
  const { data: count } = useReceivedLikesCount();
  const { data: wallet } = useWallet();
  if (!count) return null;

  const premium = !!wallet?.premium;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`나에게 관심을 보낸 사람 ${count}명`}
      disabled={!premium}
      onPress={() => router.push('/likes')}
      className="gap-3 rounded-2xl border border-brand-300 bg-card p-4 active:bg-field">
      <View className="flex-row items-center gap-3">
        <View className="flex-row">
          {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
            <View
              key={i}
              style={{ marginLeft: i === 0 ? 0 : -12 }}
              className="h-11 w-11 items-center justify-center rounded-full border-2 border-card bg-brand-100">
              <Ionicons name="heart" size={18} color={colors.brand} />
            </View>
          ))}
        </View>
        <View className="flex-1">
          <Text className="text-base font-semibold text-fg">나에게 관심을 보낸 사람 {count}명</Text>
          <Text className="text-sm text-muted">
            {premium
              ? '눌러서 누구인지 확인하고 바로 연결해 보세요.'
              : '둘러보기에서 만나면 서로 연결될 수 있어요.'}
          </Text>
        </View>
        {premium ? <Ionicons name="chevron-forward" size={20} color={colors.subtle} /> : null}
      </View>
      {!premium ? (
        <Text className="text-sm leading-5 text-subtle">
          프리미엄 회원은 관심을 보낸 사람을 바로 확인할 수 있어요 (준비 중).
        </Text>
      ) : null}
    </Pressable>
  );
}
