import { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { readViewportInfo } from '@/theme/ios-viewport';

import { ActionButton, Card } from './parts';

/** 관리자 > 설정: 화면 높이·여백 진단 (아이폰 홈 화면 앱의 화면 밀림 확인용, 임시) */
export function ViewportDebugSection() {
  const insets = useSafeAreaInsets();
  const [info, setInfo] = useState(() => readViewportInfo());
  useEffect(() => {
    const timer = setInterval(() => setInfo(readViewportInfo()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (Platform.OS !== 'web' || !info) return null;
  const rows: [string, string][] = [
    ['홈 화면 앱', info.standalone ? '예' : '아니오'],
    ['버전', '시계 줄 black'],
    ['화면 높이 (screen)', String(info.screenHeight)],
    ['보이는 높이 (inner)', String(info.innerHeight)],
    ['문서 높이 (client)', String(info.clientHeight)],
    ['visualViewport', `${info.visualHeight ?? '-'} / 위 ${info.visualOffsetTop ?? '-'}`],
    ['스크롤', String(info.scrollY)],
    ['env 위/아래', `${info.envTop} / ${info.envBottom}`],
    ['앱 여백 위/아래', `${insets.top} / ${insets.bottom}`],
    ['앱 영역 위치/높이', `${info.rootTop} / ${info.rootHeight}`],
  ];
  return (
    <Card>
      <Text className="text-base font-semibold text-fg">화면 진단 (임시)</Text>
      <Text className="text-sm leading-5 text-muted">
        아이폰 홈 화면 앱에서 이 화면을 캡처해 보내 주세요. 화면이 밀리는 원인을 찾는 데 씁니다.
      </Text>
      <View className="gap-1">
        {rows.map(([label, value]) => (
          <View key={label} className="flex-row justify-between gap-3">
            <Text className="text-sm text-muted">{label}</Text>
            <Text className="text-sm font-semibold text-fg">{value}</Text>
          </View>
        ))}
      </View>
      <Text selectable className="text-xs leading-4 text-subtle">
        {info.userAgent}
      </Text>
      <View className="flex-row justify-end">
        <ActionButton title="새로 읽기" onPress={() => setInfo(readViewportInfo())} />
      </View>
    </Card>
  );
}
