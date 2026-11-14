import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  makeMutable,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { refreshDiscover, swipeProfile, useDiscover, type DiscoverProfile } from '@/features/discover/api';
import { DeckCard, type DeckAction } from '@/features/discover/deck-card';
import { photoSource } from '@/features/photos/api';
import { useMyProfile } from '@/features/profile/api';
import { PURPOSES } from '@/features/profile/constants';
import { SafetySheet } from '@/features/safety/safety-sheet';
import { AnalyticsEvent, track } from '@/lib/analytics';
import { ThemeView, useThemeColors } from '@/theme/theme-view';

const MAX_HOBBIES = 5;
/** 뒤 카드가 맨 위로 올라온 뒤 완전히 선명해지기까지 걸리는 시간 (ms) */
const REVEAL_MS = 900;
/**
 * 가려진 카드의 사진 흐림 정도. 두 단계로 겹쳐 두고 차례로 걷어내서,
 * 흐린 사진이 "딱" 사라지는 대신 초점이 서서히 맞는 것처럼 보이게 합니다.
 *   진한 흐림: 얼굴은 물론 옷·배경도 알아보기 어려운 수준 (가려진 동안 보이는 모습)
 *   옅은 흐림: 공개되는 도중에만 잠깐 보이는 중간 단계
 */
const BLUR_HEAVY = 60;
const BLUR_LIGHT = 14;
/** 카드 전체를 덮는 층의 공통 위치 */
const COVER = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' } as const;
/** 사진 위 글자가 밝은 배경에서도 읽히도록 옅은 그림자를 줍니다. */
const shadow = {
  textShadowColor: 'rgba(0,0,0,0.45)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 4,
};

type CardProps = {
  profile: DiscoverProfile;
  myHobbies: string[];
  onOpenSafety: () => void;
  onPass: () => void;
  onLike: () => void;
  disabled?: boolean;
  /**
   * false 면 가려진 상태: 사진은 윤곽만 보이게 흐려지고 이름·소개 등 정보는 숨깁니다.
   * 앞 카드를 완전히 넘겨 이 카드가 맨 위가 된 뒤에야 true 가 되어 선명해집니다.
   */
  revealed: boolean;
};

/**
 * 화면을 꽉 채우는 프로필 카드. 사진이 배경이고 모든 정보와 버튼이 사진 위에 올라갑니다.
 * (세로 스크롤 없음 — 소개글은 3줄, 취미는 5개까지만 보여줍니다)
 */
function ProfileCard({ profile, myHobbies, onOpenSafety, onPass, onLike, disabled, revealed }: CardProps) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const photos = profile.photoUrls;
  const index = Math.min(photoIndex, Math.max(photos.length - 1, 0));
  const purpose = PURPOSES.find((item) => item.value === profile.purpose)?.label;
  // 나와 겹치는 취미를 앞에 보여줍니다.
  const hobbies = [...profile.hobbies].sort(
    (a, b) => Number(myHobbies.includes(b)) - Number(myHobbies.includes(a)),
  );
  const hidden = hobbies.length - MAX_HOBBIES;

  // 0 = 가려짐, 1 = 공개. 처음부터 맨 위인 카드는 애니메이션 없이 바로 공개 상태로 시작합니다.
  const reveal = useSharedValue(revealed ? 1 : 0);
  useEffect(() => {
    reveal.value = withTiming(revealed ? 1 : 0, {
      duration: REVEAL_MS,
      easing: Easing.inOut(Easing.quad),
    });
  }, [revealed, reveal]);
  // 공개 순서: 진한 흐림이 먼저 걷히고 → 옅은 흐림이 걷히며 초점이 맞고 → 그 사이 정보가 떠오릅니다.
  const heavyStyle = useAnimatedStyle(() => ({
    opacity: interpolate(reveal.value, [0, 0.6], [1, 0], 'clamp'),
  }));
  const lightStyle = useAnimatedStyle(() => ({
    opacity: interpolate(reveal.value, [0.3, 1], [1, 0], 'clamp'),
  }));
  const infoStyle = useAnimatedStyle(() => ({
    opacity: interpolate(reveal.value, [0.35, 1], [0, 1], 'clamp'),
  }));

  return (
    <View className="flex-1 overflow-hidden rounded-3xl bg-brand-100">
      {/* 배경 사진. 사진이 마우스·터치를 직접 받으면 웹 브라우저가 "이미지 끌어다 놓기"로
          가로채서 카드 밀기가 안 되므로 pointerEvents 를 끕니다. */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        {photos.length > 0 ? (
          <Image
            source={photoSource(photos[index])}
            style={{ flex: 1 }}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <Animated.View
            style={[
              {
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                paddingBottom: 160,
              },
              infoStyle,
            ]}>
            <Text className="text-9xl font-bold text-brand-300">{profile.nickname.slice(0, 1)}</Text>
          </Animated.View>
        )}
      </View>

      {/* 가림막: 같은 사진을 흐리게 한 것 두 장(옅은 것 위에 진한 것)을 선명한 사진 위에 덮어 둡니다.
          흐린 사진은 가장자리가 비치지 않도록 조금 키워서 그립니다. */}
      {photos.length > 0 ? (
        <Animated.View pointerEvents="none" style={[COVER, lightStyle]}>
          <Image
            source={photoSource(photos[0])}
            blurRadius={BLUR_LIGHT}
            style={{ flex: 1, transform: [{ scale: 1.1 }] }}
            contentFit="cover"
          />
        </Animated.View>
      ) : null}
      <Animated.View pointerEvents="none" testID="card-cover" style={[COVER, heavyStyle]}>
        {photos.length > 0 ? (
          <Image
            source={photoSource(photos[0])}
            blurRadius={BLUR_HEAVY}
            style={{ flex: 1, transform: [{ scale: 1.3 }] }}
            contentFit="cover"
          />
        ) : null}
        <View className="absolute inset-0 bg-black/25" />
      </Animated.View>

      {/* 사진 좌우를 눌러 이전/다음 사진으로 이동 */}
      {photos.length > 1 ? (
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
      ) : null}

      {/* 여기부터의 정보(위쪽 조작부, 아래쪽 프로필)는 가려진 동안 보이지 않습니다. */}
      <Animated.View
        pointerEvents="box-none"
        testID="card-info"
        style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, infoStyle]}>
        {/* 위쪽: 사진 위치 표시, 거리 범위, 신고·차단 */}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)']}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 110,
          }}
        />
        <View pointerEvents="box-none" className="absolute left-0 right-0 top-0 gap-3 p-3">
          {photos.length > 1 ? (
            <View pointerEvents="none" className="flex-row gap-1">
              {photos.map((url, i) => (
                <View
                  key={url}
                  className={`h-1 flex-1 rounded-full ${i === index ? 'bg-card' : 'bg-white/40'}`}
                />
              ))}
            </View>
          ) : null}
          <View pointerEvents="box-none" className="flex-row items-center justify-between">
            <View />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="신고 또는 차단"
              hitSlop={8}
              onPress={onOpenSafety}
              className="h-9 w-9 items-center justify-center rounded-full bg-black/35">
              <Ionicons name="ellipsis-horizontal" size={18} color="#ffffff" />
            </Pressable>
          </View>
        </View>

        {/* 아래쪽: 프로필 정보와 버튼 */}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.88)']}
          locations={[0, 0.45, 1]}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: '62%',
          }}
        />
        <View pointerEvents="box-none" className="absolute bottom-0 left-0 right-0 gap-2.5 p-4">
          <View pointerEvents="none" className="gap-2.5">
            <View className="flex-row flex-wrap items-center gap-2">
              <Text style={shadow} className="text-3xl font-bold text-white">
                {profile.nickname}, {profile.age}
              </Text>
              {profile.trust_level === 'high' ? (
                <View className="flex-row items-center gap-1 rounded-full bg-amber-400 px-2.5 py-1">
                  <Ionicons name="shield-checkmark" size={14} color="#422006" />
                  <Text className="text-xs font-semibold text-amber-950">신뢰 높음</Text>
                </View>
              ) : profile.verification_status === 'approved' ? (
                <View className="flex-row items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1">
                  <Ionicons name="checkmark-circle" size={14} color="#ffffff" />
                  <Text className="text-xs font-semibold text-white">본인 인증</Text>
                </View>
              ) : null}
            </View>

            <Text style={shadow} className="text-base text-white">
              {profile.neighborhood_name} · 약 {profile.distance_km}km · {purpose}
            </Text>

            {profile.bio ? (
              <Text style={shadow} numberOfLines={3} className="text-base leading-6 text-white/95">
                {profile.bio}
              </Text>
            ) : null}

            <View className="flex-row flex-wrap gap-1.5">
              {hobbies.slice(0, MAX_HOBBIES).map((hobby) => {
                const shared = myHobbies.includes(hobby);
                return (
                  <View
                    key={hobby}
                    className={`rounded-full px-3 py-1 ${shared ? 'bg-brand-500' : 'bg-white/25'}`}>
                    <Text className={`text-sm text-white ${shared ? 'font-semibold' : ''}`}>{hobby}</Text>
                  </View>
                );
              })}
              {hidden > 0 ? (
                <View className="rounded-full bg-white/25 px-3 py-1">
                  <Text className="text-sm text-white">+{hidden}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View className="mt-1 flex-row gap-3">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="다음에"
              disabled={disabled}
              onPress={onPass}
              className={`h-14 flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-white/95 active:bg-white/80 ${disabled ? 'opacity-50' : ''}`}>
              <Ionicons name="close" size={20} color="#404040" />
              <Text className="text-base font-semibold text-neutral-800">다음에</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="관심 있어요"
              disabled={disabled}
              onPress={onLike}
              className={`h-14 flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-brand-500 active:bg-brand-600 ${disabled ? 'opacity-50' : ''}`}>
              <Ionicons name="heart" size={20} color="#ffffff" />
              <Text className="text-base font-semibold text-white">관심 있어요</Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

/**
 * 이미 결정한(넘긴) 프로필 기록.
 *   'pending' = 서버에 저장하는 중, 숫자 = 저장이 끝난 시각(ms)
 * 추천 목록이 이 시각보다 "나중에" 요청된 것이면 서버가 이미 빼고 준 것이라 기록이 필요 없고,
 * 그보다 먼저 요청된 목록에는 아직 들어 있을 수 있어서 화면에서 가려 줍니다.
 */
type Handled = Record<string, 'pending' | number>;

export default function DiscoverScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { data: me } = useMyProfile();
  const discover = useDiscover();
  const [handled, setHandled] = useState<Handled>({});
  const [error, setError] = useState<string | null>(null);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [matched, setMatched] = useState<{
    matchId: string;
    nickname: string;
  } | null>(null);

  // 카드마다 가로 위치 값을 하나씩 만들어 보관합니다 (뒤 카드가 앞 카드의 움직임을 따라가는 데 사용).
  const positions = useRef(new Map<string, SharedValue<number>>());
  function positionOf(id: string) {
    let value = positions.current.get(id);
    if (!value) {
      value = makeMutable(0);
      positions.current.set(id, value);
    }
    return value;
  }

  const startedAt = discover.data?.startedAt ?? 0;
  const deck = (discover.data?.profiles ?? []).filter((profile) => {
    const state = handled[profile.id];
    return state === undefined || (state !== 'pending' && state < startedAt);
  });
  const current = deck[0];
  const next = deck[1];
  const myHobbies = me?.hobbies ?? [];

  /**
   * 카드가 날아간 직후 호출됩니다. 화면에서는 바로 다음 카드로 넘어가고, 저장은 뒤에서 합니다.
   * 저장에 실패하면 안내를 띄우고 그 카드를 다시 보여줍니다.
   */
  async function handleDecide(profile: DiscoverProfile, action: DeckAction) {
    setError(null);
    setHandled((state) => ({ ...state, [profile.id]: 'pending' }));
    const remaining = deck.length - 1;
    try {
      const matchId = await swipeProfile(profile.id, action);
      track(action === 'like' ? AnalyticsEvent.SwipeLike : AnalyticsEvent.SwipePass);
      setHandled((state) => ({ ...state, [profile.id]: Date.now() }));
      if (matchId) {
        track(AnalyticsEvent.MatchCreated);
        setMatched({ matchId, nickname: profile.nickname });
      }
      // 남은 카드가 적으면 새로 받아옵니다 (저장이 끝난 뒤라서 방금 넘긴 사람은 빠져서 옵니다).
      if (remaining <= 2) refreshDiscover();
    } catch {
      positionOf(profile.id).value = 0;
      setHandled(({ [profile.id]: _failed, ...rest }) => rest);
      setError('처리하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
  }

  /** 차단 등으로 더 볼 수 없게 된 프로필을 화면에서 뺍니다. */
  function hide(profileId: string) {
    setHandled((state) => ({ ...state, [profileId]: Date.now() }));
  }

  const noop = () => {};

  return (
    // 위쪽 안전 영역만 띄웁니다. 아래는 탭 바가 차지합니다.
    <SafeAreaView edges={['top']} className="flex-1 items-center bg-bg">
      <View className="w-full max-w-md flex-1 px-2 pb-2 pt-1">
        {current ? (
          // 카드 두 장(맨 위 + 바로 다음)을 겹쳐 그립니다. key 가 프로필 id 라서, 맨 위 카드가 빠지면
          // 뒤에 있던 카드가 새로 만들어지지 않고 그대로 맨 위 카드가 됩니다 (깜빡임 없음).
          <View className="flex-1">
            {[current, next].map((profile) => {
              if (!profile) return null;
              const isTop = profile.id === current.id;
              return (
                <DeckCard
                  key={profile.id}
                  x={positionOf(profile.id)}
                  frontX={isTop ? undefined : positionOf(current.id)}
                  onDecide={(action) => handleDecide(profile, action)}>
                  {(decide) => (
                    <ProfileCard
                      profile={profile}
                      myHobbies={myHobbies}
                      onOpenSafety={isTop ? () => setSafetyOpen(true) : noop}
                      onPass={() => decide('pass')}
                      onLike={() => decide('like')}
                      revealed={isTop}
                    />
                  )}
                </DeckCard>
              );
            })}
          </View>
        ) : (
          <View className="flex-1 items-center justify-center gap-5 px-6">
            {discover.isPending ? (
              <ActivityIndicator size="large" color={colors.brand} />
            ) : discover.isError ? (
              <>
                <Text className="text-center text-base text-muted">추천을 불러오지 못했어요.</Text>
                <View className="w-full">
                  <Button title="다시 시도" variant="secondary" onPress={() => discover.refetch()} />
                </View>
              </>
            ) : (
              <>
                <Text className="text-center text-xl font-bold text-fg">
                  조건에 맞는 새로운 사람을 모두 봤어요
                </Text>
                <Text className="text-center text-base leading-6 text-muted">
                  만남 조건의 거리나 나이 범위를 넓히거나, 잠시 후 다시 확인해 보세요.
                </Text>
                <View className="w-full gap-3">
                  <Button title="만남 조건 변경" onPress={() => router.push('/preferences')} />
                  <Button
                    title="새로고침"
                    variant="secondary"
                    onPress={() => discover.refetch()}
                    loading={discover.isRefetching}
                  />
                </View>
              </>
            )}
          </View>
        )}

        {error ? (
          <View pointerEvents="none" className="absolute left-4 right-4 top-16 items-center">
            <View className="rounded-full bg-red-600 px-4 py-2">
              <Text className="text-sm font-semibold text-white">{error}</Text>
            </View>
          </View>
        ) : null}
      </View>

      {me && current ? (
        <SafetySheet
          visible={safetyOpen}
          onClose={() => setSafetyOpen(false)}
          myId={me.id}
          target={current}
          onRemoved={() => hide(current.id)}
        />
      ) : null}

      <Modal visible={!!matched} transparent animationType="fade" onRequestClose={() => setMatched(null)}>
        <ThemeView className="flex-1 items-center justify-center bg-black/60 px-6">
          <View className="w-full max-w-sm gap-4 rounded-3xl bg-card p-6">
            <Text className="text-center text-2xl font-bold text-brand-600">서로 관심을 보였어요</Text>
            <Text className="text-center text-base leading-6 text-muted">
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
        </ThemeView>
      </Modal>
    </SafeAreaView>
  );
}
