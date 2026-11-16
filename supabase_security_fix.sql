-- =====================================================================
-- Dating App · Supabase 보안 점검(Security Advisor) 오류 2건 정리
-- 선행 조건: supabase_photo_review.sql 까지 실행 완료
-- 사용법: Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 한 번 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 1. security_definer_view (public.public_profiles)
--    다른 회원에게 보여줄 칸만 골라 둔 뷰였지만, 앱은 이 뷰를 쓰지 않고 서버 함수(discover_profiles 등)로만
--    다른 회원 정보를 받습니다. 쓰지 않는 통로는 없애는 것이 가장 안전하므로 삭제합니다.
--
-- 2. rls_disabled_in_public (public.spatial_ref_sys)
--    PostGIS 가 만드는 "좌표계 목록" 표입니다 (EPSG 번호 같은 공개 참고 자료, 회원 정보 없음).
--    읽기만 허용하는 보안 규칙(RLS)을 켜서 경고를 없앱니다. 위치 계산은 이 표를 읽어야 하므로 읽기는 그대로 둡니다.
--    이 표의 주인은 Supabase 시스템 계정이라 권한이 없다는 안내가 나올 수 있습니다.
--    그 경우 이 항목은 무시해도 안전합니다 (Supabase 공식 문서도 같은 안내).
-- =====================================================================

-- 1) 쓰지 않는 뷰 삭제
drop view if exists public.public_profiles;

-- 2) 좌표계 표: 읽기 전용 RLS
do $$
begin
  execute 'alter table public.spatial_ref_sys enable row level security';
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'spatial_ref_sys'
  ) then
    execute 'create policy "Anyone can read coordinate systems" on public.spatial_ref_sys for select using (true)';
  end if;
  -- 앱이 이 표에 쓰기를 할 일은 없습니다.
  execute 'revoke insert, update, delete on public.spatial_ref_sys from anon, authenticated';
  raise notice 'spatial_ref_sys: 읽기 전용 보안 규칙을 켰습니다.';
exception
  when insufficient_privilege then
    raise notice 'spatial_ref_sys: 시스템 소유 표라 바꿀 수 없습니다. 이 경고는 무시해도 안전합니다 (회원 정보가 없는 공개 참고 자료).';
  when undefined_table then
    raise notice 'spatial_ref_sys: 표가 없습니다. 건너뜁니다.';
end;
$$;
