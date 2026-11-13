import { type Href, useRouter } from 'expo-router';
import { Pressable, Text } from 'react-native';

type Props = {
  /** 앞에 붙는 안내 문장 (예: "아직 계정이 없나요?") */
  prompt?: string;
  /** 강조되는 이동 문구 (예: "회원가입") */
  label: string;
  href: Href;
};

/**
 * "아직 계정이 없나요? 회원가입" 처럼 문장 한 줄 전체가 눌리는 이동 링크.
 * 글자 한 단어만 눌리면 휴대폰에서 맞추기 어려워서, 줄 전체를 높이 48 이상의 누름 영역으로 만듭니다.
 */
export function TextLink({ prompt, label, href }: Props) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={prompt ? `${prompt} ${label}` : label}
      onPress={() => router.replace(href)}
      hitSlop={8}
      className="min-h-12 flex-row items-center justify-center gap-1 rounded-2xl px-4 active:bg-field">
      {prompt ? <Text className="text-base text-muted">{prompt}</Text> : null}
      <Text className="text-base font-semibold text-brand-600">{label}</Text>
    </Pressable>
  );
}
