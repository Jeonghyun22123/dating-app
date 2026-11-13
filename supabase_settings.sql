-- =====================================================================
-- Dating App · 설정 화면용 마이그레이션 (알림 수신 설정)
-- 선행 조건: supabase_migration.sql ~ supabase_phase4.sql 실행 완료
-- 사용법: Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 한 번 실행하세요.
--
-- 포함 내용
--   - profiles.notification_prefs : 알림 종류별 수신 여부 (새 매칭 / 새 메시지 / 이벤트·혜택)
--   - profiles.marketing_opt_in_at: 이벤트·혜택 소식 수신에 동의한 시각 (동의 증빙용, 서버가 기록)
--
-- 참고: 푸시 알림 발송 자체는 앱 출시 단계(로드맵 Phase 10)에서 만듭니다.
--       여기서는 사용자의 선택을 미리 저장해 두어, 그때 이 값을 보고 보낼지 말지를 정합니다.
--       화면 테마(화이트/다크/블랙 & 핑크)는 계정이 아니라 기기에 저장되므로 DB 변경이 없습니다.
-- =====================================================================

begin;

alter table profiles
  add column notification_prefs jsonb not null
    default '{"match": true, "message": true, "marketing": false}'::jsonb
    -- 세 항목이 모두 true/false 로 들어 있어야 합니다.
    check (
      jsonb_typeof(notification_prefs -> 'match') = 'boolean'
      and jsonb_typeof(notification_prefs -> 'message') = 'boolean'
      and jsonb_typeof(notification_prefs -> 'marketing') = 'boolean'
    ),
  add column marketing_opt_in_at timestamptz;

-- 본인이 수신 설정만 바꿀 수 있습니다. 동의 시각은 아래 트리거(서버)만 기록합니다.
grant update (notification_prefs) on profiles to authenticated;

-- 이벤트·혜택 소식(광고성 정보)은 동의한 시각을 남겨 두어야 합니다.
-- 켜는 순간 시각을 기록하고, 끄면 지웁니다.
create or replace function public.track_marketing_opt_in()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  was_on boolean := coalesce((old.notification_prefs ->> 'marketing')::boolean, false);
  is_on boolean := coalesce((new.notification_prefs ->> 'marketing')::boolean, false);
begin
  if is_on and not was_on then
    new.marketing_opt_in_at := now();
  elsif not is_on then
    new.marketing_opt_in_at := null;
  end if;
  return new;
end;
$$;

create trigger profiles_track_marketing_opt_in
  before update of notification_prefs on profiles
  for each row execute function public.track_marketing_opt_in();

revoke execute on function public.track_marketing_opt_in() from public, anon, authenticated;

commit;
