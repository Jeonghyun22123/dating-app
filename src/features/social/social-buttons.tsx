import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import {
  PROVIDER_LABEL,
  signInWithProvider,
  socialSupported,
  takeOAuthError,
  useEnabledProviders,
  type SocialProvider,
} from './api';

/**
 * 버튼 모양은 각 회사의 로그인 버튼 안내를 따릅니다.
 *   카카오: 노란 바탕(#FEE500) + 검은 글자 · 구글: 흰 바탕 + 테두리
 * 테마(다크 등)와 상관없이 같은 색을 씁니다.
 */
const STYLE: Record<
  SocialProvider,
  { container: string; text: string; icon: keyof typeof Ionicons.glyphMap; iconColor: string }
> = {
  kakao: { container: 'bg-[#FEE500]', text: 'text-black/85', icon: 'chatbubble', iconColor: '#000000' },
  google: {
    container: 'border border-neutral-300 bg-white',
    text: 'text-neutral-800',
    icon: 'logo-google',
    iconColor: '#4285F4',
  },
};

/** 로그인·회원가입 화면의 간편가입 버튼 묶음. 켜진 방식이 없으면 아무것도 그리지 않습니다. */
export function SocialButtons() {
  const { data: providers } = useEnabledProviders();
  const [pending, setPending] = useState<SocialProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 간편 로그인에 실패하고 돌아온 경우 안내를 띄웁니다.
  useEffect(() => {
    const message = takeOAuthError();
    if (message) setError(message);
  }, []);

  if (!socialSupported || !providers || providers.length === 0) {
    return error ? <Text className="text-sm text-red-600">{error}</Text> : null;
  }

  async function start(provider: SocialProvider) {
    setError(null);
    setPending(provider);
    try {
      // 성공하면 구글·카카오 페이지로 이동하므로 이 화면은 여기서 끝납니다.
      await signInWithProvider(provider);
    } catch {
      setError('간편 로그인을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.');
      setPending(null);
    }
  }

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-3">
        <View className="h-px flex-1 bg-line" />
        <Text className="text-sm text-subtle">또는</Text>
        <View className="h-px flex-1 bg-line" />
      </View>
      {providers.map((provider) => {
        const style = STYLE[provider];
        return (
          <Pressable
            key={provider}
            accessibilityRole="button"
            accessibilityLabel={`${PROVIDER_LABEL[provider]}로 시작하기`}
            accessibilityState={{ disabled: pending !== null, busy: pending === provider }}
            aria-disabled={pending !== null}
            disabled={pending !== null}
            onPress={() => start(provider)}
            className={`h-14 flex-row items-center justify-center gap-2 rounded-2xl ${style.container} ${pending !== null && pending !== provider ? 'opacity-50' : ''}`}>
            {pending === provider ? (
              <ActivityIndicator color="#525252" />
            ) : (
              <>
                <Ionicons name={style.icon} size={20} color={style.iconColor} />
                <Text className={`text-base font-semibold ${style.text}`}>
                  {PROVIDER_LABEL[provider]}로 시작하기
                </Text>
              </>
            )}
          </Pressable>
        );
      })}
      {error ? <Text className="text-sm text-red-600">{error}</Text> : null}
    </View>
  );
}
