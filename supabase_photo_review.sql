-- =====================================================================
-- Dating App · 사진 변경 심사 마이그레이션
-- 선행 조건: supabase_phase7.sql 까지 실행 완료
-- 사용법: Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 한 번 실행하세요.
--        함께 배포할 Edge Function: moderate-photo, admin-review-selfie (둘 다 내용이 바뀌었습니다)
--
-- 포함 내용
--   1. 사진 상태 추가: 'draft'(올렸지만 아직 변경 요청 전), 'review'(관리자 검토 중)
--      → 가입(온보딩)을 마친 회원이 새로 올리는 사진은 바로 공개되지 않고 'draft' 로 들어갑니다.
--   2. profiles.photo_review_* : 사진 변경 요청의 진행 상태 (검토 중 / 반려됨 + 사유)
--   3. 대표사진 지정 set_main_photo(), 반려 안내 닫기 dismiss_photo_review()
--   4. 관리자: 사진수정 심사 목록 admin_photo_change_queue(), 심사 방식 admin_set_review_mode()
--
-- 원칙
--   - 검토가 끝나기 전까지 다른 사람에게는 기존(승인된) 사진만 보입니다. 추천·채팅·Storage 정책은
--     모두 moderation_status = 'approved' 만 보여주므로 그대로 둡니다.
--   - 이미 승인된 사진끼리의 대표사진 변경·삭제는 검토 없이 바로 반영됩니다. 단, 마지막 1장은 지울 수 없습니다.
--   - 요청 접수(셀카 확인)와 승인·반려는 파일 삭제가 함께 필요해서 Edge Function 이 처리합니다.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. 사진 상태 추가
-- ---------------------------------------------------------------------
alter table profile_photos drop constraint if exists profile_photos_moderation_status_check;
alter table profile_photos add constraint profile_photos_moderation_status_check
  check (moderation_status in ('pending', 'approved', 'rejected', 'draft', 'review'));

-- ---------------------------------------------------------------------
-- 2. 사진 변경 요청 상태 (서버만 변경 — 클라이언트 update 권한 없음)
--    photo_review_status: null(요청 없음) / 'reviewing'(검토 중) / 'rejected'(반려됨, 사용자가 확인하면 null)
-- ---------------------------------------------------------------------
alter table profiles
  add column if not exists photo_review_status text
    check (photo_review_status in ('reviewing', 'rejected')),
  add column if not exists photo_review_requested_at timestamptz,
  add column if not exists photo_review_note text;

create index if not exists profiles_photo_review_idx on profiles (photo_review_requested_at)
  where photo_review_status = 'reviewing';

-- 새 사진 등록 규칙 (앱에서 직접 넣는 경우에만 적용. 서버(service_role)는 auth.uid() 가 없어 건너뜁니다)
--   - 검토 중에는 사진을 더 올릴 수 없습니다.
--   - 온보딩을 마친 회원의 새 사진은 'draft' 로 시작합니다 (변경 요청 → 검토 → 승인 후 공개).
create or replace function public.route_new_photo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  me profiles%rowtype;
begin
  if auth.uid() is null then
    return new;
  end if;

  select * into me from profiles where id = new.user_id;
  if me.photo_review_status = 'reviewing' then
    raise exception '사진을 검토하는 중에는 새 사진을 올릴 수 없습니다.' using errcode = 'P0006';
  end if;
  if me.onboarding_completed_at is not null then
    new.moderation_status := 'draft';
    new.moderation_reason := null;
  end if;
  return new;
end;
$$;

drop trigger if exists profile_photos_route_new on profile_photos;
create trigger profile_photos_route_new
  before insert on profile_photos
  for each row execute function public.route_new_photo();

-- 삭제 규칙 (본인이 앱에서 지우는 경우에만 적용. 탈퇴 등 서버 작업은 건너뜁니다)
--   - 검토 중인 사진은 지울 수 없습니다.
--   - 온보딩을 마친 회원은 승인된 사진을 최소 1장 유지해야 합니다.
create or replace function public.guard_photo_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or auth.uid() <> old.user_id then
    return old;
  end if;

  if old.moderation_status = 'review' then
    raise exception '검토 중인 사진은 삭제할 수 없습니다.' using errcode = 'P0006';
  end if;

  if old.moderation_status = 'approved'
     and exists (select 1 from profiles where id = old.user_id and onboarding_completed_at is not null)
     and not exists (
       select 1 from profile_photos
       where user_id = old.user_id and id <> old.id and moderation_status = 'approved'
     ) then
    raise exception '프로필 사진은 최소 1장이 필요합니다.' using errcode = 'P0007';
  end if;

  return old;
end;
$$;

drop trigger if exists profile_photos_guard_delete on profile_photos;
create trigger profile_photos_guard_delete
  before delete on profile_photos
  for each row execute function public.guard_photo_delete();

-- ---------------------------------------------------------------------
-- 3. 대표사진 지정 · 반려 안내 닫기
-- ---------------------------------------------------------------------
-- 승인된 내 사진 하나를 맨 앞(대표)으로 옮깁니다. 추천·채팅 목록은 position 이 가장 작은 사진을 먼저 보여줍니다.
create or replace function public.set_main_photo(p_photo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from profile_photos
    where id = p_photo_id and user_id = auth.uid() and moderation_status = 'approved'
  ) then
    raise exception '대표사진으로 지정할 수 없는 사진입니다.';
  end if;

  update profile_photos pp
  set position = ranked.rn
  from (
    select id,
           (row_number() over (order by (id = p_photo_id) desc, position, created_at) - 1)::int as rn
    from profile_photos
    where user_id = auth.uid() and moderation_status = 'approved'
  ) ranked
  where pp.id = ranked.id and pp.position is distinct from ranked.rn;
end;
$$;

-- 반려 안내를 확인하면 상태를 비우고, 반려된 사진 기록(파일은 이미 삭제됨)을 정리합니다.
create or replace function public.dismiss_photo_review()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles
  set photo_review_status = null, photo_review_note = null, photo_review_requested_at = null
  where id = auth.uid() and photo_review_status = 'rejected';

  delete from profile_photos where user_id = auth.uid() and moderation_status = 'rejected';
end;
$$;

-- ---------------------------------------------------------------------
-- 4. 관리자
-- ---------------------------------------------------------------------
-- 신규회원 심사 목록: 비교용 사진에서 변경 요청 중인 사진(draft/review)은 뺍니다.
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
      where pp.user_id = p.id and pp.moderation_status in ('approved', 'pending')
    ), '{}')
  from profiles p
  where p.verification_status = 'pending'
    and p.selfie_submitted_at is not null
    and not p.is_banned
  order by p.selfie_submitted_at asc
  limit 50;
end;
$$;

-- 사진수정 심사 목록 (오래 기다린 순)
--   current_paths: 지금 공개 중인 사진 / new_paths: 새로 올려 검토를 기다리는 사진
create or replace function public.admin_photo_change_queue()
returns table (
  id uuid,
  nickname text,
  age int,
  gender text,
  neighborhood_name text,
  requested_at timestamptz,
  current_paths text[],
  new_paths text[]
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
    p.photo_review_requested_at,
    coalesce((
      select array_agg(pp.storage_path order by pp.position, pp.created_at)
      from profile_photos pp
      where pp.user_id = p.id and pp.moderation_status = 'approved'
    ), '{}'),
    coalesce((
      select array_agg(pp.storage_path order by pp.created_at)
      from profile_photos pp
      where pp.user_id = p.id and pp.moderation_status = 'review'
    ), '{}')
  from profiles p
  where p.photo_review_status = 'reviewing'
    and not p.is_banned
  order by p.photo_review_requested_at asc nulls last
  limit 50;
end;
$$;

-- 심사 방식 (탭마다 따로 정합니다)
--   p_target: 'signup'(신규회원 심사) / 'photo_change'(사진수정 심사)
--   p_mode  : 'manual'(관리자 직접 승인) / 'ai'(AI 가 먼저 보고 통과하면 바로 반영, 애매한 것만 관리자)
--   저장 위치: signup → app_settings.selfie_verification.mode ('manual' | 'auto'), photo_change → app_settings.photo_review.mode
insert into app_settings (key, value) values ('photo_review', '{"mode": "manual"}')
on conflict (key) do nothing;

create or replace function public.admin_set_review_mode(p_target text, p_mode text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform assert_admin();

  if p_target not in ('signup', 'photo_change') or p_mode not in ('manual', 'ai') then
    raise exception '심사 방식이 올바르지 않습니다.';
  end if;

  if p_target = 'signup' then
    update app_settings
    set value = jsonb_set(value, '{mode}', to_jsonb(case when p_mode = 'ai' then 'auto' else 'manual' end)),
        updated_at = now(), updated_by = auth.uid()
    where key = 'selfie_verification';
  else
    insert into app_settings (key, value, updated_at, updated_by)
    values ('photo_review', jsonb_build_object('mode', p_mode), now(), auth.uid())
    on conflict (key) do update
      set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  end if;

  insert into admin_actions (admin_id, action, detail)
  values (auth.uid(), 'settings_review_mode', jsonb_build_object('target', p_target, 'mode', p_mode));

  return (select jsonb_object_agg(key, value) from app_settings);
end;
$$;

revoke execute on function public.route_new_photo() from public, anon, authenticated;
revoke execute on function public.guard_photo_delete() from public, anon, authenticated;
revoke execute on function public.set_main_photo(uuid) from public, anon;
revoke execute on function public.dismiss_photo_review() from public, anon;
revoke execute on function public.admin_photo_change_queue() from public, anon;
revoke execute on function public.admin_set_review_mode(text, text) from public, anon;
grant execute on function public.set_main_photo(uuid) to authenticated;
grant execute on function public.dismiss_photo_review() to authenticated;
grant execute on function public.admin_photo_change_queue() to authenticated;
grant execute on function public.admin_set_review_mode(text, text) to authenticated;

commit;
