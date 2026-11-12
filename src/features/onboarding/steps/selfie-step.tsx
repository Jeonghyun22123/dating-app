import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { ErrorText, Screen } from '@/components/ui/screen';
import { moderationMessage, submitSelfie } from '@/features/photos/api';
import { refreshMyProfile } from '@/features/profile/api';

/**
 * 실시간 셀카 인증.
 * 보관함의 사진을 고를 수 없고, 반드시 지금 카메라로 찍은 사진만 제출됩니다.
 */
export function SelfieStep({ userId, progress }: { userId: string; progress: string }) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCapture() {
    setError(null);
    setSubmitting(true);
    try {
      const picture = await cameraRef.current?.takePictureAsync({ quality: 0.8 });
      if (!picture?.uri) throw new Error('capture_failed');

      const result = await submitSelfie(userId, picture.uri);
      if (result.status === 'rejected') {
        setError(moderationMessage(result.reason));
      } else if (result.status === 'pending') {
        setError('지금은 인증을 처리할 수 없어요. 잠시 후 다시 시도해 주세요.');
      } else {
        await refreshMyProfile(userId);
      }
    } catch (e) {
      setError(
        (e as Error).message === 'moderation_unavailable'
          ? '인증 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'
          : '셀카를 제출하지 못했어요. 다시 시도해 주세요.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  const granted = permission?.granted;

  return (
    <Screen
      progress={progress}
      title="실시간 셀카로 본인 확인"
      subtitle="프로필 사진이 본인인지 확인하기 위한 절차예요. 촬영한 셀카는 프로필에 공개되지 않고, 확인이 끝나는 즉시 삭제됩니다."
      footer={
        <>
          <ErrorText>{error}</ErrorText>
          {granted ? (
            <Button
              title="촬영하고 제출"
              onPress={handleCapture}
              loading={submitting}
              disabled={!cameraReady}
            />
          ) : (
            <Button title="카메라 사용 허용" onPress={requestPermission} disabled={!permission} />
          )}
        </>
      }>
      <View className="aspect-[3/4] w-full overflow-hidden rounded-3xl bg-neutral-900">
        {granted ? (
          <CameraView
            ref={cameraRef}
            style={{ flex: 1 }}
            facing="front"
            mirror
            onCameraReady={() => setCameraReady(true)}
            onMountError={() => setError('카메라를 열지 못했어요. 다른 앱이 카메라를 쓰고 있지 않은지 확인해 주세요.')}
          />
        ) : (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-center text-base leading-6 text-neutral-300">
              {permission && !permission.canAskAgain
                ? '카메라 권한이 꺼져 있어요. 기기 또는 브라우저 설정에서 카메라 접근을 허용해 주세요.'
                : '셀카를 찍으려면 카메라 권한이 필요해요.'}
            </Text>
          </View>
        )}
      </View>
      <Text className="text-sm leading-5 text-neutral-500">
        밝은 곳에서 얼굴 전체가 보이도록, 혼자 정면을 보고 촬영해 주세요.
      </Text>
    </Screen>
  );
}
