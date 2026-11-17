-- =====================================================================
-- Dating App · MBTI
-- 선행 조건: supabase_regions.sql 까지 실행 완료
-- 사용법: Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 한 번 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 1. profiles.mbti: 16가지 유형 중 하나 (선택 사항, 비워 둘 수 있음). 본인이 직접 입력·수정합니다.
-- 2. 둘러보기(discover_profiles)와 상대 프로필(member_profile)에 MBTI 를 함께 돌려줍니다.
--    discover_profiles 는 돌려주는 칸이 바뀌어서 지우고 다시 만듭니다 (내용은 supabase_phase7.sql 과 같고 mbti 만 추가).
-- =====================================================================

begin;

alter table profiles add column if not exists mbti text;
alter table profiles drop constraint if exists profiles_mbti_check;
alter table profiles add constraint profiles_mbti_check check (mbti is null or mbti ~ '^[EI][SN][TF][JP]$');

grant insert (mbti) on profiles to authenticated;
grant update (mbti) on profiles to authenticated;

drop function if exists public.discover_profiles(int);

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
  signal_message text,
  mbti text,
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
      least(coalesce(p.pref_distance_km, 30), 500) as max_km,
      -- 무료 회원은 남은 횟수 + 1명(뒤에 흐리게 깔리는 카드)까지만 받습니다
      case when q.unlimited then 50 else q.remaining + 1 end as max_rows
    from profiles p
    cross join lateral (select * from my_swipe_quota_internal(p.id)) q
    where p.id = auth.uid()
      and not p.is_banned
      -- 오늘 둘러보기 횟수를 다 쓴 무료 회원에게는 아무도 내려주지 않습니다 (화면 밖에서 미리 보기 방지)
      and (q.unlimited or q.remaining > 0)
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
    sig.message,
    c.mbti,
    greatest(1, round(c.meters / 1000.0))::int,
    (
      select array_agg(pp.storage_path order by pp.position, pp.created_at)
      from profile_photos pp
      where pp.user_id = c.id and pp.moderation_status = 'approved'
    )
  from candidates c
  cross join me
  -- 이 사람이 나에게 보낸 시그널 (있으면 메시지와 함께 맨 앞에 보여줍니다)
  left join swipes sig
    on sig.actor_id = c.id and sig.target_id = me.id and sig.action = 'signal'
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
    (sig.id is not null) desc,
    -- 스포트라이트 사용 중인 사람을 그다음으로
    (c.spotlight_until is not null and c.spotlight_until > now()) desc,
    (c.purpose = me.purpose) desc,
    (c.embedding <=> me.embedding) asc nulls last,
    floor(c.meters / 10000.0) asc,
    c.trust_score desc,
    c.meters asc
  limit least(greatest(p_limit, 1), 50, (select max_rows from me));
$$;

revoke execute on function public.discover_profiles(int) from public, anon;
grant execute on function public.discover_profiles(int) to authenticated;

create or replace function public.member_profile(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  found_match uuid;
  has_signal boolean;
  result jsonb;
begin
  if me is null or p_user is null or p_user = me or not is_active_user() then
    return null;
  end if;
  if is_blocked_between(me, p_user) then
    return null;
  end if;

  select m.id into found_match
  from matches m
  where m.is_active
    and ((m.user_a = me and m.user_b = p_user) or (m.user_a = p_user and m.user_b = me))
  limit 1;

  has_signal := exists (
    select 1 from swipes s
    where s.actor_id = p_user and s.target_id = me and s.action = 'signal'
      and not exists (select 1 from swipes mine where mine.actor_id = me and mine.target_id = p_user)
  );

  if found_match is null and not has_signal then
    return null;
  end if;

  select jsonb_build_object(
    'id', p.id,
    'nickname', p.nickname,
    'age', extract(year from age(p.birth_date))::int,
    'purpose', p.purpose,
    'hobbies', p.hobbies,
    'bio', p.bio,
    'mbti', p.mbti,
    'neighborhood_name', p.neighborhood_name,
    'verification_status', p.verification_status,
    'trust_level', trust_level(p.trust_score),
    'match_id', found_match,
    'photo_paths', coalesce((
      select jsonb_agg(pp.storage_path order by pp.position, pp.created_at)
      from profile_photos pp
      where pp.user_id = p.id and pp.moderation_status = 'approved'
    ), '[]'::jsonb)
  ) into result
  from profiles p
  where p.id = p_user and not p.is_banned;

  return result;
end;
$$;

revoke execute on function public.member_profile(uuid) from public, anon;
grant execute on function public.member_profile(uuid) to authenticated;

commit;
