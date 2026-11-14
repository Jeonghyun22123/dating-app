-- =====================================================================
-- Dating App · Phase 6 마이그레이션 (약관 동의, 회원 탈퇴, 접속 기록)
-- 선행 조건: ROADMAP.md 의 "Supabase SQL 실행 순서" 1~7 (supabase_settings.sql 포함) 실행 완료
-- 사용법: Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 한 번 실행하세요.
--
-- 포함 내용
--   1. user_consents        : 약관·개인정보·위치정보·이벤트 수신 동의 기록 (버전·시각)
--   2. 현재 약관 버전          : app_settings 의 'terms' (버전을 올리면 전원에게 재동의를 받습니다)
--   3. my_consent_status() / accept_consents() : 동의가 필요한지 확인하고 기록
--   4. 이벤트·혜택 수신 설정과 동의 기록을 하나로 연결
--   5. 회원 탈퇴 대비: 탈퇴해도 그 사람에 대한 신고 기록은 남도록 변경
--   6. 접속 기록 start_session() / end_session() : 체류 시간을 서버 시각으로 계산
--   7. 관리자 통계에 접속·체류 시간 추가
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. 동의 기록 (지우거나 고치지 않고 쌓기만 합니다)
--    가입 직후, 프로필을 만들기 전에 동의를 받으므로 auth.users 를 참조합니다.
--    kind
--      terms     이용약관 (필수)
--      privacy   개인정보 수집·이용 (필수)
--      location  위치정보 이용 (필수)
--      marketing 이벤트·혜택 등 광고성 정보 수신 (선택)
--      biometric 얼굴 비교용 생체정보 처리 (Phase 9 에서 사용할 자리)
-- ---------------------------------------------------------------------
create table user_consents (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  kind text not null check (kind in ('terms', 'privacy', 'location', 'marketing', 'biometric')),
  version text not null,
  agreed boolean not null,
  created_at timestamptz default now() not null
);

create index user_consents_user_idx on user_consents (user_id, kind, created_at desc);

revoke all on user_consents from anon, authenticated;
grant select on user_consents to authenticated;
alter table user_consents enable row level security;

create policy "Users can view own consents"
on user_consents for select to authenticated
using (user_id = auth.uid() or is_admin());

-- ---------------------------------------------------------------------
-- 2. 현재 약관 버전. 약관을 바꾸면 이 값을 새 버전으로 올리세요 → 다음 접속 때 전원에게 재동의 화면이 뜹니다.
--    update app_settings set value = '{"version": "2027-01-01"}' where key = 'terms';
-- ---------------------------------------------------------------------
insert into app_settings (key, value) values ('terms', '{"version": "2026-11-14"}')
on conflict (key) do nothing;

create or replace function public.current_terms_version()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select value ->> 'version' from app_settings where key = 'terms'), '2026-11-14');
$$;

-- ---------------------------------------------------------------------
-- 3. 동의 확인과 기록
-- ---------------------------------------------------------------------
-- 반환: { "version": 현재 버전, "needs_consent": 필수 동의를 현재 버전으로 아직 하지 않았는지,
--         "marketing": 마지막으로 고른 이벤트 수신 여부 }
create or replace function public.my_consent_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'version', current_terms_version(),
    'needs_consent', exists (
      select 1 from unnest(array['terms', 'privacy', 'location']) required(kind)
      where not exists (
        select 1 from user_consents c
        where c.user_id = auth.uid()
          and c.kind = required.kind
          and c.version = current_terms_version()
          and c.agreed
      )
    ),
    'marketing', coalesce((
      select c.agreed from user_consents c
      where c.user_id = auth.uid() and c.kind = 'marketing'
      order by c.created_at desc limit 1
    ), false)
  );
$$;

-- 필수 3개 동의 + 이벤트 수신 선택을 한 번에 기록합니다.
-- p_version 은 사용자가 화면에서 본 약관 버전입니다. 그 사이 약관이 바뀌었으면 거절합니다.
create or replace function public.accept_consents(p_version text, p_marketing boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception '로그인이 필요합니다.';
  end if;
  if p_version is distinct from current_terms_version() then
    raise exception '약관이 새로 바뀌었습니다. 화면을 새로고침한 뒤 다시 확인해 주세요.';
  end if;

  insert into user_consents (user_id, kind, version, agreed)
  values
    (me, 'terms', p_version, true),
    (me, 'privacy', p_version, true),
    (me, 'location', p_version, true),
    (me, 'marketing', p_version, coalesce(p_marketing, false));

  -- 이미 프로필이 있으면(약관 재동의) 알림 설정의 이벤트 수신 여부도 맞춥니다.
  -- 프로필이 아직 없으면 프로필을 만들 때 아래 트리거가 반영합니다.
  update profiles
  set notification_prefs = jsonb_set(notification_prefs, '{marketing}', to_jsonb(coalesce(p_marketing, false)))
  where id = me;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. 이벤트·혜택 수신: 설정 화면의 스위치와 동의 기록을 하나로 연결
--    - 프로필을 처음 만들 때: 가입 시 고른 값을 알림 설정에 반영
--    - 설정에서 스위치를 바꿀 때: 동의(또는 철회) 기록을 남김
-- ---------------------------------------------------------------------
create or replace function public.apply_marketing_consent_on_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  chosen boolean;
begin
  select c.agreed into chosen from user_consents c
  where c.user_id = new.id and c.kind = 'marketing'
  order by c.created_at desc limit 1;

  if chosen is not null then
    new.notification_prefs := jsonb_set(new.notification_prefs, '{marketing}', to_jsonb(chosen));
    if chosen then
      new.marketing_opt_in_at := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_apply_marketing_consent
  before insert on profiles
  for each row execute function public.apply_marketing_consent_on_profile();

create or replace function public.log_marketing_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  was_on boolean := coalesce((old.notification_prefs ->> 'marketing')::boolean, false);
  is_on boolean := coalesce((new.notification_prefs ->> 'marketing')::boolean, false);
begin
  -- 같은 값이면 기록하지 않습니다. accept_consents() 가 방금 남긴 기록과 겹치는 경우도 건너뜁니다.
  if is_on is distinct from was_on and not exists (
    select 1 from user_consents c
    where c.user_id = new.id and c.kind = 'marketing' and c.agreed = is_on
      and c.created_at >= now() - interval '5 seconds'
  ) then
    insert into user_consents (user_id, kind, version, agreed)
    values (new.id, 'marketing', current_terms_version(), is_on);
  end if;
  return new;
end;
$$;

create trigger profiles_log_marketing_change
  after update of notification_prefs on profiles
  for each row execute function public.log_marketing_change();

-- ---------------------------------------------------------------------
-- 5. 회원 탈퇴 대비
--    탈퇴(계정 삭제) 시 프로필·사진·매칭·대화는 함께 지워지지만,
--    "그 사람에 대한 신고"까지 지워지면 탈퇴로 신고 기록을 없앨 수 있으므로 남겨 둡니다.
-- ---------------------------------------------------------------------
alter table reports alter column reported_user_id drop not null;
alter table reports drop constraint reports_reported_user_id_fkey;
alter table reports
  add constraint reports_reported_user_id_fkey
  foreign key (reported_user_id) references profiles(id) on delete set null;

-- 관리자 신고 목록: 탈퇴한 피신고자도 보이도록 (반환 형식은 그대로)
create or replace function public.admin_list_reports(p_status text default 'pending')
returns table (
  id uuid,
  created_at timestamptz,
  status text,
  reason text,
  description text,
  admin_note text,
  chat_snapshot jsonb,
  reporter_id uuid,
  reporter_nickname text,
  reported_user_id uuid,
  reported_nickname text,
  reported_is_banned boolean,
  reported_report_count int
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform assert_admin();

  return query
  select
    r.id,
    r.created_at,
    r.status,
    r.reason,
    r.description,
    r.admin_note,
    r.chat_snapshot,
    r.reporter_id,
    reporter.nickname,
    r.reported_user_id,
    coalesce(reported.nickname, '탈퇴한 사용자'),
    coalesce(reported.is_banned, false),
    case when r.reported_user_id is null then 1
         else (select count(*)::int from reports x where x.reported_user_id = r.reported_user_id) end
  from reports r
  left join profiles reported on reported.id = r.reported_user_id
  left join profiles reporter on reporter.id = r.reporter_id
  where p_status = 'all' or r.status = p_status
  order by r.created_at desc
  limit 100;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. 접속 기록
--    앱이 화면에 보일 때 start_session(), 숨겨지거나 닫힐 때 end_session() 을 부릅니다.
--    체류 시간은 서버 시각으로 계산하므로 앱에서 값을 조작할 수 없습니다.
--    (닫힐 때 신호를 못 보낸 기록은 ended_at 이 비어 있으며 통계에서 제외합니다)
-- ---------------------------------------------------------------------
revoke insert, update on user_sessions from authenticated;

create or replace function public.start_session(p_platform text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  session_id uuid;
begin
  if p_platform not in ('web', 'ios', 'android') then
    raise exception '플랫폼 값이 올바르지 않습니다.';
  end if;
  if not exists (select 1 from profiles where id = auth.uid()) then
    return null;
  end if;

  insert into user_sessions (user_id, platform) values (auth.uid(), p_platform)
  returning id into session_id;
  return session_id;
end;
$$;

create or replace function public.end_session(p_session uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update user_sessions
  -- 6시간이 넘는 값은 기기가 잠든 채 방치된 경우로 보고 잘라냅니다.
  set ended_at = now(),
      duration_seconds = least(extract(epoch from now() - started_at)::int, 6 * 60 * 60)
  where id = p_session and user_id = auth.uid() and ended_at is null;
$$;

-- ---------------------------------------------------------------------
-- 7. 관리자 통계 (Phase 4 의 항목 + 접속 기록)
-- ---------------------------------------------------------------------
create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  perform assert_admin();

  select jsonb_build_object(
    'users_total',        (select count(*) from profiles),
    'users_onboarded',    (select count(*) from profiles where onboarding_completed_at is not null),
    'users_new_today',    (select count(*) from profiles
                           where created_at >= date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'),
    'users_new_7d',       (select count(*) from profiles where created_at >= now() - interval '7 days'),
    'users_active_24h',   (select count(*) from profiles where last_active_at >= now() - interval '24 hours'),
    'users_banned',       (select count(*) from profiles where is_banned),
    'gender_female',      (select count(*) from profiles where gender = 'female'),
    'gender_male',        (select count(*) from profiles where gender = 'male'),
    'purpose_friend',     (select count(*) from profiles where purpose = 'friend'),
    'purpose_hobby',      (select count(*) from profiles where purpose = 'hobby'),
    'purpose_serious',    (select count(*) from profiles where purpose = 'serious'),
    'verified_approved',  (select count(*) from profiles where verification_status = 'approved'),
    'selfies_pending',    (select count(*) from profiles
                           where verification_status = 'pending' and selfie_submitted_at is not null),
    'photos_pending',     (select count(*) from profile_photos where moderation_status = 'pending'),
    'matches_total',      (select count(*) from matches),
    'matches_7d',         (select count(*) from matches where created_at >= now() - interval '7 days'),
    -- 메시지는 개수만 셉니다. 내용은 조회하지 않습니다.
    'messages_7d',        (select count(*) from messages where created_at >= now() - interval '7 days'),
    'reports_pending',    (select count(*) from reports where status = 'pending'),
    'sessions_24h',       (select count(*) from user_sessions where started_at >= now() - interval '24 hours'),
    'avg_session_minutes_7d', (select coalesce(round(avg(duration_seconds) / 60.0, 1), 0) from user_sessions
                               where ended_at is not null and started_at >= now() - interval '7 days')
  ) into result;

  return result;
end;
$$;

-- 실행 권한
revoke execute on function public.current_terms_version() from public, anon;
revoke execute on function public.my_consent_status() from public, anon;
revoke execute on function public.accept_consents(text, boolean) from public, anon;
revoke execute on function public.start_session(text) from public, anon;
revoke execute on function public.end_session(uuid) from public, anon;
revoke execute on function public.apply_marketing_consent_on_profile() from public, anon, authenticated;
revoke execute on function public.log_marketing_change() from public, anon, authenticated;
grant execute on function public.current_terms_version() to authenticated;
grant execute on function public.my_consent_status() to authenticated;
grant execute on function public.accept_consents(text, boolean) to authenticated;
grant execute on function public.start_session(text) to authenticated;
grant execute on function public.end_session(uuid) to authenticated;

commit;
