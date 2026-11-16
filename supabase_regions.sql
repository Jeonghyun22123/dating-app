-- =====================================================================
-- Dating App · 동네 선택 + 현재 위치 인증
-- 선행 조건: supabase_member_profile.sql 까지 실행 완료 (PostGIS 사용)
-- 사용법: Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 한 번 실행하세요. 여러 번 실행해도 안전합니다.
--         실행 후 관리자 페이지 > 설정 > "동네 데이터 불러오기" 를 한 번 눌러 전국 읍·면·동 경계를 넣어야 합니다.
--
-- 바뀌는 점
--   1. regions: 전국 행정동(읍·면·동) 이름과 경계. 동네 목록과 위치 판정에 씁니다.
--   2. 앱이 동네 이름·위치를 직접 저장할 수 없게 막고, set_my_region() 으로만 저장합니다.
--      고른 동네 안(또는 바로 붙은 이웃 동)에 지금 있는지 서버가 확인한 뒤에만 저장합니다.
--   3. 저장하는 위치는 GPS 좌표가 아니라 "고른 동네의 중심점"입니다. 회원의 실제 위치는 서버에도 남지 않습니다.
--   4. 관리자 계정은 테스트를 위해 위치 인증 없이 동네를 고를 수 있습니다.
--   기존 회원의 동네 정보는 그대로 두고, 동네를 바꿀 때부터 새 방식이 적용됩니다.
--
-- 경계 데이터 출처: 통계청 통계지리정보서비스(SGIS)에서 공공누리 제1유형으로 개방한 행정동 경계를 가공한 것이며
-- (가공: vuski/admdongkor, https://github.com/vuski/admdongkor), CC BY 4.0 으로 배포됩니다.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. 동네(행정동) 표
-- ---------------------------------------------------------------------
create table if not exists regions (
  code text primary key check (code ~ '^[0-9]{10}$'), -- 행정안전부 10자리 행정기관코드
  sido text not null,      -- 예: 서울특별시
  sigungu text not null,   -- 예: 성동구, 포항시 남구
  dong text not null,      -- 예: 성수1가1동
  boundary geography(MultiPolygon, 4326) not null,
  center geography(Point, 4326) not null, -- 동네 안쪽의 대표 지점 (거리 계산에 사용)
  updated_at timestamptz default now() not null
);

create index if not exists regions_boundary_idx on regions using gist (boundary);

-- 표는 서버 함수만 읽고 씁니다 (경계 자체는 공개 자료지만 앱이 직접 볼 필요가 없음).
revoke all on regions from anon, authenticated;
alter table regions enable row level security;

-- ---------------------------------------------------------------------
-- 2. 프로필: 인증한 동네 기록 + 직접 저장 막기
-- ---------------------------------------------------------------------
alter table profiles
  add column if not exists region_code text references regions(code) on delete set null,
  add column if not exists region_verified_at timestamptz;

revoke insert (location, neighborhood_name) on profiles from authenticated;
revoke update (location, neighborhood_name) on profiles from authenticated;

-- ---------------------------------------------------------------------
-- 3. 동네 목록 · 현재 위치의 동네 찾기
-- ---------------------------------------------------------------------
-- 전체 동네 목록: [[코드, 시·도, 시·군·구, 읍·면·동], ...] (앱이 한 번 받아 두고 검색·단계 선택에 씁니다)
create or replace function public.region_list()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_array(code, sido, sigungu, dong) order by code), '[]'::jsonb)
  from regions;
$$;

-- 좌표가 속한 동네 (경계 사이 틈이나 해안가는 1km 안의 가장 가까운 동네)
create or replace function public.region_at_point(p_point geography)
returns regions
language sql
stable
security definer
set search_path = public, extensions
as $$
  select r.*
  from regions r
  where st_dwithin(r.boundary, p_point, 1000)
  order by st_covers(r.boundary, p_point) desc, st_distance(r.boundary, p_point)
  limit 1;
$$;

create or replace function public.region_at(p_lat double precision, p_lng double precision)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  found regions;
begin
  if auth.uid() is null or p_lat is null or p_lng is null
     or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    return null;
  end if;
  found := region_at_point(st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography);
  if found.code is null then
    return null;
  end if;
  return jsonb_build_object('code', found.code, 'sido', found.sido, 'sigungu', found.sigungu, 'dong', found.dong);
end;
$$;

-- ---------------------------------------------------------------------
-- 4. 동네 저장 (위치 인증)
--    p_lat / p_lng: 지금 GPS 위치. 판정에만 쓰고 저장하지 않습니다.
--    인정 범위: 고른 동네 안(경계에서 300m 이내 포함) 또는 고른 동네와 맞닿은 이웃 동 안.
--    관리자는 좌표 없이도 저장할 수 있습니다 (테스트용, 인증 시각은 남기지 않음).
-- ---------------------------------------------------------------------
create or replace function public.set_my_region(
  p_code text,
  p_lat double precision default null,
  p_lng double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  me uuid := auth.uid();
  target regions;
  here regions;
  here_point geography;
  verified boolean := false;
begin
  if me is null or not is_active_user() then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  if not exists (select 1 from profiles where id = me) then
    raise exception '프로필이 없습니다.';
  end if;

  select * into target from regions where code = p_code;
  if target.code is null then
    raise exception '동네를 찾을 수 없어요. 다시 선택해 주세요.' using errcode = 'P0009';
  end if;

  if p_lat is not null and p_lng is not null
     and p_lat between -90 and 90 and p_lng between -180 and 180 then
    here_point := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
    here := region_at_point(here_point);
    verified := st_dwithin(target.boundary, here_point, 300)
      or (here.code is not null and st_dwithin(here.boundary, target.boundary, 50));
  end if;

  if not verified and not is_admin() then
    if here_point is null then
      raise exception '현재 위치를 확인할 수 없어요. 위치 권한을 허용해 주세요.' using errcode = 'P0008';
    elsif here.code is null then
      raise exception '지금 위치가 선택한 동네(%)와 달라요. 지금 위치에서 동네를 찾지 못했어요.', target.dong
        using errcode = 'P0008';
    else
      raise exception '지금 위치가 선택한 동네(%)와 달라요. (지금 위치: % %)', target.dong, here.sigungu, here.dong
        using errcode = 'P0008';
    end if;
  end if;

  update profiles
  set location = target.center,
      neighborhood_name = target.dong,
      region_code = target.code,
      region_verified_at = case when verified then now() end
  where id = me;

  return jsonb_build_object('code', target.code, 'dong', target.dong, 'verified', verified);
end;
$$;

-- ---------------------------------------------------------------------
-- 5. 관리자: 동네 데이터 불러오기 (앱이 public/data 의 경계 파일을 나눠서 보냅니다)
--    p_rows: [{ "c": 코드, "s": 시·도, "g": 시·군·구, "d": 읍·면·동, "p": MultiPolygon 좌표 }, ...]
-- ---------------------------------------------------------------------
create or replace function public.admin_import_regions(p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  saved int;
begin
  perform assert_admin();

  with src as (
    select
      r ->> 'c' as code, r ->> 's' as sido, r ->> 'g' as sigungu, r ->> 'd' as dong,
      st_multi(st_collectionextract(st_makevalid(
        st_setsrid(st_geomfromgeojson(jsonb_build_object('type', 'MultiPolygon', 'coordinates', r -> 'p')::text), 4326)
      ), 3)) as geom
    from jsonb_array_elements(p_rows) r
  )
  insert into regions (code, sido, sigungu, dong, boundary, center, updated_at)
  select code, sido, sigungu, dong, geom::geography, st_pointonsurface(geom)::geography, now()
  from src
  where code ~ '^[0-9]{10}$' and not st_isempty(geom)
  on conflict (code) do update
    set sido = excluded.sido, sigungu = excluded.sigungu, dong = excluded.dong,
        boundary = excluded.boundary, center = excluded.center, updated_at = now();

  get diagnostics saved = row_count;
  return saved;
end;
$$;

-- 지금 들어 있는 동네 수 (관리자 화면 표시용)
create or replace function public.admin_region_count()
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform assert_admin();
  return (select count(*)::int from regions);
end;
$$;

revoke execute on function public.region_list() from public, anon;
revoke execute on function public.region_at_point(geography) from public, anon, authenticated;
revoke execute on function public.region_at(double precision, double precision) from public, anon;
revoke execute on function public.set_my_region(text, double precision, double precision) from public, anon;
revoke execute on function public.admin_import_regions(jsonb) from public, anon;
revoke execute on function public.admin_region_count() from public, anon;
grant execute on function public.region_list() to authenticated;
grant execute on function public.region_at(double precision, double precision) to authenticated;
grant execute on function public.set_my_region(text, double precision, double precision) to authenticated;
grant execute on function public.admin_import_regions(jsonb) to authenticated;
grant execute on function public.admin_region_count() to authenticated;

commit;
