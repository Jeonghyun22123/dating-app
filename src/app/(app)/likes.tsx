import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { matchesKey } from '@/features/chat/api';
import { swipeProfile } from '@/features/discover/api';
import { dropReceivedLike, useReceivedLikes, type ReceivedLike } from '@/features/likes/api';
import { PURPOSES } from '@/features/profile/constants';
import { useWallet } from '@/features/wallet/api';
import { queryClient } from '@/lib/query-client';
import { useThemeColors } from '@/theme/theme-view';

function LikeRow({ like }: { like: ReceivedLike }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'like' | 'pass' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const purpose = PURPOSES.find((item) => item.value === like.purpose)?.label;

  async function answer(action: 'like' | 'pass') {
    setError(null);
    setBusy(action);
    try {
      // 먼저 관심을 보낸 사람에게 답하는 것이라 하루 둘러보기 횟수를 쓰지 않습니다.
      const matchId = await swipeProfile(like.id, action);
      dropReceivedLike(like.id);
      if (matchId) {
        await queryClient.invalidateQueries({ queryKey: matchesKey });
        router.push(`/chat/${matchId}`);
      }
    } catch {
      setError('처리하지 못했어요. 잠시 후 다시 시도해 주세요.');
      setBusy(null);
    }
  }

  return (
    <View className="gap-3 rounded-2xl border border-line bg-card p-4">
      <View className="flex-row items-center gap-3">
        <Avatar url={like.photoUrl} name={like.nickname} size={52} />
        <View className="flex-1">
          <Text className="text-base font-semibold text-fg">
            {like.nickname}, {like.age}
          </Text>
          <Text className="text-sm text-muted">
            {like.neighborhood_name} · {purpose}
          </Text>
        </View>
      </View>
      {error ? <Text className="text-sm text-red-600">{error}</Text> : null}
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button
            title="다음에"
            variant="secondary"
            onPress={() => answer('pass')}
            loading={busy === 'pass'}
            disabled={busy !== null}
          />
        </View>
        <View className="flex-[2]">
          <Button
            title="관심 있어요 (바로 연결)"
            onPress={() => answer('like')}
            loading={busy === 'like'}
            disabled={busy !== null}
          />
        </View>
      </View>
    </View>
  );
}

/** 받은 관심 명단 (프리미엄 회원 전용) */
export default function LikesScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { data: wallet } = useWallet();
  const premium = !!wallet?.premium;
  const likes = useReceivedLikes(premium);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/matches'));

  return (
    <Screen title="받은 관심" subtitle="관심 있어요를 누르면 바로 대화가 연결돼요." onBack={back}>
      {!premium ? (
        <Text className="text-base text-muted">프리미엄 회원만 볼 수 있어요.</Text>
      ) : likes.isPending ? (
        <ActivityIndicator color={colors.brand} />
      ) : likes.isError ? (
        <Text className="text-base text-muted">불러오지 못했어요. 잠시 후 다시 시도해 주세요.</Text>
      ) : likes.data.length === 0 ? (
        <Text className="text-base text-muted">새로 받은 관심이 없어요.</Text>
      ) : (
        likes.data.map((like) => <LikeRow key={like.id} like={like} />)
      )}
    </Screen>
  );
}
