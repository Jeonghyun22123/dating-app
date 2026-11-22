import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { useMatches } from '@/features/chat/api';
import { photoSource, useMyPhotos } from '@/features/photos/api';
import { useReceivedSignals } from '@/features/signals/api';
import { useTrustBreakdown } from '@/features/trust/trust-card';
import { useWallet } from '@/features/wallet/api';

import { beginWarm, endWarm } from './store';

/** 사진을 받는 데 이 시간을 넘기면 기다리지 않고 표지를 걷습니다 (표지의 최대 5초 안에서). */
const IMAGE_WAIT_MS = 2500;
/** 목록이 아주 길어도 미리 받는 사진은 이 개수까지만 */
const MAX_WARM_IMAGES = 24;

/**
 * 앱을 켤 때 표지(로고 화면)가 떠 있는 동안, 둘러보기 말고 다른 탭에서 쓸 것들을 뒤에서 미리 받아 둡니다.
 *  - 채팅 탭: 대화 목록, 받은 시그널과 상대 사진
 *  - 내 프로필 탭: 내 사진, 신뢰 점수, 하트 잔액
 *  - 두 탭의 화면 코드 (웹)
 * 화면에서 쓰는 것과 같은 조회(캐시)를 먼저 실행하는 것이라, 탭을 처음 눌러도 바로 보입니다.
 * 사진은 보이지 않는 작은 이미지로 한 번 불러 두어, 화면에서 쓰는 것과 같은 기기 캐시에 저장합니다.
 * 이 일이 끝나거나 시간이 다 되면 표지를 걷도록 알립니다.
 */
export function WarmTabs({ userId }: { userId: string }) {
  const router = useRouter();
  // 웹은 탭마다 화면 코드가 따로 나뉘어 있어서, 처음 누를 때 그 파일을 받느라 늦습니다. 미리 받아 둡니다.
  useEffect(() => {
    try {
      router.prefetch('/matches');
      router.prefetch('/profile');
    } catch {
      // 미리 받기 실패는 무시합니다 (탭을 누를 때 받으면 됩니다).
    }
  }, [router]);

  const matches = useMatches();
  const signals = useReceivedSignals();
  const photos = useMyPhotos(userId);
  const trust = useTrustBreakdown(userId);
  const wallet = useWallet();

  const dataDone = [matches, signals, photos, trust, wallet].every((q) => !q.isPending);

  // 한 번 시작하면 끝까지: 도중에 데이터가 바뀌어도 기다림이 다시 늘어나지 않게 처음 받은 목록만 씁니다.
  const [urls, setUrls] = useState<string[] | null>(null);
  useEffect(() => {
    if (!dataDone || urls) return;
    const found = [
      ...(photos.data ?? []).map((photo) => photo.url),
      ...(matches.data ?? []).map((match) => match.photoUrl),
      ...(signals.data ?? []).map((signal) => signal.photoUrl),
    ].filter((url): url is string => !!url);
    setUrls([...new Set(found)].slice(0, MAX_WARM_IMAGES));
  }, [dataDone, urls, photos.data, matches.data, signals.data]);

  const [settled, setSettled] = useState(0);
  const imagesDone = urls !== null && settled >= urls.length;

  useEffect(() => {
    beginWarm();
    // 어떤 이유로든 오래 걸리면 표지가 영원히 붙잡히지 않게 합니다.
    const timer = setTimeout(endWarm, 4000);
    return () => {
      clearTimeout(timer);
      endWarm();
    };
  }, []);

  useEffect(() => {
    if (imagesDone) {
      endWarm();
      return;
    }
    if (urls === null) return;
    const timer = setTimeout(endWarm, IMAGE_WAIT_MS);
    return () => clearTimeout(timer);
  }, [imagesDone, urls]);

  const sources = useMemo(() => (urls ?? []).map((url) => ({ url, source: photoSource(url) })), [urls]);
  if (sources.length === 0) return null;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' }}>
      {sources.map(({ url, source }) => (
        <Image
          key={url}
          source={source}
          style={{ width: 1, height: 1 }}
          onLoad={() => setSettled((count) => count + 1)}
          onError={() => setSettled((count) => count + 1)}
        />
      ))}
    </View>
  );
}
