-- =====================================================================
-- Dating App · Phase 1 초기 마이그레이션
-- 사용법: Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 한 번 실행하세요.
--         (새 프로젝트 기준. 전체가 하나의 트랜잭션이라 중간에 실패하면 아무 것도 적용되지 않습니다)
--
-- CLAUDE.md 의 스키마를 그대로 옮기되, 그대로 두면 문제가 되는 부분을 보완했습니다.
-- 보완한 곳에는 [보완] 표시를 달았습니다. 요약:
--   1. swipes / matches / wallet_transactions 에도 RLS 적용 (원문은 누구나 읽고 쓸 수 있는 상태)
--   2. profiles / blocks / user_sessions 정책 추가 (원문은 RLS만 켜져 있어 앱에서 전혀 접근 불가)
--   3. 타인 프로필은 public_profiles 뷰로만 조회 (좌표·생년월일·재화·임베딩 비노출)
--   4. role, coin_balance, is_premium 등 민감 컬럼은 클라이언트가 수정 불가
--   5. reports.reporter_id 의 "on delete set null not null" 모순 수정
--   6. 신고 채팅 스냅샷을 서버 트리거가 생성 (클라이언트 위조 불가)
--   7. 서로 좋아요 시 자동 매칭, 차단 시 매칭 비활성화 트리거
-- =====================================================================

begin;

-- 필수 확장 활성화
create extension if not exists postgis;
create extension if not exists vector;

-- ---------------------------------------------------------------------
-- 1. 유저 프로필
-- ---------------------------------------------------------------------
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  role text default 'user' not null check (role in ('user', 'admin')),
  nickname text not null check (char_length(nickname) between 2 and 20),
  gender text check (gender in ('male', 'female')) not null,
  birth_date date not null,
  is_adult_verified boolean default false not null,
  purpose text check (purpose in ('friend', 'hobby', 'serious')) not null,
  hobbies text[] default '{}',
  bio text check (char_length(bio) <= 500),
  location geography(Point, 4326),
  neighborhood_name text,
  trust_score numeric(3, 2) default 0.0,
  verification_status text default 'pending' check (verification_status in ('pending', 'approved', 'rejected')),
  embedding vector(1536),
  coin_balance int default 0 not null check (coin_balance >= 0),
  is_premium boolean default false,
  premium_expires_at timestamptz,
  last_active_at timestamptz default now(),
  is_banned boolean default false not null,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------
-- 2. 스와이프 및 매칭
-- ---------------------------------------------------------------------
create table swipes (
  id uuid default gen_random_uuid() primary key,
  actor_id uuid references profiles(id) on delete cascade not null,
  target_id uuid references profiles(id) on delete cascade not null,
  action text check (action in ('pass', 'like', 'signal')) not null,
  message text check (char_length(message) <= 200),
  created_at timestamptz default now(),
  unique(actor_id, target_id),
  check (actor_id <> target_id) -- [보완] 자기 자신 스와이프 방지
);

create table matches (
  id uuid default gen_random_uuid() primary key,
  user_a uuid references profiles(id) on delete cascade not null,
  user_b uuid references profiles(id) on delete cascade not null,
  is_active boolean default true not null,
  created_at timestamptz default now(),
  unique(user_a, user_b),
  -- [보완] 항상 user_a < user_b 로 저장해야 (A,B)와 (B,A)가 중복으로 생기지 않습니다.
  check (user_a < user_b)
);

-- ---------------------------------------------------------------------
-- 3. 1:1 채팅 메시지 (당사자 외 열람 절대 불가)
-- ---------------------------------------------------------------------
create table messages (
  id uuid default gen_random_uuid() primary key,
  match_id uuid references matches(id) on delete cascade not null,
  sender_id uuid references profiles(id) on delete cascade not null,
  content text not null check (char_length(content) between 1 and 2000),
  image_url text,
  is_read boolean default false,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------
-- 4. 차단 테이블 (Blocks)
-- ---------------------------------------------------------------------
create table blocks (
  id uuid default gen_random_uuid() primary key,
  blocker_id uuid references profiles(id) on delete cascade not null,
  blocked_id uuid references profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- ---------------------------------------------------------------------
-- 5. 신고 테이블 분리 (Reports - 관리자 전용 열람)
-- ---------------------------------------------------------------------
create table reports (
  id uuid default gen_random_uuid() primary key,
  -- [보완] 원문은 "on delete set null not null" 이라 신고자가 탈퇴하면 삭제가 실패합니다.
  --        신고자가 탈퇴해도 신고 기록은 남도록 null 을 허용했습니다.
  reporter_id uuid references profiles(id) on delete set null,
  reported_user_id uuid references profiles(id) on delete cascade not null,
  match_id uuid references matches(id) on delete set null,
  reason text not null,
  description text check (char_length(description) <= 1000),
  chat_snapshot jsonb, -- 신고 시점 기준 최근 메시지 증거 스냅샷 (서버 트리거가 채움)
  status text default 'pending' not null check (status in ('pending', 'reviewed', 'resolved')),
  admin_note text,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------
-- 6. 접속 및 체류시간 세션 로그 (Analytics)
-- ---------------------------------------------------------------------
create table user_sessions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  platform text check (platform in ('web', 'ios', 'android')),
  started_at timestamptz default now(),
  ended_at timestamptz,
  duration_seconds int default 0
);

-- ---------------------------------------------------------------------
-- 7. 재화 원장
-- ---------------------------------------------------------------------
create table wallet_transactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  amount int not null,
  type text not null, -- 'purchase', 'signal', 'spotlight', 'bonus'
  reference_id text,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------
-- 인덱스 [보완]
-- ---------------------------------------------------------------------
create index profiles_location_idx on profiles using gist (location);
create index profiles_embedding_idx on profiles using hnsw (embedding vector_cosine_ops);
create index swipes_target_idx on swipes (target_id, action);
create index matches_user_b_idx on matches (user_b);
create index messages_match_created_idx on messages (match_id, created_at desc);
create index blocks_blocked_idx on blocks (blocked_id);
create index reports_status_idx on reports (status, created_at desc);
create index user_sessions_user_idx on user_sessions (user_id, started_at desc);
create index wallet_transactions_user_idx on wallet_transactions (user_id, created_at desc);
-- 결제 웹훅이 두 번 와도 재화가 중복 지급되지 않도록 합니다.
create unique index wallet_transactions_reference_idx
  on wallet_transactions (type, reference_id) where reference_id is not null;

-- =====================================================================
-- 보조 함수
-- =====================================================================

-- 관리자 여부. profiles 정책 안에서 profiles 를 다시 조회하면 무한 재귀가 나므로
-- RLS 를 우회하는 security definer 함수로 분리합니다.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin' and not is_banned
  );
$$;

-- 두 사용자 사이에 (어느 방향이든) 차단이 있는지
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

-- 정지되지 않은 본인 계정인지 (쓰기 정책에서 사용)
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = auth.uid() and not is_banned);
$$;

-- =====================================================================
-- 트리거
-- =====================================================================

-- 서로 like/signal 이면 자동으로 매칭 생성
create or replace function public.handle_new_swipe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.action in ('like', 'signal')
     and exists (
       select 1 from swipes
       where actor_id = new.target_id
         and target_id = new.actor_id
         and action in ('like', 'signal')
     )
     and not is_blocked_between(new.actor_id, new.target_id)
  then
    insert into matches (user_a, user_b)
    values (least(new.actor_id, new.target_id), greatest(new.actor_id, new.target_id))
    on conflict (user_a, user_b) do nothing;
  end if;
  return new;
end;
$$;

create trigger on_swipe_created
  after insert on swipes
  for each row execute function public.handle_new_swipe();

-- 차단하면 기존 매칭을 비활성화 (이후 메시지 전송 불가)
create or replace function public.handle_new_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update matches
  set is_active = false
  where user_a = least(new.blocker_id, new.blocked_id)
    and user_b = greatest(new.blocker_id, new.blocked_id);
  return new;
end;
$$;

create trigger on_block_created
  after insert on blocks
  for each row execute function public.handle_new_block();

-- 신고 접수 시 서버가 직접 최근 메시지 50개를 스냅샷으로 복사.
-- 클라이언트가 보낸 chat_snapshot 값은 무시하므로 증거를 위조할 수 없고,
-- 신고자가 해당 대화의 당사자일 때만 복사됩니다.
create or replace function public.handle_new_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.chat_snapshot := null;
  new.status := 'pending';
  new.admin_note := null;

  if new.match_id is not null then
    if not exists (
      select 1 from matches m
      where m.id = new.match_id
        and new.reporter_id in (m.user_a, m.user_b)
        and new.reported_user_id in (m.user_a, m.user_b)
    ) then
      raise exception '신고자와 피신고자가 해당 대화의 당사자가 아닙니다.';
    end if;

    select jsonb_agg(
             jsonb_build_object(
               'id', s.id,
               'sender_id', s.sender_id,
               'content', s.content,
               'image_url', s.image_url,
               'created_at', s.created_at
             )
             order by s.created_at
           )
    into new.chat_snapshot
    from (
      select id, sender_id, content, image_url, created_at
      from messages
      where match_id = new.match_id
      order by created_at desc
      limit 50
    ) s;
  end if;

  return new;
end;
$$;

create trigger on_report_created
  before insert on reports
  for each row execute function public.handle_new_report();

-- =====================================================================
-- 권한 (컬럼 단위) [보완]
-- RLS 는 "어떤 행"만 제한하므로, "어떤 컬럼"을 건드릴 수 있는지는 grant 로 제한합니다.
-- =====================================================================
revoke all on profiles, swipes, matches, messages, blocks, reports, user_sessions, wallet_transactions
  from anon, authenticated;

-- profiles: 본인 행 조회 가능. 가입 시/수정 시 건드릴 수 있는 컬럼만 허용.
-- role, is_adult_verified, trust_score, verification_status, embedding, coin_balance,
-- is_premium, premium_expires_at, is_banned 은 서버(Edge Function, service_role)만 변경합니다.
grant select on profiles to authenticated;
grant insert (id, nickname, gender, birth_date, purpose, hobbies, bio, location, neighborhood_name)
  on profiles to authenticated;
grant update (nickname, purpose, hobbies, bio, location, neighborhood_name, last_active_at)
  on profiles to authenticated;

grant select, insert on swipes to authenticated;
grant select on matches to authenticated;
grant select, insert on messages to authenticated;
grant update (is_read) on messages to authenticated;
grant select, insert, delete on blocks to authenticated;
grant select on reports to authenticated;
grant insert (reporter_id, reported_user_id, match_id, reason, description) on reports to authenticated;
grant update (status, admin_note) on reports to authenticated;
grant select, insert on user_sessions to authenticated;
grant update (ended_at, duration_seconds) on user_sessions to authenticated;
grant select on wallet_transactions to authenticated;

-- =====================================================================
-- RLS 보안 적용
-- =====================================================================
alter table profiles enable row level security;
alter table swipes enable row level security;               -- [보완]
alter table matches enable row level security;              -- [보완]
alter table messages enable row level security;
alter table blocks enable row level security;
alter table reports enable row level security;
alter table user_sessions enable row level security;
alter table wallet_transactions enable row level security;  -- [보완]

-- ---- profiles ----
-- 테이블 직접 조회는 본인 행(과 관리자)만. 타인 프로필은 아래 public_profiles 뷰로 조회합니다.
create policy "Users can view own profile"
on profiles for select to authenticated
using (id = auth.uid() or is_admin());

create policy "Users can create own profile"
on profiles for insert to authenticated
with check (id = auth.uid());

create policy "Users can update own profile"
on profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- ---- swipes ----
create policy "Users can view own swipes"
on swipes for select to authenticated
using (actor_id = auth.uid());

-- signal 은 하트를 차감해야 하므로 직접 insert 를 막고, 추후 서버 함수(RPC)로만 보냅니다.
create policy "Users can swipe"
on swipes for insert to authenticated
with check (
  actor_id = auth.uid()
  and action in ('pass', 'like')
  and message is null
  and is_active_user()
  and not is_blocked_between(actor_id, target_id)
);

-- ---- matches ---- (생성/비활성화는 트리거와 서버만)
create policy "Participants can view own matches"
on matches for select to authenticated
using (user_a = auth.uid() or user_b = auth.uid());

-- ---- messages ----
create policy "Participants can view own match messages"
on messages for select to authenticated
using (exists (select 1 from matches where matches.id = messages.match_id and (matches.user_a = auth.uid() or matches.user_b = auth.uid())));

create policy "Participants can insert messages"
on messages for insert to authenticated
with check (auth.uid() = sender_id and is_active_user() and exists (select 1 from matches where matches.id = messages.match_id and matches.is_active = true and (matches.user_a = auth.uid() or matches.user_b = auth.uid())));

-- 받은 메시지의 읽음 표시만 변경 가능 (컬럼 grant 로 is_read 만 허용됨)
create policy "Recipients can mark messages read"
on messages for update to authenticated
using (sender_id <> auth.uid() and exists (select 1 from matches where matches.id = messages.match_id and (matches.user_a = auth.uid() or matches.user_b = auth.uid())))
with check (sender_id <> auth.uid());

-- ---- blocks ----
create policy "Users can view own blocks"
on blocks for select to authenticated
using (blocker_id = auth.uid());

create policy "Users can block"
on blocks for insert to authenticated
with check (blocker_id = auth.uid());

create policy "Users can unblock"
on blocks for delete to authenticated
using (blocker_id = auth.uid());

-- ---- reports ---- (관리자만 열람. 신고자는 접수만 가능)
create policy "Users can submit reports"
on reports for insert to authenticated
with check (reporter_id = auth.uid() and reported_user_id <> auth.uid());

create policy "Admins can view reports"
on reports for select to authenticated
using (is_admin());

create policy "Admins can update reports"
on reports for update to authenticated
using (is_admin())
with check (is_admin());

-- ---- user_sessions ----
create policy "Users can view own sessions"
on user_sessions for select to authenticated
using (user_id = auth.uid() or is_admin());

create policy "Users can start own session"
on user_sessions for insert to authenticated
with check (user_id = auth.uid());

create policy "Users can end own session"
on user_sessions for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- ---- wallet_transactions ---- (기록은 서버만. 본인 내역 조회만 가능)
create policy "Users can view own transactions"
on wallet_transactions for select to authenticated
using (user_id = auth.uid() or is_admin());

-- =====================================================================
-- 타인에게 보여줄 프로필 뷰 [보완]
-- 정확한 좌표(location), 생년월일, 재화, 임베딩, role 은 노출하지 않습니다.
-- 거리(km)는 Phase 2 의 추천 RPC 에서 서버가 계산해 근사값만 내려줍니다.
-- (뷰 소유자 권한으로 실행되어 profiles 의 RLS 를 우회하므로, 노출 컬럼을 늘릴 때 주의)
-- =====================================================================
create view public_profiles as
select
  p.id,
  p.nickname,
  p.gender,
  extract(year from age(p.birth_date))::int as age,
  p.purpose,
  p.hobbies,
  p.bio,
  p.neighborhood_name,
  p.trust_score,
  p.verification_status,
  p.is_adult_verified,
  p.last_active_at
from profiles p
where auth.uid() is not null
  and not p.is_banned
  and not public.is_blocked_between(auth.uid(), p.id);

revoke all on public_profiles from anon, authenticated;
grant select on public_profiles to authenticated;

-- 보조 함수는 로그인 사용자만 호출
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_blocked_between(uuid, uuid) from public, anon;
revoke execute on function public.is_active_user() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;
grant execute on function public.is_active_user() to authenticated;
revoke execute on function public.handle_new_swipe() from public, anon, authenticated;
revoke execute on function public.handle_new_block() from public, anon, authenticated;
revoke execute on function public.handle_new_report() from public, anon, authenticated;

-- =====================================================================
-- Realtime: 채팅 메시지와 새 매칭을 실시간으로 받습니다 (RLS 가 그대로 적용됨)
-- =====================================================================
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table matches;

commit;

-- ---------------------------------------------------------------------
-- 첫 관리자 지정: 가입 후 아래 주석을 풀고 본인 계정 이메일로 한 번 실행하세요.
-- ---------------------------------------------------------------------
-- update profiles set role = 'admin'
-- where id = (select id from auth.users where email = 'you@example.com');
