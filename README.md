# Dating App

신뢰 기반 취미·동네 매칭 & 실시간 채팅 앱. 전체 기획은 [CLAUDE.md](./CLAUDE.md), 진행 상황과 다음 단계는 [ROADMAP.md](./ROADMAP.md) 참고.

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

### Phase 2 (온보딩 · 사진 · 셀카 인증)

1. SQL Editor 에 [`supabase_phase2.sql`](./supabase_phase2.sql) 전체를 붙여넣고 실행 (Storage 버킷 2개 포함)
2. Edge Function 2개 배포 (프로젝트 ref 는 대시보드 주소 `supabase.com/dashboard/project/<ref>` 에서 확인)

```bash
npx supabase login
```

```bash
npx supabase link --project-ref <ref>
```

```bash
npx supabase functions deploy moderate-photo update-profile-embedding
```

3. (선택) API 키 등록 — 없으면 사진 검수는 테스트 모드로 통과, 임베딩은 건너뜁니다. 항목은 [`supabase/functions/.env.example`](./supabase/functions/.env.example) 참고.

```bash
npx supabase secrets set SIGHTENGINE_API_USER=... SIGHTENGINE_API_SECRET=... OPENAI_API_KEY=...
```

### Phase 3 (추천 · 매칭 · 채팅)

1. SQL Editor 에 [`supabase_phase3.sql`](./supabase_phase3.sql) 전체를 붙여넣고 실행
2. (개발용) 혼자 테스트하려면 [`supabase_seed_test_users.sql`](./supabase_seed_test_users.sql) 로 가짜 프로필 8명 생성.
   내 위치 근처에 만들어지며, 그중 4명은 나에게 이미 관심을 보낸 상태라 바로 매칭을 확인할 수 있습니다.
   지울 때는 파일 맨 아래 "정리" 쿼리를 실행하세요.

### Phase 4 (관리자 페이지)

1. SQL Editor 에 [`supabase_phase4.sql`](./supabase_phase4.sql) 전체를 붙여넣고 실행
2. Edge Function 추가 배포

```bash
npx supabase functions deploy admin-review-selfie --use-api
```

3. 내 계정을 관리자로 지정 (SQL Editor 에서 이메일을 바꿔 실행)

```sql
update profiles set role = 'admin'
where id = (select id from auth.users where email = 'you@example.com');
```

4. 앱에서 새로고침 → 내 프로필 탭의 "관리자 페이지" 버튼 또는 주소 `/admin`

## 구조

```
src/
  app/            sign-in, sign-up, onboarding, admin, (app)/(tabs)/{index,matches,profile}, (app)/chat/[matchId], (app)/selfie
                  _layout.tsx 가 로그인·온보딩 상태로 접근 제어
  components/ui/  Button, TextField, Chip, Screen, Avatar
  features/
    identity/     성인 검증 로직(adult-verification.ts), 본인확인 수단 경계(identity-provider.ts)
    onboarding/   온보딩 단계 화면 (기본 정보 → 프로필 → 동네 → 사진 → 셀카 → 완료)
    profile/      프로필 조회·저장·위치·임베딩 요청
    photos/       사진 선택·압축·업로드·검수 요청, 셀카 제출
    discover/     추천 목록, 관심 표현/넘기기
    chat/         매칭 목록, 메시지, 실시간 구독
    safety/       신고·차단·매칭 해제 시트
    admin/        관리자 페이지 (통계, 셀카 심사, 신고, 회원)
  lib/            env, supabase, auth, analytics(PostHog), query-client
  providers/      app-providers.tsx
  stores/         auth-store, onboarding-store (Zustand)
supabase/functions/
  moderate-photo/             Sightengine 사진·셀카 검수
  update-profile-embedding/   OpenAI 임베딩 → profiles.embedding
  admin-review-selfie/        셀카 승인·반려 + 셀카 파일 영구 삭제
supabase_migration.sql        Phase 1 스키마
supabase_phase2.sql           Phase 2 스키마 + Storage
supabase_phase3.sql           Phase 3 추천·매칭·채팅 함수
supabase_phase4.sql           Phase 4 관리자 함수 + 작업 기록
supabase_seed_test_users.sql  개발용 가짜 프로필
```

## 새 패키지 추가 시

Expo 모듈은 SDK 버전에 맞춰 설치되도록 `npx expo install <패키지>` 를 사용하세요.
