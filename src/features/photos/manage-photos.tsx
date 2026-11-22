import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { ErrorText, Screen } from '@/components/ui/screen';
import { SelfieStep } from '@/features/onboarding/steps/selfie-step';
import {
  deleteProfilePhoto,
  dismissPhotoReview,
  MAX_PHOTOS,
  moderationMessage,
  photoSource,
  pickPhotos,
  requestPhotoChange,
  setMainPhoto,
  uploadProfilePhoto,
  useMyPhotos,
  type PhotoWithUrl,
} from '@/features/photos/api';
import { refreshMyProfile, useMyProfile } from '@/features/profile/api';
import { AnalyticsEvent, track } from '@/lib/analytics';
import { ThemeView, useThemeColors } from '@/theme/theme-view';

function Tile({
  photo,
  label,
  main,
  canDelete,
  onDelete,
  onMakeMain,
}: {
  photo: PhotoWithUrl;
  /** 사진 아래쪽에 띠로 보여줄 상태 문구 */
  label?: string;
  main?: boolean;
  canDelete: boolean;
  onDelete: () => void;
  onMakeMain?: () => void;
}) {
  return (
    <View className="aspect-square w-[31%] overflow-hidden rounded-2xl bg-field">
      {photo.url ? (
        <Image source={photoSource(photo.url)} transition={150} style={{ flex: 1 }} contentFit="cover" />
      ) : null}
      {main ? (
        <View className="absolute left-1 top-1 flex-row items-center gap-1 rounded-full bg-brand-500 px-2 py-1">
          <Ionicons name="star" size={11} color="#ffffff" />
          <Text className="text-xs font-bold text-white">대표</Text>
        </View>
      ) : null}
      {label ? (
        <View className="absolute bottom-0 left-0 right-0 bg-black/60 py-1">
          <Text className="text-center text-xs text-white">{label}</Text>
        </View>
      ) : onMakeMain ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="대표사진으로 지정"
          onPress={onMakeMain}
          className="absolute bottom-0 left-0 right-0 bg-black/60 py-1.5 active:bg-black/80">
          <Text className="text-center text-xs font-semibold text-white">대표로 지정</Text>
        </Pressable>
      ) : null}
      {canDelete ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="사진 삭제"
          onPress={onDelete}
          hitSlop={8}
          className="absolute right-1 top-1 h-7 w-7 items-center justify-center rounded-full bg-black/60">
          <Text className="text-sm font-bold text-white">✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * 프로필 수정 > 사진 관리.
 * - 이미 승인된 사진: 대표사진 지정과 삭제는 검토 없이 바로 반영됩니다 (마지막 1장은 삭제 불가).
 * - 새로 올린 사진: 바로 공개되지 않습니다. "사진 변경 요청"을 누르고 셀카로 본인 확인을 하면
 *   검토 후 반영되고, 그때까지는 기존 사진이 그대로 보입니다.
 */
export function ManagePhotos({ userId, onClose }: { userId: string; onClose: () => void }) {
  const colors = useThemeColors();
  const photosQuery = useMyPhotos(userId);
  const { data: profile } = useMyProfile();
  const [uploading, setUploading] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [takingSelfie, setTakingSelfie] = useState(false);

  const all = photosQuery.data ?? [];
  // 공개 중인 사진 (pending = 가입 때 올려 AI 검수를 기다리는 사진)
  const current = all.filter((photo) => ['approved', 'pending'].includes(photo.moderation_status));
  const approvedCount = all.filter((photo) => photo.moderation_status === 'approved').length;
  const drafts = all.filter((photo) => photo.moderation_status === 'draft');
  const inReview = all.filter((photo) => photo.moderation_status === 'review');
  const shown = current.length + drafts.length + inReview.length;

  const reviewing = profile?.photo_review_status === 'reviewing';
  const rejected = profile?.photo_review_status === 'rejected';
  // 가입 셀카 심사가 진행 중이면 그 심사가 끝난 뒤에 새 사진을 추가할 수 있습니다.
  const signupReview = profile?.verification_status === 'pending' && !!profile.selfie_submitted_at;
  const canAdd = shown < MAX_PHOTOS && !uploading && !reviewing && !signupReview;

  async function run(action: () => Promise<void>, failMessage: string) {
    setError(null);
    setNotice(null);
    setWorking(true);
    try {
      await action();
    } catch (e) {
      const detail = (e as { message?: string }).message;
      setError(detail && /[가-힣]/.test(detail) ? detail : failMessage);
    } finally {
      setWorking(false);
    }
  }

  async function handleAdd() {
    setError(null);
    setNotice(null);
    try {
      const uris = await pickPhotos(MAX_PHOTOS - shown);
      if (uris.length === 0) return;
      setUploading(true);
      // 반려된 사진의 기록이 자리를 차지하고 있으면 먼저 정리합니다 (1인당 최대 6장 제한).
      if (all.length + uris.length > MAX_PHOTOS) {
        await Promise.all(
          all.filter((photo) => photo.moderation_status === 'rejected').map(deleteProfilePhoto),
        );
      }
      // 고른 사진을 한꺼번에 올립니다. 일부가 실패해도 올라간 사진은 그대로 둡니다.
      const results = await Promise.allSettled(
        uris.map((uri, i) => uploadProfilePhoto(userId, uri, Math.min(shown + i, MAX_PHOTOS - 1), false)),
      );
      const failed = results.filter((result) => result.status === 'rejected').length;
      if (failed > 0) setError(`사진 ${failed}장을 올리지 못했어요. 잠시 후 다시 시도해 주세요.`);
    } catch {
      setError('사진을 올리지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setUploading(false);
    }
  }

  if (takingSelfie) {
    return (
      <SelfieStep
        userId={userId}
        title="본인 확인 셀카"
        subtitle="새 사진이 본인인지 확인하기 위해 지금 셀카를 한 장 찍어 주세요. 셀카는 프로필에 공개되지 않고, 검토가 끝나는 즉시 삭제됩니다."
        onBack={() => setTakingSelfie(false)}
        submit={async (uri) => {
          const result = await requestPhotoChange(userId, uri);
          track(AnalyticsEvent.PhotoChangeRequested, { result: result.status });
          // 셀카가 아니라 새 사진이 전부 거절된 경우: 사진 화면으로 돌아가 이유를 보여줍니다.
          if (result.status === 'rejected' && result.rejected_photos) {
            setTakingSelfie(false);
            setError(`새 사진이 검수를 통과하지 못했어요. ${moderationMessage(result.reason)}`);
          }
          return result;
        }}
        onDone={(result) => {
          setTakingSelfie(false);
          const dropped = result.rejected_photos
            ? ` 검수를 통과하지 못한 사진 ${result.rejected_photos}장은 제외했어요.`
            : '';
          if (result.status === 'approved') {
            setNotice(`새 사진이 프로필에 반영됐어요.${dropped}`);
          } else {
            // 검토 대기: 프로필 수정 화면으로 돌아가면 사진 관리가 잠기고 "사진 검토 중"이 표시됩니다.
            onClose();
          }
        }}
      />
    );
  }

  return (
    <Screen
      title="사진 관리"
      onBack={onClose}
      subtitle={`최대 ${MAX_PHOTOS}장까지 등록할 수 있어요. 대표사진은 둘러보기에서 가장 먼저 보이는 사진이에요. 새 사진은 검토를 거친 뒤 프로필에 반영됩니다.`}
      footer={
        <>
          <ErrorText>{error}</ErrorText>
          {drafts.length > 0 && !reviewing ? (
            <Button
              title="사진 변경 요청"
              onPress={() => setConfirming(true)}
              disabled={uploading || working || signupReview}
            />
          ) : (
            <Button title="완료" onPress={onClose} disabled={uploading} />
          )}
        </>
      }>
      {reviewing ? (
        <View className="gap-1 rounded-2xl bg-brand-50 p-4">
          <Text className="text-base font-semibold text-brand-700">사진 검토 중</Text>
          <Text className="text-sm leading-5 text-brand-700">
            검토가 끝나면 새 사진이 프로필에 반영돼요. 그때까지는 지금 사진이 그대로 보이고, 사진을 바꿀 수
            없어요.
          </Text>
        </View>
      ) : null}

      {rejected ? (
        <View className="gap-2 rounded-2xl border border-red-300 bg-card p-4">
          <Text className="text-base font-semibold text-red-600">사진 변경 요청이 반려됐어요</Text>
          <Text className="text-sm leading-5 text-fg">
            사유: {profile?.photo_review_note || '검토 기준에 맞지 않아요.'}
          </Text>
          <Text className="text-sm leading-5 text-muted">
            기존 사진은 그대로예요. 다른 사진을 올려 다시 요청할 수 있어요.
          </Text>
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            disabled={working}
            onPress={() =>
              run(async () => {
                await dismissPhotoReview(userId);
                await refreshMyProfile(userId);
              }, '처리하지 못했어요. 잠시 후 다시 시도해 주세요.')
            }
            className="self-end">
            <Text className="text-sm font-semibold text-brand-600">확인</Text>
          </Pressable>
        </View>
      ) : null}

      <View className="flex-row flex-wrap gap-[3.5%]">
        {current.map((photo, index) => {
          const approved = photo.moderation_status === 'approved';
          const main = index === 0;
          return (
            <Tile
              key={photo.id}
              photo={photo}
              main={main}
              label={approved ? undefined : '검수 대기'}
              // 승인된 사진이 1장뿐이면 그 사진은 지울 수 없습니다.
              canDelete={!reviewing && !working && !(approved && approvedCount <= 1)}
              onDelete={() => run(() => deleteProfilePhoto(photo), '사진을 삭제하지 못했어요.')}
              onMakeMain={
                approved && !main && !working
                  ? () => run(() => setMainPhoto(photo), '대표사진을 바꾸지 못했어요.')
                  : undefined
              }
            />
          );
        })}
        {inReview.map((photo) => (
          <Tile key={photo.id} photo={photo} label="검토 중" canDelete={false} onDelete={() => {}} />
        ))}
        {drafts.map((photo) => (
          <Tile
            key={photo.id}
            photo={photo}
            label="새 사진 · 요청 전"
            canDelete={!working}
            onDelete={() => run(() => deleteProfilePhoto(photo), '사진을 삭제하지 못했어요.')}
          />
        ))}
        {shown < MAX_PHOTOS && !reviewing ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="사진 추가"
            accessibilityState={{ disabled: !canAdd }}
            aria-disabled={!canAdd}
            disabled={!canAdd}
            onPress={handleAdd}
            className={`aspect-square w-[31%] items-center justify-center rounded-2xl border-2 border-dashed border-line bg-card ${signupReview ? 'opacity-50' : ''}`}>
            {uploading ? (
              <ActivityIndicator color={colors.brand} />
            ) : (
              <Text className="text-3xl text-subtle">＋</Text>
            )}
          </Pressable>
        ) : null}
      </View>

      {uploading ? <Text className="text-sm text-muted">사진을 올리는 중이에요…</Text> : null}
      {signupReview ? (
        <Text className="text-sm leading-5 text-muted">
          가입 심사가 끝난 뒤에 새 사진을 추가할 수 있어요. 대표사진 변경과 삭제는 지금도 할 수 있어요.
        </Text>
      ) : drafts.length > 0 && !reviewing ? (
        <Text className="text-sm leading-5 text-muted">
          새 사진 {drafts.length}장은 아직 프로필에 보이지 않아요. 아래 "사진 변경 요청"을 눌러 검토를 요청해
          주세요.
        </Text>
      ) : null}
      {notice ? <Text className="text-sm text-emerald-600">{notice}</Text> : null}

      <Modal
        visible={confirming}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirming(false)}>
        <ThemeView className="flex-1 items-center justify-center bg-black/60 px-6">
          <View accessibilityRole="alert" className="w-full max-w-sm gap-4 rounded-3xl bg-card p-6">
            <Text className="text-xl font-bold text-fg">사진 변경을 요청할까요?</Text>
            <Text className="text-base leading-6 text-muted">
              관리자에게 새 사진 {drafts.length}장의 검토를 요청해요. 검토가 끝나면 사진이 바뀌고, 그때까지는
              지금 사진이 그대로 보여요. 검토 중에는 사진 관리를 사용할 수 없어요.
            </Text>
            <Text className="text-sm leading-5 text-muted">
              본인 확인을 위해 다음 화면에서 셀카를 한 장 찍어요.
            </Text>
            <Button
              title="요청하기"
              onPress={() => {
                setConfirming(false);
                setError(null);
                setNotice(null);
                setTakingSelfie(true);
              }}
            />
            <Button title="취소" variant="secondary" onPress={() => setConfirming(false)} />
          </View>
        </ThemeView>
      </Modal>
    </Screen>
  );
}
