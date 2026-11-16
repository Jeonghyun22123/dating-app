import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';

import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';

/** 행정동(읍·면·동) 하나. 서버의 regions 표와 같은 코드(10자리)를 씁니다. */
export type Region = { code: string; sido: string; sigungu: string; dong: string };

export type Coords = { latitude: number; longitude: number };

/** 동네 경계 데이터 파일 (관리자가 한 번 불러오면 DB 에 저장됩니다). */
export const REGION_DATA_URL = '/data/regions-20261001.json';

/** 출처 표시 (CC BY 4.0 · 공공누리 제1유형 조건) */
export const REGION_DATA_CREDIT =
  '행정동 경계: 통계청 통계지리정보서비스(SGIS) 공공누리 제1유형 자료를 가공한 vuski/admdongkor (CC BY 4.0)';

export const fullName = (region: Region) => `${region.sido} ${region.sigungu} ${region.dong}`;

/** 전국 동네 목록. 거의 바뀌지 않으므로 한 번 받아 두고 계속 씁니다. */
export function useRegionList() {
  return useQuery({
    queryKey: ['regions'],
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async (): Promise<Region[]> => {
      const { data, error } = await supabase.rpc('region_list');
      if (error) throw error;
      return ((data ?? []) as [string, string, string, string][]).map(([code, sido, sigungu, dong]) => ({
        code,
        sido,
        sigungu,
        dong,
      }));
    },
  });
}

export class LocationPermissionError extends Error {}

/** 지금 GPS 위치. 위치는 동네 판정에만 쓰고 서버에 저장하지 않습니다. */
export async function getCurrentCoords(): Promise<Coords> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) throw new LocationPermissionError();
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { latitude: position.coords.latitude, longitude: position.coords.longitude };
}

/** 좌표가 속한 동네 (못 찾으면 null) */
export async function regionAt(coords: Coords): Promise<Region | null> {
  const { data, error } = await supabase.rpc('region_at', {
    p_lat: coords.latitude,
    p_lng: coords.longitude,
  });
  if (error) throw error;
  return (data as Region | null) ?? null;
}

/**
 * 동네 저장. 서버가 지금 위치(coords)가 고른 동네 안(또는 바로 붙은 이웃 동)인지 확인한 뒤에만 저장합니다.
 * 관리자는 coords 없이도 저장할 수 있습니다 (테스트용).
 * 실패하면 화면에 그대로 보여줄 수 있는 한글 메시지를 담은 오류를 던집니다.
 */
export async function setMyRegion(userId: string, code: string, coords?: Coords) {
  const { error } = await supabase.rpc('set_my_region', {
    p_code: code,
    p_lat: coords?.latitude ?? null,
    p_lng: coords?.longitude ?? null,
  });
  if (error) throw error;
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['profile', userId] }),
    // 거리 기준이 바뀌었으므로 추천 목록을 새로 받아옵니다.
    queryClient.invalidateQueries({ queryKey: ['discover'] }),
  ]);
}

// ---------------------------------------------------------------------
// 관리자: 동네 경계 데이터 불러오기
// ---------------------------------------------------------------------
export function useRegionCount() {
  return useQuery({
    queryKey: ['admin', 'region-count'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_region_count');
      if (error) throw error;
      return data as number;
    },
  });
}

/** 경계 파일을 받아 약 300KB 씩 나눠 서버에 넣습니다. onProgress(완료한 동네 수, 전체) */
export async function importRegions(onProgress: (done: number, total: number) => void) {
  const response = await fetch(REGION_DATA_URL);
  if (!response.ok) throw new Error('동네 데이터 파일을 받지 못했어요.');
  const rows = (await response.json()) as { c: string }[];

  const batches: (typeof rows)[] = [];
  let batch: typeof rows = [];
  let size = 0;
  for (const row of rows) {
    const length = JSON.stringify(row).length;
    if (batch.length && size + length > 300_000) {
      batches.push(batch);
      batch = [];
      size = 0;
    }
    batch.push(row);
    size += length;
  }
  if (batch.length) batches.push(batch);

  let done = 0;
  onProgress(0, rows.length);
  for (const part of batches) {
    const { error } = await supabase.rpc('admin_import_regions', { p_rows: part });
    if (error) throw error;
    done += part.length;
    onProgress(done, rows.length);
  }
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['regions'] }),
    queryClient.invalidateQueries({ queryKey: ['admin', 'region-count'] }),
  ]);
  return rows.length;
}
