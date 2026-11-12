# Project Specification: 신뢰 기반 취미·동네 매칭 & 실시간 채팅 앱 (Production Ready)

## 1. 프로젝트 개요 (Project Overview)
- **목표:** 취미, 동네 친구, 진지한 연애 등 명확한 목적과 신뢰도 검증(성인 본인인증, 실시간 셀카 및 Sightengine AI 이미지 필터링)을 기반으로 하는 위치 기반 데이팅/소셜 매칭 앱.
- **배포 전략 (One-Source Multi-Use):**
  - 1차: 모바일 웹 및 PWA(Progressive Web App) 빠른 배포 및 베타 테스트 (Vercel / Cloudflare Pages 호스팅)
  - 2차: 동일 코드베이스 기반 iOS App Store 및 Google Play Store 네이티브 앱 정식 출시 (EAS Build)
- **수익화 및 법적 준수:** 개인사업자·통신판매업·위치기반서비스사업 신고 기반의 **혼합형 과금 모델(월정액 구독 + 소모성 인앱 재화)**.

---

## 2. 확정된 기술 스택 (Confirmed Tech Stack)
- **Frontend (Cross-Platform):** React Native with **Expo (Expo Router)** + TypeScript
  - Web(PWA), iOS, Android 단일 코드베이스 유지
  - Styling: NativeWind (Tailwind CSS for React Native)
  - State Management: Zustand + TanStack Query
- **Backend & Database (BaaS):** **Supabase**
  - Auth & 성인 인증: 휴대폰 본인인증(PortOne PASS 연동)을 통한 만 19세 이상 성인 검증 필수
  - Database: PostgreSQL + `PostGIS`(위치 반경) + `pgvector`(AI 성향 임베딩)
  - Realtime Chat: Supabase Realtime (WebSocket)
  - Storage: Supabase Storage (Private Bucket + Signed URL)
  - Edge Functions: Deno 기반 서버리스 함수 (결제 웹훅, OpenAI 임베딩, Sightengine API 연동, 신고 스냅샷 추출)
- **AI & Moderation APIs:**
  - 이미지 유해성 및 AI 생성(딥페이크) 판별: **Sightengine API** (무료 티어 활용)
  - 실시간 셀카 얼굴 일치 검증: 클라이언트/Edge 기반 얼굴 특징 비교 또는 관리자 수동 승인 병행
  - 성향 기반 추천 임베딩: **OpenAI API (`text-embedding-3-small`)**
- **Payments (확정 과금 및 결제):**
  - Web (PWA): **Toss Payments** SDK (신용카드 및 정기 구독 빌링키 발급)
  - Mobile Native (iOS/Android): **RevenueCat** SDK (Apple IAP / Google Play Billing 통합 관리)
- **Analytics & Admin Monitoring:**
  - 행동 분석 및 접속량·체류시간 추적: **PostHog** (`posthog-react-native` 및 웹 SDK 통합)
  - 운영 대시보드: Web 기반 **Admin Page** (`/admin` 라우트)

---

## 3. 법적·저작권 및 스토어 심사 필수 준수사항 (Compliance)
1. **독자적 브랜드 및 용어 사용:** 틴더, 아만다 등의 UI/용어를 모방하지 않고 독자 용어 사용 (Super Like -> `시그널(Signal)`, Boost -> `스포트라이트(Spotlight)`, 재화 -> `하트`).
2. **개인정보 및 위치정보 보호:** 인증 셀카는 얼굴 검증 완료 즉시 영구 파기. 정확한 GPS 좌표는 클라이언트에 노출하지 않고 서버 RPC에서 계산된 근사 거리(`km`)만 반환.
3. **통신비밀보호법 및 채팅 열람 제한:** 
   - 일반 채팅 테이블(`messages`)은 당사자 2명만 조회 가능하도록 DB 레벨(RLS)에서 원천 차단.
   - 운영자(Admin)는 평상시 대화를 볼 수 없으며, 오직 유저가 [신고하기]를 접수하여 `reports` 테이블로 이관된 증거 스냅샷 데이터에 한해서만 관리자 페이지에서 열람 가능.

---

## 4. 데이터베이스 스키마 및 엄격한 RLS 보안 정책 (Database Schema)

```sql
-- 필수 확장 활성화
create extension if not exists postgis;
create extension if not exists vector;

-- 1. 유저 프로필
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  role text default 'user' check (role in ('user', 'admin')),
  nickname text not null,
  gender text check (gender in ('male', 'female')) not null,
  birth_date date not null,
  is_adult_verified boolean default false not null,
  purpose text check (purpose in ('friend', 'hobby', 'serious')) not null,
  hobbies text[] default '{}',
  bio text,
  location geography(Point, 4326),
  neighborhood_name text,
  trust_score numeric(3, 2) default 0.0,
  verification_status text default 'pending' check (verification_status in ('pending', 'approved', 'rejected')),
  embedding vector(1536),
  coin_balance int default 0 not null check (coin_balance >= 0),
  is_premium boolean default false,
  premium_expires_at timestamptz,
  last_active_at timestamptz default now(),
  is_banned boolean default false,
  created_at timestamptz default now()
);

-- 2. 스와이프 및 매칭
create table swipes (
  id uuid default gen_random_uuid() primary key,
  actor_id uuid references profiles(id) on delete cascade not null,
  target_id uuid references profiles(id) on delete cascade not null,
  action text check (action in ('pass', 'like', 'signal')) not null,
  message text,
  created_at timestamptz default now(),
  unique(actor_id, target_id)
);

create table matches (
  id uuid default gen_random_uuid() primary key,
  user_a uuid references profiles(id) on delete cascade not null,
  user_b uuid references profiles(id) on delete cascade not null,
  is_active boolean default true,
  created_at timestamptz default now(),
  unique(user_a, user_b)
);

-- 3. 1:1 채팅 메시지 (당사자 외 열람 절대 불가)
create table messages (
  id uuid default gen_random_uuid() primary key,
  match_id uuid references matches(id) on delete cascade not null,
  sender_id uuid references profiles(id) on delete cascade not null,
  content text not null,
  image_url text,
  is_read boolean default false,
  created_at timestamptz default now()
);

-- 4. 차단 테이블 (Blocks)
create table blocks (
  id uuid default gen_random_uuid() primary key,
  blocker_id uuid references profiles(id) on delete cascade not null,
  blocked_id uuid references profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(blocker_id, blocked_id)
);

-- 5. 신고 테이블 분리 (Reports - 관리자 전용 열람)
create table reports (
  id uuid default gen_random_uuid() primary key,
  reporter_id uuid references profiles(id) on delete set null not null,
  reported_user_id uuid references profiles(id) on delete cascade not null,
  match_id uuid references matches(id) on delete set null,
  reason text not null,
  description text,
  chat_snapshot jsonb, -- 신고 시점 기준 최근 메시지 증거 스냅샷
  status text default 'pending' check (status in ('pending', 'reviewed', 'resolved')),
  admin_note text,
  created_at timestamptz default now()
);

-- 6. 접속 및 체류시간 세션 로그 (Analytics)
create table user_sessions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  platform text check (platform in ('web', 'ios', 'android')),
  started_at timestamptz default now(),
  ended_at timestamptz,
  duration_seconds int default 0
);

-- 7. 재화 원장
create table wallet_transactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  amount int not null,
  type text not null, -- 'purchase', 'signal', 'spotlight', 'bonus'
  reference_id text,
  created_at timestamptz default now()
);

-- RLS 보안 적용
alter table profiles enable row level security;
alter table messages enable row level security;
alter table blocks enable row level security;
alter table reports enable row level security;
alter table user_sessions enable row level security;

create policy "Participants can view own match messages"
on messages for select
using (exists (select 1 from matches where matches.id = messages.match_id and (matches.user_a = auth.uid() or matches.user_b = auth.uid())));

create policy "Participants can insert messages"
on messages for insert
with check (auth.uid() = sender_id and exists (select 1 from matches where matches.id = messages.match_id and matches.is_active = true and (matches.user_a = auth.uid() or matches.user_b = auth.uid())));

create policy "Admins can view reports"
on reports for select
using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));