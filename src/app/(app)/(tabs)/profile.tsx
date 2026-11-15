import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { calculateAge } from '@/features/identity/adult-verification';
import { useMyPhotos, photoSource } from '@/features/photos/api';
import { useMyProfile } from '@/features/profile/api';
import { PURPOSES } from '@/features/profile/constants';
import { TrustCard, useTrustBreakdown } from '@/features/trust/trust-card';
import { useWallet } from '@/features/wallet/api';
import { signOut } from '@/lib/auth';
import { useThemeColors } from '@/theme/theme-view';

const shadow = {
  textShadowColor: 'rgba(0,0,0,0.5)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 4,
} as const;

/**
 * 내 프로필 탭. 둘러보기에서 다른 사람에게 보이는 카드와 같은 모습으로 미리 보여줍니다.
 * 사진이 여러 장이면 옆으로 밀거나 사진의 좌우를 눌러 넘겨 볼 수 있습니다.
 */
export default function MyProfileScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { data: profile } = useMyProfile();
  // 하트 잔액은 하트 화면과 같은 곳(지갑)에서 읽고, 이 탭으로 돌아올 때마다 새로 받아옵니다.
  // (관리자 지급, 스포트라이트·시그널 사용 등 다른 화면에서 바뀐 값이 바로 보이도록)
  const wallet = useWallet();
  const { refetch: refetchWallet } = wallet;
  useFocusEffect(
    useCallback(() => {
      refetchWallet();
    }, [refetchWallet]),
  );
  const { data: allPhotos } = useMyPhotos(profile?.id);
  const { data: trust } = useTrustBreakdown(profile?.id);

  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [width, setWidth] = useState(0);
  const [photoIndex, setPhotoIndex] = useState(0);

  if (!profile) return null;

  // 반려된 사진은 다른 사람에게 보이지 않으므로 미리보기에서도 뺍니다.
  const photos = (allPhotos ?? []).filter((photo) => photo.url && photo.moderation_status !== 'rejected');
  const index = Math.min(photoIndex, Math.max(photos.length - 1, 0));
  const purpose = PURPOSES.find((item) => item.value === profile.purpose)?.label;
  const balance = wallet.data?.balance ?? profile.coin_balance;

  const goTo = (next: number) => {
    const clamped = Math.max(0, Math.min(next, photos.length - 1));
    scrollRef.current?.scrollTo({ x: clamped * width, animated: true });
    setPhotoIndex(clamped);
  };

  return (
    <Screen>
      <View className="flex-row items-center justify-between">
        <Text className="text-3xl font-bold text-fg">내 프로필</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="설정"
          hitSlop={8}
          onPress={() => router.push('/settings')}>
          <Ionicons name="settings-outline" size={26} color={colors.fg} />
        </Pressable>
      </View>

      <View
        className="aspect-[4/5] w-full overflow-hidden rounded-3xl bg-neutral-800"
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {photos.length > 0 ? (
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={(event) => {
              if (width > 0) setPhotoIndex(Math.round(event.nativeEvent.contentOffset.x / width));
            }}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            {photos.map((photo, i) => (
              <View key={photo.id} testID="my-photo" style={{ width: width || undefined, height: '100%' }}>
                <Image
                  source={photoSource(photo.url!)}
                  transition={150}
                  style={{ flex: 1 }}
                  contentFit="cover"
                />
                {photo.moderation_status === 'pending' ? (
                  <View
                    pointerEvents="none"
                    className="absolute left-3 top-[76px] rounded-full bg-black/55 px-3 py-1.5">
                    <Text className="text-xs font-semibold text-white">검수 중 · 아직 나에게만 보여요</Text>
                  </View>
                ) : null}
                {/* 사진의 왼쪽·오른쪽을 눌러서도 넘길 수 있습니다 (마우스로 볼 때 편하도록). */}
                {photos.length > 1 ? (
                  <View className="absolute bottom-0 left-0 right-0 top-0 flex-row">
                    <Pressable
                      accessibilityLabel="이전 사진"
                      className="flex-1"
                      onPress={() => goTo(i - 1)}
                    />
                    <Pressable
                      accessibilityLabel="다음 사진"
                      className="flex-1"
                      onPress={() => goTo(i + 1)}
                    />
                  </View>
                ) : null}
              </View>
            ))}
          </ScrollView>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/edit-photos')}
            className="absolute bottom-0 left-0 right-0 top-0 items-center justify-center gap-2 pb-24">
            <Ionicons name="image-outline" size={40} color="#d4d4d4" />
            <Text className="text-base text-neutral-300">사진을 등록해 주세요</Text>
          </Pressable>
        )}

        {/* 위쪽: 사진 위치 표시, 프로필 수정 */}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)']}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 110 }}
        />
        <View pointerEvents="box-none" className="absolute left-0 right-0 top-0 gap-3 p-3">
          {photos.length > 1 ? (
            <View pointerEvents="none" className="flex-row gap-1">
              {photos.map((photo, i) => (
                <View
                  key={photo.id}
                  className={`h-1 flex-1 rounded-full ${i === index ? 'bg-white' : 'bg-white/40'}`}
                />
              ))}
            </View>
          ) : null}
          <View pointerEvents="box-none" className="flex-row items-center justify-between">
            {photos.length > 1 ? (
              <View pointerEvents="none" className="rounded-full bg-black/35 px-3 py-1.5">
                <Text
                  accessibilityLabel={`사진 ${index + 1} / ${photos.length}`}
                  className="text-sm font-semibold text-white">
                  {index + 1} / {photos.length}
                </Text>
              </View>
            ) : (
              <View />
            )}
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => router.push('/edit-profile')}
              className="flex-row items-center gap-1.5 rounded-full bg-black/45 px-3.5 py-2">
              <Ionicons name="create-outline" size={16} color="#ffffff" />
              <Text className="text-sm font-semibold text-white">프로필 수정</Text>
            </Pressable>
          </View>
        </View>

        {/* 아래쪽: 다른 사람에게 보이는 프로필 정보 */}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.88)']}
          locations={[0, 0.45, 1]}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '62%' }}
        />
        <View pointerEvents="none" className="absolute bottom-0 left-0 right-0 gap-2.5 p-4">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text style={shadow} className="text-3xl font-bold text-white">
              {profile.nickname}, {calculateAge(profile.birth_date)}
            </Text>
            {trust?.level === 'high' ? (
              <View className="flex-row items-center gap-1 rounded-full bg-amber-400 px-2.5 py-1">
                <Ionicons name="shield-checkmark" size={14} color="#422006" />
                <Text className="text-xs font-semibold text-amber-950">신뢰 높음</Text>
              </View>
            ) : profile.verification_status === 'approved' ? (
              <View className="flex-row items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1">
                <Ionicons name="checkmark-circle" size={14} color="#ffffff" />
                <Text className="text-xs font-semibold text-white">본인 인증</Text>
              </View>
            ) : (
              <View className="flex-row items-center gap-1 rounded-full bg-white/25 px-2.5 py-1">
                <Ionicons
                  name={profile.verification_status === 'rejected' ? 'alert-circle' : 'time-outline'}
                  size={14}
                  color="#ffffff"
                />
                <Text className="text-xs font-semibold text-white">
                  {profile.verification_status === 'rejected' ? '셀카 인증 반려' : '셀카 인증 심사 중'}
                </Text>
              </View>
            )}
          </View>
          <Text style={shadow} className="text-base text-white">
            {profile.neighborhood_name} · {purpose}
          </Text>
          {profile.bio ? (
            <Text style={shadow} numberOfLines={3} className="text-base leading-6 text-white/95">
              {profile.bio}
            </Text>
          ) : null}
          {profile.hobbies.length > 0 ? (
            <View className="flex-row flex-wrap gap-1.5">
              {profile.hobbies.map((hobby) => (
                <View key={hobby} className="rounded-full bg-white/25 px-3 py-1">
                  <Text className="text-sm text-white">{hobby}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </View>

      {profile.verification_status === 'rejected' ? (
        <Button title="셀카 인증 다시 하기" onPress={() => router.push('/selfie')} />
      ) : null}

      <View className="overflow-hidden rounded-3xl bg-card">
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/wallet')}
          className="flex-row items-center gap-3 px-5 py-4 active:opacity-70">
          <Ionicons name="heart" size={22} color={colors.brand} />
          <Text className="flex-1 text-base font-semibold text-fg">하트 {balance}개 · 스포트라이트</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.subtle} />
        </Pressable>
        {profile.role === 'admin' ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/admin')}
            className="flex-row items-center gap-3 border-t border-line px-5 py-4 active:opacity-70">
            <Ionicons name="construct-outline" size={22} color={colors.muted} />
            <Text className="flex-1 text-base font-semibold text-fg">관리자 페이지</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.subtle} />
          </Pressable>
        ) : null}
      </View>

      <TrustCard userId={profile.id} />

      <Pressable accessibilityRole="button" hitSlop={8} onPress={signOut} className="self-center py-2">
        <Text className="text-sm text-subtle underline">로그아웃</Text>
      </Pressable>
    </Screen>
  );
}
