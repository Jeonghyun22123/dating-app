-- =====================================================================
-- Dating App · Phase 3 마이그레이션 (추천, 매칭, 채팅)
-- 선행 조건: supabase_migration.sql, supabase_phase2.sql 실행 완료
-- 사용법: Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 한 번 실행하세요.
--
-- 포함 내용
--   1. discover_profiles() : 내 주변 추천 목록 (근사 거리 km 만 반환, 좌표 비노출)
--   2. swipe_profile()     : 좋아요/패스 기록 후 매칭되면 매칭 id 반환
--   3. my_matches()        : 매칭 목록 + 마지막 메시지 + 안 읽은 개수
--   4. unmatch()           : 매칭 해제
--   5. messages 권한 보강  : 클라이언트가 임의의 image_url 을 넣지 못하게 제한
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. 추천 목록
--    - 본인, 정지 계정, 온보딩 미완료, 이미 좋아요/패스한 사람, 차단 관계는 제외
--    - 승인된 사진이 1장 이상 있는 사람만
--    - 정렬: 같은 만남 목적 우선 → 성향(임베딩) 유사도 → 가까운 순
--    - 정확한 좌표는 절대 반환하지 않고, 1km 단위로 반올림한 거리만 돌려줍니다 (최소 1km).
--    search_path 에 extensions 를 넣는 이유: Supabase 에서 PostGIS / pgvector 가
--    public 또는 extensions 스키마 중 어디에 설치되어 있어도 동작하게 하기 위함입니다.
-- ---------------------------------------------------------------------
create or replace function public.discover_profiles(p_max_km int default 30, p_limit int default 20)
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
  distance_km int,
  photo_paths text[]
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with me as (
    select p.id, p.location, p.purpose, p.embedding
    from profiles p
    where p.id = auth.uid()
      and not p.is_banned
      and p.onboarding_completed_at is not null
      and p.location is not null
  )
  select
    p.id,
    p.nickname,
    extract(year from age(p.birth_date))::int,
    p.gender,
    p.purpose,
    p.hobbies,
    p.bio,
    p.neighborhood_name,
    p.verification_status,
    greatest(1, round(st_distance(me.location, p.location) / 1000.0))::int,
    (
      select array_agg(pp.storage_path order by pp.position, pp.created_at)
      from profile_photos pp
      where pp.user_id = p.id and pp.moderation_status = 'approved'
    )
  from profiles p
  cross join me
  where p.id <> me.id
    and not p.is_banned
    and p.onboarding_completed_at is not null
    and p.location is not null
    and st_dwithin(me.location, p.location, least(greatest(p_max_km, 1), 200) * 1000.0)
    and exists (
      select 1 from profile_photos pp
      where pp.user_id = p.id and pp.moderation_status = 'approved'
    )
    and not exists (
      select 1 from swipes s where s.actor_id = me.id and s.target_id = p.id
    )
    and not exists (
      select 1 from blocks b
      where (b.blocker_id = me.id and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = me.id)
    )
  order by
    (p.purpose = me.purpose) desc,
    (p.embedding <=> me.embedding) asc nulls last,
    st_distance(me.location, p.location) asc
  limit least(greatest(p_limit, 1), 50);
$$;

-- ---------------------------------------------------------------------
-- 2. 좋아요 / 패스
--    호출자 권한으로 실행되므로 swipes 의 RLS 정책(본인만, pass/like 만, 차단 관계 불가)이
--    그대로 적용됩니다. 서로 좋아요면 Phase 1 의 트리거가 매칭을 만들고, 그 id 를 돌려줍니다.
-- ---------------------------------------------------------------------
create or replace function public.swipe_profile(p_target uuid, p_action text)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  me uuid := auth.uid();
  matched uuid;
begin
  insert into swipes (actor_id, target_id, action)
  values (me, p_target, p_action)
  on conflict (actor_id, target_id) do nothing;

  if p_action <> 'like' then
    return null;
  end if;

  select m.id into matched
  from matches m
  where m.user_a = least(me, p_target)
    and m.user_b = greatest(me, p_target)
    and m.is_active;

  return matched;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. 내 매칭 목록 (채팅 목록 화면용)
-- ---------------------------------------------------------------------
create or replace function public.my_matches()
returns table (
  match_id uuid,
  is_active boolean,
  matched_at timestamptz,
  other_id uuid,
  nickname text,
  photo_path text,
  last_message text,
  last_message_at timestamptz,
  last_sender_id uuid,
  unread_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.is_active,
    m.created_at,
    o.id,
    o.nickname,
    (
      select pp.storage_path from profile_photos pp
      where pp.user_id = o.id and pp.moderation_status = 'approved'
      order by pp.position, pp.created_at
      limit 1
    ),
    last.content,
    last.created_at,
    last.sender_id,
    (
      select count(*)::int from messages x
      where x.match_id = m.id and x.sender_id <> auth.uid() and not x.is_read
    )
  from matches m
  join profiles o
    on o.id = case when m.user_a = auth.uid() then m.user_b else m.user_a end
  left join lateral (
    select x.content, x.created_at, x.sender_id
    from messages x
    where x.match_id = m.id
    order by x.created_at desc
    limit 1
  ) last on true
  where auth.uid() in (m.user_a, m.user_b)
    and not o.is_banned
    -- 차단한(당한) 상대와의 대화는 목록에서 숨깁니다.
    and not exists (
      select 1 from blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = o.id)
         or (b.blocker_id = o.id and b.blocked_id = auth.uid())
    )
  order by coalesce(last.created_at, m.created_at) desc;
$$;

-- ---------------------------------------------------------------------
-- 4. 매칭 해제 (당사자만 가능. 이후 메시지 전송 불가, 기존 대화는 남음)
-- ---------------------------------------------------------------------
create or replace function public.unmatch(p_match_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update matches set is_active = false
  where id = p_match_id and auth.uid() in (user_a, user_b);
$$;

-- ---------------------------------------------------------------------
-- 5. messages 권한 보강
--    Phase 1 에서는 모든 컬럼 insert 를 허용했지만, image_url 에 임의의 외부 주소
--    (추적용 이미지 등)를 넣을 수 있으므로 텍스트 관련 컬럼만 허용합니다.
--    채팅 이미지 전송은 추후 서버 검수(moderate-photo)를 거치는 방식으로 엽니다.
-- ---------------------------------------------------------------------
revoke insert on messages from authenticated;
grant insert (match_id, sender_id, content) on messages to authenticated;

-- 함수 실행 권한: 로그인 사용자만
revoke execute on function public.discover_profiles(int, int) from public, anon;
revoke execute on function public.swipe_profile(uuid, text) from public, anon;
revoke execute on function public.my_matches() from public, anon;
revoke execute on function public.unmatch(uuid) from public, anon;
grant execute on function public.discover_profiles(int, int) to authenticated;
grant execute on function public.swipe_profile(uuid, text) to authenticated;
grant execute on function public.my_matches() to authenticated;
grant execute on function public.unmatch(uuid) to authenticated;

commit;
