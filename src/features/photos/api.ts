import { useQuery } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import type { ModerationStatus, ProfilePhoto } from '@/types/db';

export const PROFILE_BUCKET = 'profile-photos';
export const SELFIE_BUCKET = 'verification-selfies';
export const MAX_PHOTOS = 6;

export type PhotoWithUrl = ProfilePhoto & { url: string | null };

export type ModerationResult = {
  status: ModerationStatus;
  reason?: string;
  test_mode?: boolean;
};

export const photosKey = (userId: string | undefined) => ['profile-photos', userId] as const;

/** 거절 사유 코드를 사용자에게 보여줄 문장으로 바꿉니다. */
export function moderationMessage(reason: string | null | undefined): string {
  switch (reason) {
    case 'nudity':
      return '노출이 포함된 사진은 등록할 수 없어요.';
    case 'ai_generated':
      return 'AI로 생성된 이미지는 등록할 수 없어요.';
    case 'weapon':
    case 'drug':
    case 'gore':
    case 'offensive':
      return '부적절한 내용이 포함된 사진이에요.';
    case 'no_face':
      return '얼굴이 보이지 않아요. 정면을 보고 다시 촬영해 주세요.';
    case 'multiple_faces':
      return '혼자 나온 사진으로 다시 촬영해 주세요.';
    case 'file_missing':
      return '사진 업로드가 완료되지 않았어요. 다시 시도해 주세요.';
    default:
      return '사진이 검수를 통과하지 못했어요.';
  }
}

/**
 * 비공개 버킷의 사진 경로들을 1시간짜리 Signed URL 로 바꿉니다.
 * 파일이 없거나 볼 권한이 없는 경로는 결과에서 빠집니다.
 */
export async function signPhotoPaths(paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data } = await supabase.storage.from(PROFILE_BUCKET).createSignedUrls(unique, 60 * 60);
  const result = new Map<string, string>();
  for (const item of data ?? []) {
    if (item.path && item.signedUrl && !item.error) result.set(item.path, item.signedUrl);
  }
  return result;
}

/** 사진 보관함에서 1장 선택. 취소하면 null. */
export async function pickPhoto(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [4, 5],
    quality: 1,
  });
  return result.canceled ? null : result.assets[0].uri;
}

/**
 * 업로드 전 처리: 긴 변 기준으로 줄이고 JPEG 로 다시 저장합니다.
 * 다시 인코딩하면서 촬영 위치(GPS) 같은 EXIF 정보도 함께 제거됩니다.
 */
async function prepareImage(uri: string, width: number): Promise<ArrayBuffer> {
  const rendered = await ImageManipulator.manipulate(uri).resize({ width }).renderAsync();
  const saved = await rendered.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  const response = await fetch(saved.uri);
  return response.arrayBuffer();
}

async function invokeModeration(body: Record<string, string>): Promise<ModerationResult> {
  const { data, error } = await supabase.functions.invoke<ModerationResult>('moderate-photo', { body });
  if (error || !data) throw new Error('moderation_unavailable');
  return data;
}

/** 프로필 사진 업로드 → DB 등록 → AI 검수 요청. */
export async function uploadProfilePhoto(
  userId: string,
  uri: string,
  position: number,
): Promise<ModerationResult> {
  const bytes = await prepareImage(uri, 1080);
  const path = `${userId}/${Crypto.randomUUID()}.jpg`;

  const upload = await supabase.storage
    .from(PROFILE_BUCKET)
    .upload(path, bytes, { contentType: 'image/jpeg' });
  if (upload.error) throw upload.error;

  const { data: row, error } = await supabase
    .from('profile_photos')
    .insert({ user_id: userId, storage_path: path, position })
    .select('id')
    .single();
  if (error) {
    await supabase.storage.from(PROFILE_BUCKET).remove([path]);
    throw error;
  }

  try {
    return await invokeModeration({ kind: 'profile', photo_id: row.id });
  } catch {
    // 검수 함수에 닿지 못해도 사진은 '검수 대기'로 남습니다. 승인 전에는 남에게 보이지 않습니다.
    return { status: 'pending', reason: 'moderation_unavailable' };
  } finally {
    await queryClient.invalidateQueries({ queryKey: photosKey(userId) });
  }
}

export async function deleteProfilePhoto(photo: ProfilePhoto) {
  await supabase.storage.from(PROFILE_BUCKET).remove([photo.storage_path]);
  const { error } = await supabase.from('profile_photos').delete().eq('id', photo.id);
  if (error) throw error;
  await queryClient.invalidateQueries({ queryKey: photosKey(photo.user_id) });
}

export async function fetchMyPhotos(userId: string): Promise<PhotoWithUrl[]> {
  const { data, error } = await supabase
    .from('profile_photos')
    .select('id, user_id, storage_path, position, moderation_status, moderation_reason')
    .eq('user_id', userId)
    .order('position')
    .order('created_at');
  if (error) throw error;

  const photos = (data ?? []) as ProfilePhoto[];
  // 거절된 사진은 서버가 파일을 지우므로 URL 을 만들지 않습니다.
  const visible = photos.filter((photo) => photo.moderation_status !== 'rejected');
  if (visible.length === 0) return photos.map((photo) => ({ ...photo, url: null }));

  const urlByPath = await signPhotoPaths(visible.map((photo) => photo.storage_path));
  return photos.map((photo) => ({ ...photo, url: urlByPath.get(photo.storage_path) ?? null }));
}

export function useMyPhotos(userId: string | undefined) {
  return useQuery({
    queryKey: photosKey(userId),
    queryFn: () => fetchMyPhotos(userId!),
    enabled: !!userId,
  });
}

/**
 * 인증 셀카 제출. 올린 셀카는 본인도 다시 내려받을 수 없고,
 * 서버가 검증을 마치는 즉시 삭제합니다 (수동 심사 대기 중일 때만 잠시 보관).
 */
export async function submitSelfie(userId: string, uri: string): Promise<ModerationResult> {
  const bytes = await prepareImage(uri, 720);
  const path = `${userId}/${Crypto.randomUUID()}.jpg`;

  const upload = await supabase.storage
    .from(SELFIE_BUCKET)
    .upload(path, bytes, { contentType: 'image/jpeg' });
  if (upload.error) throw upload.error;

  return invokeModeration({ kind: 'selfie', path });
}
