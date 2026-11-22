import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

import { BootSplash, BootSplashHead } from '@/features/splash/boot-splash';

/**
 * 웹(PWA) 전용 HTML 틀. 정적 빌드 때 모든 페이지의 <head> 에 들어갑니다.
 * 홈 화면에 추가했을 때 앱처럼 열리도록 매니페스트와 아이콘을 연결합니다.
 * (앱 이름을 바꾸면 public/manifest.webmanifest 와 아래 title 도 함께 바꾸세요)
 *
 * headNodes · bodyNodes 는 Expo 가 넣어주는 스크립트와 스타일입니다. 빠뜨리면 앱이 실행되지 않습니다.
 */
export default function Root({ children }: PropsWithChildren) {
  const { bodyAttributes, bodyNodes, htmlAttributes, headNodes } = useServerDocumentContext();
  return (
    <html {...htmlAttributes} lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* 휴대폰에서 확대·축소 없이 화면 폭에 맞추고, 노치 영역까지 쓰기.
            interactive-widget=resizes-content: 키보드가 열리면 화면을 밀어 올리지 않고 화면 크기를 줄입니다
            (지원하지 않는 브라우저는 무시합니다). 채팅 입력창이 키보드와 함께 움직이게 하려는 시도입니다. */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover, interactive-widget=resizes-content"
        />
        <title>모먼트</title>
        <meta name="description" content="취미와 동네로 만나는 신뢰 기반 만남" />
        {/* 위쪽 줄 색. 앱이 켜지면 테마에 맞게 바꿉니다 (theme/use-web-status-bar.ts) */}
        <meta name="theme-color" content="#111113" />
        <link rel="manifest" href="/manifest.webmanifest" />
        {/* iOS 홈 화면 추가용 */}
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="모먼트" />
        {/* 시계 줄을 검은 바탕으로 두고 앱은 그 아래부터 그립니다.
            "black-translucent"(투명)는 iOS 26 홈 화면 앱에서 화면 높이를 시계 줄만큼 짧게 잡으면서
            맨 위부터 그려, 아래에 칠할 수 없는 빈 띠가 생깁니다 (실기기 진단: 화면 852, 보이는 높이 793). */}
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />
        {/* 앱이 그려지기 전에 흰 화면이 번쩍이지 않도록 */}
        <style>{'html, body { background-color: #111113; }'}</style>
        {/* 화면 전체 스크롤 대신 앱 안의 스크롤만 쓰도록 맞춥니다 (Expo 기본 설정) */}
        <BootSplashHead />
        <ScrollViewStyleReset />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {/* 앱을 처음 켤 때 보이는 로고 표지 (준비되면 SplashCover 가 걷어 냄) */}
        <BootSplash />
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
