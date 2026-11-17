import { Image } from 'expo-image';

const LOGO = require('../../../assets/images/logo.png');

/** 앱 로고 (모먼트). 로그인·회원가입 화면 맨 위에 씁니다. */
export function BrandLogo({ size = 112 }: { size?: number }) {
  return (
    <Image
      source={LOGO}
      accessibilityLabel="모먼트"
      contentFit="cover"
      style={{ width: size, height: size, borderRadius: size * 0.22, alignSelf: 'center' }}
    />
  );
}
