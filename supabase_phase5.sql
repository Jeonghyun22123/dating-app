-- =====================================================================
-- Dating App · Phase 5 마이그레이션 (만남 조건, 신뢰 점수, 셀카 검증 방식 설정)
-- 선행 조건: supabase_migration.sql ~ supabase_phase4.sql 실행 완료
--            (supabase_settings.sql 은 실행 여부와 무관)
-- 사용법: Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 한 번 실행하세요.
--
-- 포함 내용
--   1. 만남 조건: 희망 성별 · 나이 범위 · 거리 (profiles 컬럼)
--   2. 신뢰 점수: 서버 자동 계산 (프로필 · 사진 · 신고 변경 시 다시 계산)
--   3. discover_profiles() 개편: 양방향 조건, 설정 거리(최대 500km), 신뢰 점수 보조 정렬
--   4. 타인에게는 점수 대신 등급만 노출 (public_profiles 뷰 변경)
--   5. 관리자 설정: 셀카 검증 방식 (app_settings 테이블)
--   6. 관리자 회원 목록에 신뢰 점수 표시
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. 만남 조건
--    값이 비어 있으면(null) 아직 설정하지 않은 사용자입니다. 앱이 다음 접속 때 입력을 받습니다.
--    pref_age_max = 60 은 "60세 이상"(상한 없음)을 뜻합니다.
-- ---------------------------------------------------------------------
alter table profiles
  add column pref_genders text[]
    check (
      pref_genders is null
      or (cardinality(pref_genders) between 1 and 2 and pref_genders <@ array['male', 'female'])
    ),
  add column pref_age_min int check (pref_age_min between 19 and 60),
  add column pref_age_max int check (pref_age_max between 19 and 60),
  add column pref_distance_km int check (pref_distance_km between 10 and 500),
  add constraint profiles_pref_age_range check (pref_age_min <= pref_age_max);

grant insert (pref_genders, pref_age_min, pref_age_max, pref_distance_km) on profiles to authenticated;
grant update (pref_genders, pref_age_min, pref_age_max, pref_distance_km) on profiles to authenticated;

-- ---------------------------------------------------------------------
-- 2. 신뢰 점수 (0.0 ~ 5.0)
--    "실제 본인이고 성실하게 이용하는가"를 나타냅니다. 사용자가 직접 바꿀 수 없습니다.
--      +2.0  셀카 본인 인증 승인
--      +1.5  성인 본인인증 (PortOne, 도입 후 적용)
--      +0.5  승인된 사진 3장 이상
--      +0.5  자기소개 50자 이상
--      +0.5  가입 30일 경과 + 조치된 신고 없음
--      -1.0  관리자가 '조치 완료'한 신고 1건마다 (접수만 된 신고는 감점하지 않음)
--      정지 중에는 0점
-- ---------------------------------------------------------------------
create or replace function public.calculate_trust_score(p profiles)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  resolved_reports int;
  approved_photos int;
  score numeric := 0;
begin
  if p.is_banned then
    return 0;
  end if;

  select count(*) into resolved_reports
  from reports where reported_user_id = p.id and status = 'resolved';

  select count(*) into approved_photos
  from profile_photos where user_id = p.id and moderation_status = 'approved';

  if p.verification_status = 'approved' then score := score + 2.0; end if;
  if p.is_adult_verified then score := score + 1.5; end if;
  if approved_photos >= 3 then score := score + 0.5; end if;
  if char_length(coalesce(p.bio, '')) >= 50 then score := score + 0.5; end if;
  if p.created_at <= now() - interval '30 days' and resolved_reports = 0 then score := score + 0.5; end if;
  score := score - resolved_reports * 1.0;

  return greatest(0, least(5, score));
end;
$$;

-- 프로필이 저장될 때마다 점수를 다시 계산해 넣습니다.
-- (클라이언트는 trust_score 를 쓸 권한이 없고, 설령 값을 보내도 여기서 덮어씁니다)
create or replace function public.apply_trust_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.trust_score := calculate_trust_score(new);
  return new;
end;
$$;

create trigger profiles_apply_trust_score
  before insert or update on profiles
  for each row execute function public.apply_trust_score();

-- 사진이나 신고 상태가 바뀌면 해당 프로필을 "건드려서" 위 트리거가 다시 계산하게 합니다.
create or replace function public.touch_profile_trust()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  if tg_table_name = 'profile_photos' then
    if tg_op = 'DELETE' then target := old.user_id; else target := new.user_id; end if;
  else
    if tg_op = 'DELETE' then target := old.reported_user_id; else target := new.reported_user_id; end if;
  end if;
  update profiles set trust_score = trust_score where id = target;
  return null;
end;
$$;

create trigger profile_photos_touch_trust
  after insert or delete or update of moderation_status on profile_photos
  for each row execute function public.touch_profile_trust();

create trigger reports_touch_trust
  after insert or delete or update of status on reports
  for each row execute function public.touch_profile_trust();

-- 기존 사용자 점수 채우기
update profiles set trust_score = trust_score;

-- 점수 → 등급. 다른 사용자에게는 숫자 대신 이 등급만 보여줍니다.
create or replace function public.trust_level(score numeric)
returns text
language sql
immutable
as $$
  select case when score >= 3.0 then 'high' when score >= 2.0 then 'verified' else null end;
$$;

-- 내 점수와 항목별 달성 여부 (내 프로필의 "점수 올리는 방법" 표시용)
create or replace function public.my_trust_breakdown()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me profiles%rowtype;
  resolved_reports int;
  approved_photos int;
begin
  select * into me from profiles where id = auth.uid();
  if not found then
    return null;
  end if;

  select count(*) into resolved_reports from reports where reported_user_id = me.id and status = 'resolved';
  select count(*) into approved_photos from profile_photos where user_id = me.id and moderation_status = 'approved';

  return jsonb_build_object(
    'score', calculate_trust_score(me),
    'level', trust_level(calculate_trust_score(me)),
    'max_score', 5,
    'penalty', resolved_reports * 1.0,
    'items', jsonb_build_array(
      jsonb_build_object('key', 'selfie', 'points', 2.0, 'earned', me.verification_status = 'approved'),
      jsonb_build_object('key', 'adult', 'points', 1.5, 'earned', me.is_adult_verified),
      jsonb_build_object('key', 'photos', 'points', 0.5, 'earned', approved_photos >= 3),
      jsonb_build_object('key', 'bio', 'points', 0.5, 'earned', char_length(coalesce(me.bio, '')) >= 50),
      jsonb_build_object('key', 'tenure', 'points', 0.5,
        'earned', me.created_at <= now() - interval '30 days' and resolved_reports = 0)
    )
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 3. 추천 목록 개편
--    - 거리: 내 설정 반경 안이고, 상대의 설정 반경 안에도 내가 있어야 함
--    - 성별 · 나이: 내 조건에 상대가 맞고, 상대의 조건에도 내가 맞아야 함
--      (조건을 아직 설정하지 않은 쪽은 제한 없음으로 봅니다)
--    - 정렬: 같은 만남 목적 → 성향(임베딩) 유사도 → 가까운 거리대(10km 단위) → 신뢰 점수 → 거리
--    - 점수 숫자는 내려주지 않고 등급(trust_level)만 반환
--    매개변수가 바뀌므로 Phase 3 의 함수를 지우고 새로 만듭니다.
-- ---------------------------------------------------------------------
drop function if exists public.discover_profiles(int, int);

create or replace function public.discover_profiles(p_limit int default 20)
returns table (
  id uuid,
  nickname text,
  age int,
  gender text,
  purpose text,
  hobbies text[],
  bio text,
  neighborhood_name text,
  verification_status text,
  trust_level text,
  distance_km int,
  photo_paths text[]
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with me as (
    select
      p.id, p.location, p.purpose, p.embedding, p.gender,
      extract(year from age(p.birth_date))::int as age,
      p.pref_genders,
      coalesce(p.pref_age_min, 19) as age_min,
      coalesce(p.pref_age_max, 60) as age_max,
      least(coalesce(p.pref_distance_km, 30), 500) as max_km
    from profiles p
    where p.id = auth.uid()
      and not p.is_banned
      and p.onboarding_completed_at is not null
      and p.location is not null
  ),
  candidates as (
    select
      p.*,
      extract(year from age(p.birth_date))::int as age,
      st_distance(me.location, p.location) as meters
    from profiles p
    cross join me
    where p.id <> me.id
      and not p.is_banned
      and p.onboarding_completed_at is not null
      and p.location is not null
      and st_dwithin(me.location, p.location, me.max_km * 1000.0)
  )
  select
    c.id,
    c.nickname,
    c.age,
    c.gender,
    c.purpose,
    c.hobbies,
    c.bio,
    c.neighborhood_name,
    c.verification_status,
    trust_level(c.trust_score),
    greatest(1, round(c.meters / 1000.0))::int,
    (
      select array_agg(pp.storage_path order by pp.position, pp.created_at)
      from profile_photos pp
      where pp.user_id = c.id and pp.moderation_status = 'approved'
    )
  from candidates c
  cross join me
  where
    -- 내 조건에 상대가 맞는지
    (me.pref_genders is null or c.gender = any (me.pref_genders))
    and c.age >= me.age_min
    and (me.age_max >= 60 or c.age <= me.age_max)
    -- 상대의 조건에 내가 맞는지
    and (c.pref_genders is null or me.gender = any (c.pref_genders))
    and me.age >= coalesce(c.pref_age_min, 19)
    and (coalesce(c.pref_age_max, 60) >= 60 or me.age <= c.pref_age_max)
    and c.meters <= least(coalesce(c.pref_distance_km, 500), 500) * 1000.0
    and exists (
      select 1 from profile_photos pp
      where pp.user_id = c.id and pp.moderation_status = 'approved'
    )
    and not exists (
      select 1 from swipes s where s.actor_id = me.id and s.target_id = c.id
    )
    and not exists (
      select 1 from blocks b
      where (b.blocker_id = me.id and b.blocked_id = c.id)
         or (b.blocker_id = c.id and b.blocked_id = me.id)
    )
  order by
    (c.purpose = me.purpose) desc,
    (c.embedding <=> me.embedding) asc nulls last,
    floor(c.meters / 10000.0) asc,
    c.trust_score desc,
    c.meters asc
  limit least(greatest(p_limit, 1), 50);
$$;

revoke execute on function public.discover_profiles(int) from public, anon;
grant execute on function public.discover_profiles(int) to authenticated;

-- ---------------------------------------------------------------------
-- 4. 타인에게 보여줄 프로필 뷰: 점수 숫자(trust_score) 대신 등급(trust_level)
--    컬럼 구성이 바뀌므로 지우고 다시 만듭니다.
-- ---------------------------------------------------------------------
drop view if exists public_profiles;

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
  public.trust_level(p.trust_score) as trust_level,
  p.verification_status,
  p.is_adult_verified,
  p.last_active_at
from profiles p
where auth.uid() is not null
  and not p.is_banned
  and not public.is_blocked_between(auth.uid(), p.id);

revoke all on public_profiles from anon, authenticated;
grant select on public_profiles to authenticated;

-- ---------------------------------------------------------------------
-- 5. 관리자 설정 (셀카 검증 방식)
--    selfie_verification.mode
--      'manual' : 모든 셀카를 관리자가 프로필 사진과 직접 비교 (기본값)
--      'auto'   : 자동 얼굴 비교 후 일치도가 기준 이상이면 자동 승인, 그 외는 관리자 대기열로
--                 (자동 반려는 하지 않음)
--    face_compare.available
--      얼굴 비교 API 연동이 준비되었는지. 연동을 붙이기 전까지 false 이며,
--      false 인 동안에는 'auto' 로 바꿀 수 없습니다.
-- ---------------------------------------------------------------------
create table app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now() not null,
  updated_by uuid references profiles(id) on delete set null
);

insert into app_settings (key, value) values
  ('selfie_verification', '{"mode": "manual", "auto_approve_threshold": 0.8}'),
  ('face_compare', '{"available": false}');

revoke all on app_settings from anon, authenticated;
grant select on app_settings to authenticated;
alter table app_settings enable row level security;

create policy "Admins can view app settings"
on app_settings for select to authenticated
using (is_admin());

create or replace function public.admin_get_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform assert_admin();
  return (select jsonb_object_agg(key, value) from app_settings);
end;
$$;

create or replace function public.admin_update_selfie_settings(p_mode text, p_threshold numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  face_ready boolean;
  next_value jsonb;
begin
  perform assert_admin();

  if p_mode not in ('manual', 'auto') then
    raise exception '검증 방식이 올바르지 않습니다.';
  end if;
  if p_threshold is null or p_threshold < 0.5 or p_threshold > 0.99 then
    raise exception '자동 승인 기준은 0.50 ~ 0.99 사이여야 합니다.';
  end if;

  select coalesce((value ->> 'available')::boolean, false) into face_ready
  from app_settings where key = 'face_compare';

  if p_mode = 'auto' and not coalesce(face_ready, false) then
    raise exception '얼굴 비교 API 가 아직 연결되지 않아 자동 비교를 선택할 수 없습니다.';
  end if;

  next_value := jsonb_build_object('mode', p_mode, 'auto_approve_threshold', round(p_threshold, 2));

  update app_settings
  set value = next_value, updated_at = now(), updated_by = auth.uid()
  where key = 'selfie_verification';

  insert into admin_actions (admin_id, action, detail)
  values (auth.uid(), 'settings_selfie_verification', next_value);

  return next_value;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. 관리자 회원 목록에 신뢰 점수 추가 (반환 컬럼이 바뀌므로 지우고 다시 만듭니다)
-- ---------------------------------------------------------------------
drop function if exists public.admin_list_users(text, int);

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
  report_count int,
  trust_score numeric
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
    (select count(*)::int from reports r where r.reported_user_id = p.id),
    p.trust_score
  from profiles p
  join auth.users u on u.id = p.id
  where term = ''
     or p.nickname ilike '%' || term || '%'
     or u.email ilike '%' || term || '%'
  order by p.created_at desc
  limit least(greatest(p_limit, 1), 200);
end;
$$;

-- 실행 권한
revoke execute on function public.calculate_trust_score(profiles) from public, anon, authenticated;
revoke execute on function public.apply_trust_score() from public, anon, authenticated;
revoke execute on function public.touch_profile_trust() from public, anon, authenticated;
revoke execute on function public.my_trust_breakdown() from public, anon;
revoke execute on function public.admin_get_settings() from public, anon;
revoke execute on function public.admin_update_selfie_settings(text, numeric) from public, anon;
revoke execute on function public.admin_list_users(text, int) from public, anon;
grant execute on function public.trust_level(numeric) to authenticated;
grant execute on function public.my_trust_breakdown() to authenticated;
grant execute on function public.admin_get_settings() to authenticated;
grant execute on function public.admin_update_selfie_settings(text, numeric) to authenticated;
grant execute on function public.admin_list_users(text, int) to authenticated;

commit;
