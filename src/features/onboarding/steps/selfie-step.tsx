import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { ErrorText, Screen } from '@/components/ui/screen';
import { moderationMessage, submitSelfie, type ModerationResult } from '@/features/photos/api';
import { refreshMyProfile } from '@/features/profile/api';

/**
 * 실시간 셀카 인증.
 * 보관함의 사진을 고를 수 없고, 반드시 지금 카메라로 찍은 사진만 제출됩니다.
 */
export function SelfieStep({
  userId,
  progress,
  onDone,
  title = '실시간 셀카로 본인 확인',
  subtitle = '프로필 사진이 본인인지 확인하기 위한 절차예요. 촬영한 셀카는 프로필에 공개되지 않고, 확인이 끝나는 즉시 삭제됩니다.',
  submit,
  onBack,
  submittingText = '셀카를 제출하는 중이에요',
  confirmText = '이 사진으로 제출할까요?',
}: {
  userId: string;
  progress?: string;
  /** 제출 성공 후 호출 (온보딩 밖에서 다시 제출할 때 화면을 닫는 용도) */
  onDone?: (result: ModerationResult) => void;
  title?: string;
  subtitle?: string;
  /**
   * 셀카를 다른 용도(사진 변경 요청)로 제출할 때 지정합니다.
   * 지정하면 '검토 대기(pending)' 결과도 성공으로 보고 onDone 을 부릅니다.
   */
  submit?: (uri: string) => Promise<ModerationResult>;
  onBack?: () => void;
  /** 제출하는 동안 사진 위에 보여줄 문구 */
  submittingText?: string;
  /** 찍은 사진을 보여주며 물어볼 문구 */
  confirmText?: string;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 찍은 사진. 있으면 카메라 대신 이 사진을 보여주고 제출 여부를 묻습니다.
  const [captured, setCaptured] = useState<string | null>(null);

  // 1) 촬영: 사진만 찍고 바로 제출하지 않습니다.
  async function handleCapture() {
    setError(null);
    try {
      const picture = await cameraRef.current?.takePictureAsync({ quality: 0.5, shutterSound: false });
      if (!picture?.uri) throw new Error('capture_failed');
      setCaptured(picture.uri);
    } catch {
      setError('사진을 찍지 못했어요. 다시 시도해 주세요.');
    }
  }

  // 2) 확인 후 제출: 이때부터 "제출하는 중" 표시를 보여줍니다.
  async function handleSubmit() {
    if (!captured) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await (submit ? submit(captured) : submitSelfie(userId, captured));
      if (result.status === 'rejected') {
        setError(moderationMessage(result.reason));
      } else if (result.status === 'pending' && !submit) {
        setError('지금은 인증을 처리할 수 없어요. 잠시 후 다시 시도해 주세요.');
      } else {
        await refreshMyProfile(userId);
        onDone?.(result);
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
      title={title}
      subtitle={subtitle}
      onBack={onBack}
      footer={
        <>
          <ErrorText>{error}</ErrorText>
          {captured ? (
            <>
              <Button title="이 사진으로 제출" onPress={handleSubmit} disabled={submitting} />
              <Button
                title="다시 찍기"
                variant="secondary"
                onPress={() => {
                  setError(null);
                  setCaptured(null);
                  setCameraReady(false);
                }}
                disabled={submitting}
              />
            </>
          ) : granted ? (
            <Button title="촬영하기" onPress={handleCapture} disabled={!cameraReady} />
          ) : (
            <Button title="카메라 사용 허용" onPress={requestPermission} disabled={!permission} />
          )}
        </>
      }>
      <View className="aspect-[3/4] w-full overflow-hidden rounded-3xl bg-neutral-900">
        {captured ? (
          <>
            <Image source={{ uri: captured }} style={{ flex: 1 }} contentFit="cover" />
            {submitting ? (
              <View className="absolute bottom-0 left-0 right-0 top-0 items-center justify-center gap-3 bg-black/60 px-6">
                <ActivityIndicator size="large" color="#ffffff" />
                <Text className="text-center text-base font-semibold text-white">{submittingText}</Text>
                <Text className="text-center text-sm text-neutral-300">잠시만 기다려 주세요</Text>
              </View>
            ) : null}
          </>
        ) : granted ? (
          <CameraView
            ref={cameraRef}
            style={{ flex: 1 }}
            facing="front"
            mirror
            onCameraReady={() => setCameraReady(true)}
            onMountError={() =>
              setError('카메라를 열지 못했어요. 다른 앱이 카메라를 쓰고 있지 않은지 확인해 주세요.')
            }
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
      <Text className="text-sm leading-5 text-muted">
        {captured ? confirmText : '밝은 곳에서 얼굴 전체가 보이도록, 혼자 정면을 보고 촬영해 주세요.'}
      </Text>
    </Screen>
  );
}
