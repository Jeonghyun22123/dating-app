import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { photoSource } from '@/features/photos/api';
import { Image } from 'expo-image';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { PURPOSES } from '@/features/profile/constants';
import { useMemberProfile } from '@/features/profile/member';
import { PhotoViewer } from '@/features/photos/photo-viewer';
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
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
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

      {/* 인스타그램 프로필처럼: 동그란 대표 사진 + 오른쪽에 이름·MBTI·정보 */}
      <View className="flex-row items-center gap-5">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="대표 사진 크게 보기"
          disabled={profile.photoUrls.length === 0}
          onPress={() => setViewerIndex(0)}>
          <Avatar url={profile.photoUrls[0]} name={profile.nickname} size={104} />
        </Pressable>
        <View className="flex-1 gap-1.5">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text className="text-2xl font-bold text-fg">
              {profile.nickname}({profile.age})
            </Text>
            {profile.trust_level === 'high' ? (
              <View className="flex-row items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5">
                <Ionicons name="shield-checkmark" size={12} color="#422006" />
                <Text className="text-xs font-semibold text-amber-950">신뢰 높음</Text>
              </View>
            ) : profile.verification_status === 'approved' ? (
              <View className="flex-row items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5">
                <Ionicons name="checkmark-circle" size={12} color="#ffffff" />
                <Text className="text-xs font-semibold text-white">본인 인증</Text>
              </View>
            ) : null}
          </View>
          {profile.mbti ? (
            <Text testID="mbti" className="text-base font-bold tracking-wider text-brand-600">
              {profile.mbti}
            </Text>
          ) : null}
          <Text className="text-sm text-muted">
            {[profile.neighborhood_name, purpose].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>

      {/* 자기소개 */}
      {profile.bio ? <Text className="text-base leading-6 text-fg">{profile.bio}</Text> : null}

      {/* 취미 */}
      {profile.hobbies.length > 0 ? (
        <View className="flex-row flex-wrap gap-1.5">
          {profile.hobbies.map((hobby) => (
            <View key={hobby} className="rounded-full bg-field px-3 py-1">
              <Text className="text-sm text-fg">{hobby}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* 추가 사진 (대표 사진 제외) — 3열 격자, 누르면 크게 */}
      <View className="h-px bg-line" />
      {profile.photoUrls.length > 1 ? (
        <View className="-mx-0.5 flex-row flex-wrap">
          {profile.photoUrls.slice(1).map((url, i) => (
            <View key={url} style={{ width: '33.333%', aspectRatio: 1, padding: 2 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`사진 ${i + 2} 크게 보기`}
                onPress={() => setViewerIndex(i + 1)}
                className="flex-1 overflow-hidden rounded-lg bg-field">
                <Image source={photoSource(url)} transition={150} style={{ flex: 1 }} contentFit="cover" />
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <Text className="py-6 text-center text-sm text-subtle">추가로 올린 사진이 없어요</Text>
      )}

      <PhotoViewer urls={profile.photoUrls} initialIndex={viewerIndex} onClose={() => setViewerIndex(null)} />

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
