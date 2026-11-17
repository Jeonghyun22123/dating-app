import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { PURPOSES } from '@/features/profile/constants';
import { useMemberProfile } from '@/features/profile/member';
import { ProfileCard } from '@/features/profile/profile-card';
import { SafetySheet } from '@/features/safety/safety-sheet';
import { useAuthStore } from '@/stores/auth-store';
import { useThemeColors } from '@/theme/theme-view';

/**
 * 상대 프로필 보기. 채팅방·채팅 목록·받은 시그널에서 상대 사진을 누르면 열립니다.
 * 볼 수 있는지는 서버(member_profile)가 정합니다: 매칭 중인 상대와, 나에게 시그널을 보낸 사람만.
 */
export default function MemberProfileScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const myId = useAuthStore((s) => s.session?.user.id);
  const member = useMemberProfile(id);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/matches'));

  const profile = member.data;
  if (!profile) {
    return (
      <Screen onBack={goBack}>
        <View className="items-center gap-4 py-24">
          {member.isPending ? (
            <ActivityIndicator size="large" color={colors.brand} />
          ) : (
            <>
              <Text className="text-center text-base leading-6 text-muted">
                {member.isError
                  ? '프로필을 불러오지 못했어요.'
                  : '프로필을 볼 수 없어요.\n매칭이 해제됐거나 더 이상 볼 수 없는 회원이에요.'}
              </Text>
              {member.isError ? (
                <Button title="다시 시도" variant="secondary" onPress={() => member.refetch()} />
              ) : null}
            </>
          )}
        </View>
      </Screen>
    );
  }

  const purpose = PURPOSES.find((item) => item.value === profile.purpose)?.label;

  return (
    <Screen>
      <View className="flex-row items-center justify-between">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="뒤로"
          hitSlop={8}
          onPress={goBack}
          className="-ml-1">
          <Ionicons name="chevron-back" size={28} color={colors.fg} />
        </Pressable>
        <Text className="text-lg font-semibold text-fg">{profile.nickname}님의 프로필</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="신고 또는 차단"
          hitSlop={8}
          onPress={() => setSafetyOpen(true)}>
          <Ionicons name="ellipsis-horizontal" size={24} color={colors.muted} />
        </Pressable>
      </View>

      <ProfileCard
        photos={profile.photoUrls.map((url) => ({ key: url, url }))}
        nickname={profile.nickname}
        age={profile.age}
        mbti={profile.mbti}
        badge={
          profile.trust_level === 'high'
            ? 'high'
            : profile.verification_status === 'approved'
              ? 'verified'
              : null
        }
        subtitle={[profile.neighborhood_name, purpose].filter(Boolean).join(' · ')}
        bio={profile.bio}
        hobbies={profile.hobbies}
      />

      {profile.bio ? (
        <View className="gap-2 rounded-3xl bg-card p-5">
          <Text className="text-sm font-semibold text-muted">자기소개</Text>
          <Text className="text-base leading-6 text-fg">{profile.bio}</Text>
        </View>
      ) : null}

      {!profile.match_id ? (
        <Text className="text-center text-sm leading-5 text-muted">
          시그널을 보낸 회원이에요. 채팅 탭의 "받은 시그널"에서 수락하거나 거절할 수 있어요.
        </Text>
      ) : null}

      {myId ? (
        <SafetySheet
          visible={safetyOpen}
          onClose={() => setSafetyOpen(false)}
          myId={myId}
          target={{ id: profile.id, nickname: profile.nickname }}
          matchId={profile.match_id ?? undefined}
          onRemoved={() => router.replace('/matches')}
        />
      ) : null}
    </Screen>
  );
}
