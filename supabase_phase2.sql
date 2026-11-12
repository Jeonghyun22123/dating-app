-- =====================================================================
-- Dating App · Phase 2 마이그레이션 (온보딩, 프로필 사진, 셀카 인증)
-- 선행 조건: supabase_migration.sql 실행 완료
-- 사용법: Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 한 번 실행하세요.
--
-- 포함 내용
--   1. profiles 컬럼 추가 (온보딩 완료 시각, 셀카 제출 시각)
--   2. 만 19세 미만 가입을 DB 에서 차단하는 트리거
--   3. profile_photos 테이블 (사진별 AI 검수 상태)
--   4. Storage 버킷 2개 (profile-photos, verification-selfies) 와 접근 정책
--   5. complete_onboarding() : 필수 단계를 모두 마쳤는지 서버가 확인
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. profiles 컬럼 추가
--    두 컬럼 모두 클라이언트가 직접 수정할 수 없습니다 (update 권한을 주지 않음).
-- ---------------------------------------------------------------------
alter table profiles
  add column onboarding_completed_at timestamptz,
  add column selfie_submitted_at timestamptz;

-- ---------------------------------------------------------------------
-- 2. 만 19세 미만 가입 차단
--    앱 화면에서도 검사하지만, 앱을 우회한 직접 요청도 막기 위해 DB 에서 한 번 더 확인합니다.
--    (생년월일은 가입 후 클라이언트가 수정할 수 없으므로 insert 시점만 검사하면 됩니다)
--    PortOne 본인인증 도입 후에는 서버가 인증 결과로 직접 값을 넣게 됩니다.
-- ---------------------------------------------------------------------
create or replace function public.enforce_adult_on_signup()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.birth_date > (now() at time zone 'Asia/Seoul')::date - interval '19 years' then
    raise exception '만 19세 이상만 가입할 수 있습니다.' using errcode = 'check_violation';
  end if;
  if new.birth_date < date '1900-01-01' then
    raise exception '생년월일이 올바르지 않습니다.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger profiles_enforce_adult
  before insert on profiles
  for each row execute function public.enforce_adult_on_signup();

-- ---------------------------------------------------------------------
-- 3. 프로필 사진
--    storage_path 는 profile-photos 버킷 안의 경로이며 항상 "<유저 id>/<파일명>" 형태입니다.
--    moderation_status 는 Edge Function(moderate-photo) 만 변경합니다.
--    approved 가 된 사진만 다른 사용자에게 보입니다.
-- ---------------------------------------------------------------------
create table profile_photos (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  storage_path text not null unique,
  position int default 0 not null check (position between 0 and 5),
  moderation_status text default 'pending' not null
    check (moderation_status in ('pending', 'approved', 'rejected')),
  moderation_reason text,
  created_at timestamptz default now()
);

create index profile_photos_user_idx on profile_photos (user_id, position);

-- 1인당 최대 6장
create or replace function public.enforce_photo_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from profile_photos where user_id = new.user_id) >= 6 then
    raise exception '프로필 사진은 최대 6장까지 등록할 수 있습니다.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger profile_photos_limit
  before insert on profile_photos
  for each row execute function public.enforce_photo_limit();

revoke all on profile_photos from anon, authenticated;
grant select, delete on profile_photos to authenticated;
-- moderation_status / moderation_reason 은 클라이언트가 넣거나 바꿀 수 없습니다.
grant insert (user_id, storage_path, position) on profile_photos to authenticated;
grant update (position) on profile_photos to authenticated;

alter table profile_photos enable row level security;

create policy "Users can view own photos and approved photos of others"
on profile_photos for select to authenticated
using (
  user_id = auth.uid()
  or is_admin()
  or (moderation_status = 'approved' and not is_blocked_between(auth.uid(), user_id))
);

create policy "Users can add own photos"
on profile_photos for insert to authenticated
with check (
  user_id = auth.uid()
  and is_active_user()
  -- 남의 폴더에 있는 파일을 자기 사진으로 등록하지 못하게 합니다.
  and storage_path like auth.uid()::text || '/%'
);

create policy "Users can reorder own photos"
on profile_photos for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete own photos"
on profile_photos for delete to authenticated
using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 4. Storage 버킷과 접근 정책
--    두 버킷 모두 비공개(private)입니다. 사진은 Signed URL 로만 볼 수 있습니다.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('profile-photos', 'profile-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('verification-selfies', 'verification-selfies', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

-- ---- profile-photos ----
create policy "profile-photos: upload to own folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 본인 사진은 항상, 타인 사진은 검수를 통과했고 서로 차단하지 않은 경우에만 열람 가능
create policy "profile-photos: view own or approved"
on storage.objects for select to authenticated
using (
  bucket_id = 'profile-photos'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
    or exists (
      select 1 from public.profile_photos pp
      where pp.storage_path = storage.objects.name
        and pp.moderation_status = 'approved'
        and not public.is_blocked_between(auth.uid(), pp.user_id)
    )
  )
);

create policy "profile-photos: delete own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- ---- verification-selfies ----
-- 본인은 올리기만 가능하고 다시 내려받을 수 없습니다. 열람은 수동 심사를 하는 관리자만 가능하며,
-- 삭제(영구 파기)는 서버(Edge Function, service_role)가 검증 완료 즉시 수행합니다.
create policy "verification-selfies: upload to own folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'verification-selfies'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "verification-selfies: admins can view"
on storage.objects for select to authenticated
using (bucket_id = 'verification-selfies' and public.is_admin());

-- ---------------------------------------------------------------------
-- 5. 온보딩 완료 처리
--    클라이언트가 단계를 건너뛰지 못하도록 서버가 필수 조건을 확인한 뒤 완료 시각을 기록합니다.
-- ---------------------------------------------------------------------
create or replace function public.complete_onboarding()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  me profiles%rowtype;
  done_at timestamptz;
begin
  select * into me from profiles where id = auth.uid();

  if not found then
    raise exception '프로필이 없습니다.';
  end if;
  if me.onboarding_completed_at is not null then
    return me.onboarding_completed_at;
  end if;
  if me.location is null or coalesce(me.neighborhood_name, '') = '' then
    raise exception '동네 설정이 필요합니다.';
  end if;
  if not exists (
    select 1 from profile_photos
    where user_id = me.id and moderation_status <> 'rejected'
  ) then
    raise exception '프로필 사진을 1장 이상 등록해 주세요.';
  end if;
  if me.selfie_submitted_at is null then
    raise exception '셀카 인증이 필요합니다.';
  end if;

  update profiles set onboarding_completed_at = now()
  where id = me.id
  returning onboarding_completed_at into done_at;

  return done_at;
end;
$$;

revoke execute on function public.complete_onboarding() from public, anon;
grant execute on function public.complete_onboarding() to authenticated;
revoke execute on function public.enforce_adult_on_signup() from public, anon, authenticated;
revoke execute on function public.enforce_photo_limit() from public, anon, authenticated;

-- public_profiles 뷰에 대표 사진 경로는 넣지 않습니다.
-- 사진은 profile_photos 를 조회해 Signed URL 로 불러옵니다 (Phase 3 추천 화면에서 사용).

commit;
