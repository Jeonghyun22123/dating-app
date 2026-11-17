import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { calculateAge } from '@/features/identity/adult-verification';
import { useMyPhotos } from '@/features/photos/api';
import { refreshMyProfile, useMyProfile } from '@/features/profile/api';
import { PURPOSES } from '@/features/profile/constants';
import { ProfileCard } from '@/features/profile/profile-card';
import { TrustCard, useTrustBreakdown } from '@/features/trust/trust-card';
import { useWallet } from '@/features/wallet/api';
import { signOut } from '@/lib/auth';
import { useThemeColors } from '@/theme/theme-view';

/**
 * 내 프로필 탭. 둘러보기에서 다른 사람에게 보이는 카드와 같은 모습으로 미리 보여줍니다.
 * 사진이 여러 장이면 옆으로 밀어 넘겨 보고, 사진을 누르면 화면 가득 크게 볼 수 있습니다.
 */
export default function MyProfileScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { data: profile } = useMyProfile();
  // 하트 잔액은 하트 화면과 같은 곳(지갑)에서 읽고, 이 탭으로 돌아올 때마다 새로 받아옵니다.
  // (관리자 지급, 스포트라이트·시그널 사용 등 다른 화면에서 바뀐 값이 바로 보이도록)
  const wallet = useWallet();
  const { refetch: refetchWallet } = wallet;
  const { data: allPhotos, refetch: refetchPhotos } = useMyPhotos(profile?.id);
  const userId = profile?.id;
  // 사진 검토 결과(승인·반려)도 서버에서 바뀌므로 함께 새로 받아옵니다.
  useFocusEffect(
    useCallback(() => {
      refetchWallet();
      if (userId) {
        refetchPhotos();
        refreshMyProfile(userId);
      }
    }, [refetchWallet, refetchPhotos, userId]),
  );
  const { data: trust } = useTrustBreakdown(profile?.id);

  if (!profile) return null;

  // 다른 사람에게 보이는 사진만 미리 보여줍니다 (pending = 가입 때 올려 검수를 기다리는 사진).
  // 변경 요청 전이거나 검토 중인 새 사진, 반려된 사진은 뺍니다.
  const photos = (allPhotos ?? []).filter(
    (photo) => photo.url && ['approved', 'pending'].includes(photo.moderation_status),
  );
  const purpose = PURPOSES.find((item) => item.value === profile.purpose)?.label;
  const balance = wallet.data?.balance ?? profile.coin_balance;

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

      <ProfileCard
        photos={photos.map((photo) => ({
          key: photo.id,
          url: photo.url!,
          pending: photo.moderation_status === 'pending',
        }))}
        nickname={profile.nickname}
        age={calculateAge(profile.birth_date)}
        mbti={profile.mbti}
        badge={
          trust?.level === 'high'
            ? 'high'
            : profile.verification_status === 'approved'
              ? 'verified'
              : profile.verification_status
        }
        subtitle={`${profile.neighborhood_name} · ${purpose}`}
        bio={profile.bio}
        hobbies={profile.hobbies}
        action={{ label: '프로필 수정', icon: 'create-outline', onPress: () => router.push('/edit-profile') }}
        emptyText="사진을 등록해 주세요"
        onEmptyPress={() => router.push('/edit-photos')}
      />

      {profile.photo_review_status ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/edit-photos')}
          className="flex-row items-center gap-3 rounded-2xl bg-card px-5 py-4 active:opacity-70">
          <Ionicons
            name={profile.photo_review_status === 'rejected' ? 'alert-circle' : 'time-outline'}
            size={22}
            color={profile.photo_review_status === 'rejected' ? '#dc2626' : colors.brand}
          />
          <Text className="flex-1 text-sm leading-5 text-fg">
            {profile.photo_review_status === 'rejected'
              ? '사진 변경 요청이 반려됐어요. 눌러서 사유를 확인하세요.'
              : '새 사진을 검토하고 있어요. 검토가 끝나면 프로필에 반영돼요.'}
          </Text>
        </Pressable>
      ) : null}

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
