-- =====================================================================
-- Dating App · Phase 4 마이그레이션 (관리자 페이지)
-- 선행 조건: supabase_migration.sql, supabase_phase2.sql, supabase_phase3.sql 실행 완료
-- 사용법: Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 한 번 실행하세요.
--
-- 포함 내용
--   1. admin_actions      : 관리자 작업 기록 (누가, 언제, 누구에게, 무엇을)
--   2. admin_stats()      : 기본 통계
--   3. admin_selfie_queue(): 셀카 심사 대기 목록
--   4. admin_list_reports() / admin_resolve_report(): 신고 열람·처리
--   5. admin_list_users() / admin_set_banned()      : 회원 조회·정지
--
-- 원칙
--   - 모든 함수는 맨 처음에 관리자 여부를 서버에서 확인합니다. 화면을 숨기는 것만으로는 보호되지 않습니다.
--   - 관리자도 messages 테이블(일반 대화)은 볼 수 없습니다. 신고로 넘어온 chat_snapshot 만 열람합니다.
--   - 셀카 승인·반려는 파일 삭제가 함께 필요해서 Edge Function(admin-review-selfie)이 처리합니다.
--
-- 첫 관리자 지정 (가입한 내 계정을 관리자로): 아래 주석을 풀고 이메일을 바꿔 한 번 실행하세요.
--   update profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'you@example.com');
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. 관리자 작업 기록
-- ---------------------------------------------------------------------
create table admin_actions (
  id uuid default gen_random_uuid() primary key,
  admin_id uuid references profiles(id) on delete set null,
  action text not null, -- 'selfie_approved', 'selfie_rejected', 'user_banned', 'user_unbanned', 'report_reviewed', 'report_resolved'
  target_user_id uuid,
  detail jsonb,
  created_at timestamptz default now() not null
);

create index admin_actions_created_idx on admin_actions (created_at desc);

revoke all on admin_actions from anon, authenticated;
grant select on admin_actions to authenticated;
alter table admin_actions enable row level security;

-- 기록은 서버 함수만 남길 수 있고(클라이언트 insert 권한 없음), 관리자만 볼 수 있습니다.
create policy "Admins can view admin actions"
on admin_actions for select to authenticated
using (is_admin());

-- 관리자가 아니면 즉시 중단 (42501 = 권한 없음 → API 는 403 으로 응답)
create or replace function public.assert_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception '관리자 권한이 필요합니다.' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. 기본 통계
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
    'reports_pending',    (select count(*) from reports where status = 'pending')
  ) into result;

  return result;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. 셀카 심사 대기 목록 (오래 기다린 순)
--    photo_paths: 비교용 프로필 사진 경로 (반려된 사진 제외)
--    셀카 파일 자체는 관리자 화면이 Storage 에서 직접 불러옵니다 (관리자 전용 열람 정책).
-- ---------------------------------------------------------------------
create or replace function public.admin_selfie_queue()
returns table (
  id uuid,
  nickname text,
  age int,
  gender text,
  neighborhood_name text,
  selfie_submitted_at timestamptz,
  photo_paths text[]
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
    p.id,
    p.nickname,
    extract(year from age(p.birth_date))::int,
    p.gender,
    p.neighborhood_name,
    p.selfie_submitted_at,
    coalesce((
      select array_agg(pp.storage_path order by pp.position, pp.created_at)
      from profile_photos pp
      where pp.user_id = p.id and pp.moderation_status <> 'rejected'
    ), '{}')
  from profiles p
  where p.verification_status = 'pending'
    and p.selfie_submitted_at is not null
    and not p.is_banned
  order by p.selfie_submitted_at asc
  limit 50;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. 신고 열람 · 처리
-- ---------------------------------------------------------------------
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
    reported.nickname,
    reported.is_banned,
    (select count(*)::int from reports x where x.reported_user_id = r.reported_user_id)
  from reports r
  join profiles reported on reported.id = r.reported_user_id
  left join profiles reporter on reporter.id = r.reporter_id
  where p_status = 'all' or r.status = p_status
  order by r.created_at desc
  limit 100;
end;
$$;

create or replace function public.admin_resolve_report(p_report_id uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  perform assert_admin();

  if p_status not in ('reviewed', 'resolved') then
    raise exception '처리 상태가 올바르지 않습니다.';
  end if;

  update reports
  set status = p_status, admin_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_report_id
  returning reported_user_id into target;

  if not found then
    raise exception '신고를 찾을 수 없습니다.';
  end if;

  insert into admin_actions (admin_id, action, target_user_id, detail)
  values (auth.uid(), 'report_' || p_status, target, jsonb_build_object('report_id', p_report_id));
end;
$$;

-- ---------------------------------------------------------------------
-- 5. 회원 조회 · 정지
--    이메일은 운영 문의 대응용으로만 노출합니다. 좌표·생년월일·임베딩은 반환하지 않습니다.
-- ---------------------------------------------------------------------
create or replace function public.admin_list_users(p_search text default '', p_limit int default 50)
returns table (
  id uuid,
  email text,
  nickname text,
  age int,
  gender text,
  neighborhood_name text,
  verification_status text,
  is_banned boolean,
  role text,
  created_at timestamptz,
  last_active_at timestamptz,
  report_count int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  term text := trim(coalesce(p_search, ''));
begin
  perform assert_admin();

  return query
  select
    p.id,
    u.email::text,
    p.nickname,
    extract(year from age(p.birth_date))::int,
    p.gender,
    p.neighborhood_name,
    p.verification_status,
    p.is_banned,
    p.role,
    p.created_at,
    p.last_active_at,
    (select count(*)::int from reports r where r.reported_user_id = p.id)
  from profiles p
  join auth.users u on u.id = p.id
  where term = ''
     or p.nickname ilike '%' || term || '%'
     or u.email ilike '%' || term || '%'
  order by p.created_at desc
  limit least(greatest(p_limit, 1), 200);
end;
$$;

-- 정지된 계정은 추천·채팅 목록에서 사라지고, 좋아요·메시지·사진 등록을 할 수 없습니다
-- (Phase 1~3 의 정책과 함수가 is_banned 를 이미 확인합니다).
create or replace function public.admin_set_banned(p_user_id uuid, p_banned boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_role text;
begin
  perform assert_admin();

  if p_user_id = auth.uid() then
    raise exception '자기 자신은 정지할 수 없습니다.';
  end if;

  select role into target_role from profiles where id = p_user_id;
  if not found then
    raise exception '사용자를 찾을 수 없습니다.';
  end if;
  if target_role = 'admin' then
    raise exception '관리자 계정은 정지할 수 없습니다.';
  end if;

  update profiles set is_banned = p_banned where id = p_user_id;

  insert into admin_actions (admin_id, action, target_user_id, detail)
  values (
    auth.uid(),
    case when p_banned then 'user_banned' else 'user_unbanned' end,
    p_user_id,
    jsonb_build_object('reason', nullif(trim(coalesce(p_reason, '')), ''))
  );
end;
$$;

-- 실행 권한: 로그인 사용자만 호출 가능하고, 함수 안에서 관리자 여부를 다시 확인합니다.
revoke execute on function public.assert_admin() from public, anon;
revoke execute on function public.admin_stats() from public, anon;
revoke execute on function public.admin_selfie_queue() from public, anon;
revoke execute on function public.admin_list_reports(text) from public, anon;
revoke execute on function public.admin_resolve_report(uuid, text, text) from public, anon;
revoke execute on function public.admin_list_users(text, int) from public, anon;
revoke execute on function public.admin_set_banned(uuid, boolean, text) from public, anon;
grant execute on function public.assert_admin() to authenticated;
grant execute on function public.admin_stats() to authenticated;
grant execute on function public.admin_selfie_queue() to authenticated;
grant execute on function public.admin_list_reports(text) to authenticated;
grant execute on function public.admin_resolve_report(uuid, text, text) to authenticated;
grant execute on function public.admin_list_users(text, int) to authenticated;
grant execute on function public.admin_set_banned(uuid, boolean, text) to authenticated;

commit;
