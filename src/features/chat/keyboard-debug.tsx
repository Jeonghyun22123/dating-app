import { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * 임시 진단 (관리자 전용): 채팅 입력 중 키보드와 입력창 사이 공백의 원인을 찾기 위한 숫자.
 * 입력창에 커서가 있는 동안만 화면 위쪽에 보입니다.
 */
export function KeyboardDebug({ barTestId }: { barTestId: string }) {
  const insets = useSafeAreaInsets();
  const [info, setInfo] = useState<string[] | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const read = () => {
      const active = document.activeElement;
      const typing = !!active && ['INPUT', 'TEXTAREA'].includes(active.tagName);
      if (!typing) return setInfo(null);
      const viewport = window.visualViewport;
      const bar = document
        .querySelector<HTMLElement>(`[data-testid="${barTestId}"]`)
        ?.getBoundingClientRect();
      const root = document.getElementById('root')?.getBoundingClientRect();
      setInfo([
        `inner ${window.innerHeight} / screen ${window.screen.height}`,
        `vv ${Math.round(viewport?.height ?? 0)} top ${Math.round(viewport?.offsetTop ?? 0)} / scroll ${Math.round(window.scrollY)}`,
        `입력줄 위 ${Math.round(bar?.top ?? 0)} 아래 ${Math.round(bar?.bottom ?? 0)}`,
        `앱영역 위 ${Math.round(root?.top ?? 0)} 높이 ${Math.round(root?.height ?? 0)}`,
        `여백 위 ${insets.top} 아래 ${insets.bottom}`,
      ]);
    };
    read();
    const timer = setInterval(read, 400);
    document.addEventListener('focusin', read);
    document.addEventListener('focusout', read);
    return () => {
      clearInterval(timer);
      document.removeEventListener('focusin', read);
      document.removeEventListener('focusout', read);
    };
  }, [barTestId, insets.bottom, insets.top]);
  if (!info) return null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 70,
        left: 8,
        zIndex: 50,
        backgroundColor: 'rgba(0,0,0,0.75)',
        padding: 6,
        borderRadius: 8,
      }}>
      <Text
        style={{
          color: '#fff',
          fontSize: 11,
          lineHeight: 15,
        }}>{`키보드 진단(임시)\n${info.join('\n')}`}</Text>
    </View>
  );
}
