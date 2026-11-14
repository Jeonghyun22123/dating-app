-- ⚠️ 작성 중인 초안입니다. 아직 테스트하지 않았으니 Supabase 에서 실행하지 마세요.
--    (시그널 기능을 지금 완성할지 결정한 뒤 검증하고 이 줄을 지웁니다)
-- =====================================================================
-- Dating App · 시그널(Signal) 마이그레이션
-- 선행 조건: supabase_migration.sql ~ supabase_phase5.sql 실행 완료
-- 사용법: Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 한 번 실행하세요.
--
-- 시그널이란: "관심 있어요"에 메시지를 붙여 보내는 대화 신청입니다.
--   - 보통의 관심은 서로 눌러야 대화가 열리지만, 시그널은 상대에게 메시지가 바로 전달됩니다.
--   - 받은 사람이 수락하면 그 메시지로 대화가 시작되고, 거절하면 조용히 사라집니다.
--   - 가입 시 5회가 무료로 주어집니다 (기존 가입자도 5회). 추가 구매는 하트 기능과 함께 열립니다.
--
-- 포함 내용
--   1. profiles.signal_credits : 남은 시그널 횟수 (서버만 차감)
--   2. send_signal()           : 시그널 보내기 (횟수 차감, 상대 조건 확인)
--   3. received_signals() / respond_signal() : 받은 시그널 목록, 수락·거절
--   4. 매칭이 만들어질 때 시그널 메시지를 대화의 첫 메시지로 옮김
--   5. discover_profiles() : 나에게 시그널을 보낸 사람을 맨 앞에, 메시지와 함께 표시
--   6. 시그널을 신고하면 그 메시지를 증거로 저장
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. 남은 시그널 횟수
--    클라이언트에는 수정 권한을 주지 않습니다. send_signal() 만 차감합니다.
-- ---------------------------------------------------------------------
alter table profiles
  add column signal_credits int not null default 5 check (signal_credits >= 0);

-- ---------------------------------------------------------------------
-- 4. 매칭 생성 시 시그널 메시지를 첫 메시지로 (Phase 1 의 트리거 함수를 교체)
--    어느 쪽이 먼저든, 두 사람 사이에 오간 시그널 메시지가 대화의 시작이 됩니다.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_swipe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_match uuid;
begin
  if new.action in ('like', 'signal')
     and exists (
       select 1 from swipes
       where actor_id = new.target_id
         and target_id = new.actor_id
         and action in ('like', 'signal')
     )
     and not is_blocked_between(new.actor_id, new.target_id)
  then
    insert into matches (user_a, user_b)
    values (least(new.actor_id, new.target_id), greatest(new.actor_id, new.target_id))
    on conflict (user_a, user_b) do nothing
    returning id into new_match;

    -- 방금 새로 만들어진 매칭일 때만 (이미 있던 매칭이면 new_match 는 null)
    if new_match is not null then
      insert into messages (match_id, sender_id, content, created_at)
      select new_match, s.actor_id, s.message, s.created_at
      from swipes s
      where s.action = 'signal'
        and s.message is not null
        and (
          (s.actor_id = new.actor_id and s.target_id = new.target_id)
          or (s.actor_id = new.target_id and s.target_id = new.actor_id)
        )
      order by s.created_at;
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. 시그널 보내기
--    반환: { "match_id": 상대가 이미 나에게 관심을 보냈다면 바로 열린 매칭 id (아니면 null),
--            "remaining": 남은 횟수 }
-- ---------------------------------------------------------------------
create or replace function public.send_signal(p_target uuid, p_message text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me profiles%rowtype;
  target profiles%rowtype;
  msg text := trim(coalesce(p_message, ''));
  my_age int;
  remaining int;
  matched uuid;
begin
  select * into me from profiles where id = auth.uid();
  if not found or me.is_banned or me.onboarding_completed_at is null then
    raise exception '시그널을 보낼 수 없는 계정입니다.';
  end if;
  if p_target = me.id then
    raise exception '자기 자신에게는 보낼 수 없습니다.';
  end if;
  if char_length(msg) < 1 or char_length(msg) > 200 then
    raise exception '메시지는 1자 이상 200자 이하로 적어주세요.';
  end if;

  select * into target from profiles where id = p_target;
  if not found or target.is_banned or target.onboarding_completed_at is null
     or is_blocked_between(me.id, p_target) then
    raise exception '시그널을 보낼 수 없는 상대입니다.';
  end if;

  -- 상대가 정한 만남 조건(성별·나이)에 내가 맞지 않으면 보낼 수 없습니다.
  -- 추천에 뜨지 않는 사람에게 메시지를 직접 보내는 것을 막기 위함입니다.
  my_age := extract(year from age(me.birth_date))::int;
  if (target.pref_genders is not null and not (me.gender = any (target.pref_genders)))
     or my_age < coalesce(target.pref_age_min, 19)
     or (coalesce(target.pref_age_max, 60) < 60 and my_age > target.pref_age_max) then
    raise exception '시그널을 보낼 수 없는 상대입니다.';
  end if;

  if exists (select 1 from swipes where actor_id = me.id and target_id = p_target) then
    raise exception '이미 결정한 상대입니다.';
  end if;

  update profiles set signal_credits = signal_credits - 1
  where id = me.id and signal_credits > 0
  returning signal_credits into remaining;
  if not found then
    -- 앱이 이 코드를 보고 "모두 사용했어요" 안내를 띄웁니다.
    raise exception '시그널을 모두 사용했어요.' using errcode = 'P0002';
  end if;

  -- 상대가 이미 나에게 관심을 보냈다면 트리거가 매칭을 만들고 메시지를 대화로 옮깁니다.
  insert into swipes (actor_id, target_id, action, message)
  values (me.id, p_target, 'signal', msg);

  select m.id into matched
  from matches m
  where m.user_a = least(me.id, p_target) and m.user_b = greatest(me.id, p_target) and m.is_active;

  return jsonb_build_object('match_id', matched, 'remaining', remaining);
end;
$$;

-- ---------------------------------------------------------------------
-- 3. 받은 시그널
--    아직 내가 답하지 않은 것만. 정지·차단된 상대의 시그널은 보이지 않습니다.
-- ---------------------------------------------------------------------
create or replace function public.received_signals()
returns table (
  sender_id uuid,
  nickname text,
  age int,
  purpose text,
  neighborhood_name text,
  verification_status text,
  trust_level text,
  message text,
  sent_at timestamptz,
  photo_paths text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.nickname,
    extract(year from age(p.birth_date))::int,
    p.purpose,
    p.neighborhood_name,
    p.verification_status,
    trust_level(p.trust_score),
    s.message,
    s.created_at,
    coalesce((
      select array_agg(pp.storage_path order by pp.position, pp.created_at)
      from profile_photos pp
      where pp.user_id = p.id and pp.moderation_status = 'approved'
    ), '{}')
  from swipes s
  join profiles p on p.id = s.actor_id
  where s.target_id = auth.uid()
    and s.action = 'signal'
    and not p.is_banned
    and not is_blocked_between(auth.uid(), p.id)
    and not exists (select 1 from swipes mine where mine.actor_id = auth.uid() and mine.target_id = p.id)
  order by s.created_at desc
  limit 50;
$$;

-- 수락하면 매칭 id 를, 거절하면 null 을 돌려줍니다. 거절은 상대에게 알려지지 않습니다.
create or replace function public.respond_signal(p_sender uuid, p_accept boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  matched uuid;
begin
  if not is_active_user() then
    raise exception '이용할 수 없는 계정입니다.';
  end if;
  if not exists (
    select 1 from swipes where actor_id = p_sender and target_id = me and action = 'signal'
  ) then
    raise exception '받은 시그널을 찾을 수 없습니다.';
  end if;
  if exists (select 1 from swipes where actor_id = me and target_id = p_sender) then
    raise exception '이미 답한 시그널입니다.';
  end if;
  if p_accept and is_blocked_between(me, p_sender) then
    raise exception '수락할 수 없는 상대입니다.';
  end if;

  -- 수락 = 관심(like) 기록 → 트리거가 매칭을 만들고 시그널 메시지를 첫 메시지로 넣습니다.
  insert into swipes (actor_id, target_id, action)
  values (me, p_sender, case when p_accept then 'like' else 'pass' end);

  if not p_accept then
    return null;
  end if;

  select m.id into matched
  from matches m
  where m.user_a = least(me, p_sender) and m.user_b = greatest(me, p_sender) and m.is_active;
  return matched;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. 추천 목록: 나에게 시그널을 보낸 사람을 맨 앞에, 메시지와 함께
--    (반환 컬럼이 늘어나므로 Phase 5 의 함수를 지우고 다시 만듭니다. 나머지 조건은 그대로입니다)
-- ---------------------------------------------------------------------
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
    sig.message,
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
-- 6. 신고 증거: 대화 없이 접수된 신고라도, 피신고자가 신고자에게 보낸 시그널이 있으면
--    그 메시지를 스냅샷으로 남깁니다 (Phase 1 의 트리거 함수를 교체).
-- ---------------------------------------------------------------------
create or replace function public.handle_new_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.chat_snapshot := null;
  new.status := 'pending';
  new.admin_note := null;

  if new.match_id is not null then
    if not exists (
      select 1 from matches m
      where m.id = new.match_id
        and new.reporter_id in (m.user_a, m.user_b)
        and new.reported_user_id in (m.user_a, m.user_b)
    ) then
      raise exception '신고자와 피신고자가 해당 대화의 당사자가 아닙니다.';
    end if;

    select jsonb_agg(
             jsonb_build_object(
               'id', s.id,
               'sender_id', s.sender_id,
               'content', s.content,
               'image_url', s.image_url,
               'created_at', s.created_at
             )
             order by s.created_at
           )
    into new.chat_snapshot
    from (
      select id, sender_id, content, image_url, created_at
      from messages
      where match_id = new.match_id
      order by created_at desc
      limit 50
    ) s;
  else
    select jsonb_agg(
             jsonb_build_object(
               'id', s.id,
               'sender_id', s.actor_id,
               'content', s.message,
               'image_url', null,
               'created_at', s.created_at
             )
           )
    into new.chat_snapshot
    from swipes s
    where s.actor_id = new.reported_user_id
      and s.target_id = new.reporter_id
      and s.action = 'signal'
      and s.message is not null;
  end if;

  return new;
end;
$$;

-- 실행 권한
revoke execute on function public.send_signal(uuid, text) from public, anon;
revoke execute on function public.received_signals() from public, anon;
revoke execute on function public.respond_signal(uuid, boolean) from public, anon;
grant execute on function public.send_signal(uuid, text) to authenticated;
grant execute on function public.received_signals() to authenticated;
grant execute on function public.respond_signal(uuid, boolean) to authenticated;

commit;
