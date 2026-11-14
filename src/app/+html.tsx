import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

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
        {/* 휴대폰에서 확대·축소 없이 화면 폭에 맞추고, 노치 영역까지 쓰기 */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <title>Dating App</title>
        <meta name="description" content="취미와 동네로 만나는 신뢰 기반 만남" />
        <meta name="theme-color" content="#f43f5e" />
        <link rel="manifest" href="/manifest.webmanifest" />
        {/* iOS 홈 화면 추가용 */}
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Dating App" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        {/* 화면 전체 스크롤 대신 앱 안의 스크롤만 쓰도록 맞춥니다 (Expo 기본 설정) */}
        <ScrollViewStyleReset />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
