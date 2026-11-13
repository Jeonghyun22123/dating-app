import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { calculateAge } from '@/features/identity/adult-verification';
import { useMyPhotos } from '@/features/photos/api';
import { useMyProfile } from '@/features/profile/api';
import { PURPOSES } from '@/features/profile/constants';
import { signOut } from '@/lib/auth';

const VERIFICATION_LABEL = {
  pending: '셀카 인증 심사 중',
  approved: '본인 인증 완료',
  rejected: '셀카 인증 반려 · 다시 시도해 주세요',
} as const;

/** 내 프로필 탭. 다른 사람에게 보이는 모습 그대로 보여줍니다. (수정 기능은 이후 Phase) */
export default function MyProfileScreen() {
  const router = useRouter();
  const { data: profile } = useMyProfile();
  const { data: photos } = useMyPhotos(profile?.id);

  if (!profile) return null;

  const mainPhoto = photos?.find((photo) => photo.url);
  const purpose = PURPOSES.find((item) => item.value === profile.purpose)?.label;

  return (
    <Screen
      title="내 프로필"
      footer={
        <>
          {profile.verification_status === 'rejected' ? (
            <Button title="셀카 인증 다시 하기" onPress={() => router.push('/selfie')} />
          ) : null}
          {profile.role === 'admin' ? (
            <Button title="관리자 페이지" variant="secondary" onPress={() => router.push('/admin')} />
          ) : null}
          <Button title="로그아웃" variant="secondary" onPress={signOut} />
        </>
      }>
      <View className="overflow-hidden rounded-3xl bg-white">
        <View className="aspect-[4/5] w-full bg-neutral-200">
          {mainPhoto?.url ? (
            <Image source={{ uri: mainPhoto.url }} style={{ flex: 1 }} contentFit="cover" />
          ) : null}
        </View>
        <View className="gap-3 p-5">
          <Text className="text-2xl font-bold text-neutral-900">
            {profile.nickname}, {calculateAge(profile.birth_date)}
          </Text>
          <Text className="text-base text-neutral-600">
            {profile.neighborhood_name} · {purpose}
          </Text>
          <Text
            className={`text-sm font-medium ${profile.verification_status === 'approved' ? 'text-emerald-600' : 'text-neutral-500'}`}>
            {VERIFICATION_LABEL[profile.verification_status]}
          </Text>
          {profile.bio ? <Text className="text-base leading-6 text-neutral-800">{profile.bio}</Text> : null}
          <View className="flex-row flex-wrap gap-2">
            {profile.hobbies.map((hobby) => (
              <View key={hobby} className="rounded-full bg-brand-50 px-3 py-1">
                <Text className="text-sm text-brand-700">{hobby}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </Screen>
  );
}
