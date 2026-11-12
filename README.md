# Dating App

신뢰 기반 취미·동네 매칭 & 실시간 채팅 앱. 전체 기획은 [CLAUDE.md](./CLAUDE.md) 참고.

- **앱**: Expo (Expo Router) + TypeScript + NativeWind — Web(PWA) / iOS / Android 단일 코드베이스
- **상태**: Zustand + TanStack Query
- **백엔드**: Supabase (Auth, Postgres + PostGIS + pgvector, Realtime, Storage)
- **분석**: PostHog

## 시작하기

```bash
npm install
```

```bash
cp .env.example .env.local
```

`.env.local` 에 Supabase URL / anon 키(와 선택적으로 PostHog 키)를 채운 뒤:

```bash
npm run web
```

`npm run ios`, `npm run android` 로 네이티브 실행, `npm run build:web` 으로 웹 정적 빌드(`dist/`), `npm run typecheck` 로 타입 검사.

## 데이터베이스

Supabase 대시보드 > SQL Editor 에 [`supabase_migration.sql`](./supabase_migration.sql) 전체를 붙여넣고 한 번 실행합니다.
기획서 스키마에서 보완한 내용은 파일 상단 주석에 정리되어 있습니다.

## 구조

```
src/
  app/          Expo Router 화면 (_layout.tsx, index.tsx)
  lib/          env.ts, supabase.ts, analytics.ts(PostHog), query-client.ts
  providers/    app-providers.tsx (Query + PostHog + 세션 동기화 + 화면 추적)
  stores/       auth-store.ts (Zustand)
supabase_migration.sql
```

## 새 패키지 추가 시

Expo 모듈은 SDK 버전에 맞춰 설치되도록 `npx expo install <패키지>` 를 사용하세요.
