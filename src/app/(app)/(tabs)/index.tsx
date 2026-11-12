import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { ErrorText, Screen } from '@/components/ui/screen';
import {
  DISTANCE_OPTIONS,
  removeFromDiscover,
  swipeProfile,
  useDiscover,
  type DiscoverProfile,
  type DistanceKm,
} from '@/features/discover/api';
import { useMyProfile } from '@/features/profile/api';
import { PURPOSES } from '@/features/profile/constants';
import { SafetySheet } from '@/features/safety/safety-sheet';
import { AnalyticsEvent, track } from '@/lib/analytics';

function ProfileCard({
  profile,
  myHobbies,
  onOpenSafety,
}: {
  profile: DiscoverProfile;
  myHobbies: string[];
  onOpenSafety: () => void;
}) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const photos = profile.photoUrls;
  const purpose = PURPOSES.find((item) => item.value === profile.purpose)?.label;
  const index = Math.min(photoIndex, Math.max(photos.length - 1, 0));

  return (
    <View className="overflow-hidden rounded-3xl bg-white">
      <View className="aspect-[4/5] w-full bg-brand-100">
        {photos.length > 0 ? (
          <Image source={{ uri: photos[index] }} style={{ flex: 1 }} contentFit="cover" />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Text className="text-8xl font-bold text-brand-300">{profile.nickname.slice(0, 1)}</Text>
          </View>
        )}

        {photos.length > 1 ? (
          <>
            {/* 사진 좌우 영역을 눌러 이전/다음 사진으로 이동 */}
            <View className="absolute inset-0 flex-row">
              <Pressable
                accessibilityLabel="이전 사진"
                className="flex-1"
                onPress={() => setPhotoIndex(Math.max(index - 1, 0))}
              />
              <Pressable
                accessibilityLabel="다음 사진"
                className="flex-1"
                onPress={() => setPhotoIndex(Math.min(index + 1, photos.length - 1))}
              />
            </View>
            <View className="absolute left-3 right-3 top-3 flex-row gap-1">
              {photos.map((url, i) => (
                <View key={url} className={`h-1 flex-1 rounded-full ${i === index ? 'bg-white' : 'bg-white/40'}`} />
              ))}
            </View>
          </>
        ) : null}
      </View>

      <View className="gap-3 p-5">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-1">
            <Text className="text-2xl font-bold text-neutral-900">
              {profile.nickname}, {profile.age}
            </Text>
            <Text className="text-base text-neutral-600">
              {profile.neighborhood_name} · 약 {profile.distance_km}km
            </Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="신고 또는 차단" hitSlop={8} onPress={onOpenSafety}>
            <Text className="text-sm text-neutral-400">신고·차단</Text>
          </Pressable>
        </View>

        <View className="flex-row flex-wrap gap-2">
          <View className="rounded-full bg-neutral-900 px-3 py-1">
            <Text className="text-sm font-medium text-white">{purpose}</Text>
          </View>
          {profile.verification_status === 'approved' ? (
            <View className="rounded-full bg-emerald-50 px-3 py-1">
              <Text className="text-sm font-medium text-emerald-700">본인 인증</Text>
            </View>
          ) : null}
        </View>

        {profile.bio ? <Text className="text-base leading-6 text-neutral-800">{profile.bio}</Text> : null}

        <View className="flex-row flex-wrap gap-2">
          {profile.hobbies.map((hobby) => {
            const shared = myHobbies.includes(hobby);
            return (
              <View key={hobby} className={`rounded-full px-3 py-1 ${shared ? 'bg-brand-500' : 'bg-brand-50'}`}>
                <Text className={`text-sm ${shared ? 'font-semibold text-white' : 'text-brand-700'}`}>{hobby}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

export default function DiscoverScreen() {
  const router = useRouter();
  const { data: me } = useMyProfile();
  const [maxKm, setMaxKm] = useState<DistanceKm>(30);
  const discover = useDiscover(maxKm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [matched, setMatched] = useState<{ matchId: string; nickname: string } | null>(null);

  const current = discover.data?.[0];

  async function handleSwipe(action: 'like' | 'pass') {
    if (!current || busy) return;
    setError(null);
    setBusy(true);
    try {
      const matchId = await swipeProfile(current.id, action);
      track(action === 'like' ? AnalyticsEvent.SwipeLike : AnalyticsEvent.SwipePass);
      removeFromDiscover(maxKm, current.id);
      if (matchId) {
        track(AnalyticsEvent.MatchCreated);
        setMatched({ matchId, nickname: current.nickname });
      }
    } catch {
      setError('처리하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title="둘러보기"
      footer={
        current ? (
          <>
            <ErrorText>{error}</ErrorText>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Button title="다음에" variant="secondary" onPress={() => handleSwipe('pass')} disabled={busy} />
              </View>
              <View className="flex-1">
                <Button title="관심 있어요" onPress={() => handleSwipe('like')} disabled={busy} />
              </View>
            </View>
          </>
        ) : undefined
      }>
      <View className="flex-row gap-2">
        {DISTANCE_OPTIONS.map((km) => (
          <Chip key={km} label={`${km}km 이내`} selected={maxKm === km} onPress={() => setMaxKm(km)} />
        ))}
      </View>

      {discover.isPending ? (
        <View className="items-center py-24">
          <ActivityIndicator size="large" color="#f43f5e" />
        </View>
      ) : discover.isError ? (
        <View className="gap-4 py-16">
          <Text className="text-center text-base text-neutral-600">추천을 불러오지 못했어요.</Text>
          <Button title="다시 시도" variant="secondary" onPress={() => discover.refetch()} />
        </View>
      ) : current ? (
        // key 를 주어 카드가 바뀔 때 사진 위치 등 내부 상태를 초기화합니다.
        <ProfileCard
          key={current.id}
          profile={current}
          myHobbies={me?.hobbies ?? []}
          onOpenSafety={() => setSafetyOpen(true)}
        />
      ) : (
        <View className="gap-4 py-16">
          <Text className="text-center text-xl font-bold text-neutral-900">근처의 새로운 사람을 모두 봤어요</Text>
          <Text className="text-center text-base leading-6 text-neutral-600">
            거리 범위를 넓히거나 잠시 후 다시 확인해 보세요.
          </Text>
          <Button
            title="새로고침"
            variant="secondary"
            onPress={() => discover.refetch()}
            loading={discover.isRefetching}
          />
        </View>
      )}

      {me && current ? (
        <SafetySheet
          visible={safetyOpen}
          onClose={() => setSafetyOpen(false)}
          myId={me.id}
          target={current}
          onRemoved={() => removeFromDiscover(maxKm, current.id)}
        />
      ) : null}

      <Modal visible={!!matched} transparent animationType="fade" onRequestClose={() => setMatched(null)}>
        <View className="flex-1 items-center justify-center bg-black/60 px-6">
          <View className="w-full max-w-sm gap-4 rounded-3xl bg-white p-6">
            <Text className="text-center text-2xl font-bold text-brand-600">서로 관심을 보였어요</Text>
            <Text className="text-center text-base leading-6 text-neutral-600">
              {matched?.nickname}님과 연결되었어요. 먼저 인사를 건네보세요.
            </Text>
            <Button
              title="대화 시작하기"
              onPress={() => {
                const matchId = matched?.matchId;
                setMatched(null);
                if (matchId) router.push(`/chat/${matchId}`);
              }}
            />
            <Button title="계속 둘러보기" variant="ghost" onPress={() => setMatched(null)} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
