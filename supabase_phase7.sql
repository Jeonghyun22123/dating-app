-- =====================================================================
-- Dating App · Phase 7 마이그레이션 (하트, 스포트라이트, 무료 횟수 제한, 받은 관심)
-- 선행 조건: ROADMAP.md 의 "Supabase SQL 실행 순서" 1~8 실행 완료
-- 사용법: Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 한 번 실행하세요.
--
-- 결제는 아직 없습니다 (Phase 8). 하트는 관리자가 지급하는 방식으로 먼저 테스트합니다.
--
-- 포함 내용
--   1. 운영 숫자(economy)   : 하루 둘러보기 횟수, 시그널·스포트라이트 하트 가격 등 — 관리자 설정에서 변경
--   2. 하트 지갑            : 잔액 변경은 서버 함수만, 모든 변경은 wallet_transactions 에 기록
--   3. 하루 둘러보기 제한    : 무료 회원의 관심/다음에 횟수를 서버가 셈 (한국 시간 자정에 초기화)
--   4. 시그널 하트 결제      : 무료 5회를 다 쓰면 하트로 보냄
--   5. 스포트라이트          : 하트를 써서 일정 시간 추천 맨 앞쪽에 노출
--   6. 받은 관심 보기        : 나에게 관심을 보낸 사람 — 프리미엄 회원만 명단, 무료 회원은 인원수만
--   7. 관리자              : 하트 지급, 프리미엄 지정, 운영 숫자 변경, 회원 목록에 하트·프리미엄 표시
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. 운영 숫자
-- ---------------------------------------------------------------------
insert into app_settings (key, value) values (
  'economy',
  '{"daily_swipe_limit": 30, "signal_heart_cost": 3, "spotlight_heart_cost": 10, "spotlight_minutes": 30}'
)
on conflict (key) do nothing;

create or replace function public.economy()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select value from app_settings where key = 'economy'),
    '{"daily_swipe_limit": 30, "signal_heart_cost": 3, "spotlight_heart_cost": 10, "spotlight_minutes": 30}'::jsonb
  );
$$;

-- 프리미엄이 지금 유효한지 (만료일이 없으면 무기한)
create or replace function public.is_premium_active(p profiles)
returns boolean
language sql
stable
as $$
  select coalesce(p.is_premium, false) and (p.premium_expires_at is null or p.premium_expires_at > now());
$$;

alter table profiles add column spotlight_until timestamptz;

-- ---------------------------------------------------------------------
-- 2. 하트 지갑
--    잔액(profiles.coin_balance)과 내역(wallet_transactions)을 항상 함께 바꿉니다.
--    클라이언트는 직접 부를 수 없고, 아래의 서버 함수들만 부릅니다.
--    반환: 바뀐 뒤 잔액. 잔액이 모자라면 P0004 오류.
-- ---------------------------------------------------------------------
create or replace function public.apply_wallet(p_user uuid, p_amount int, p_type text, p_reference text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  balance int;
begin
  if p_amount = 0 then
    select coin_balance into balance from profiles where id = p_user;
    return balance;
  end if;

  update profiles set coin_balance = coin_balance + p_amount
  where id = p_user and coin_balance + p_amount >= 0
  returning coin_balance into balance;
  if not found then
    raise exception '하트가 부족해요.' using errcode = 'P0004';
  end if;

  insert into wallet_transactions (user_id, amount, type, reference_id)
  values (p_user, p_amount, p_type, p_reference);
  return balance;
end;
$$;

alter table wallet_transactions
  add constraint wallet_transactions_type_check
  check (type in ('purchase', 'signal', 'spotlight', 'bonus', 'admin_grant', 'refund'));

-- 내 지갑: 잔액, 프리미엄, 스포트라이트, 가격표, 최근 내역 30건
create or replace function public.my_wallet()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'balance', p.coin_balance,
    'signal_credits', p.signal_credits,
    'premium', is_premium_active(p),
    'premium_expires_at', case when is_premium_active(p) then p.premium_expires_at end,
    'spotlight_until', case when p.spotlight_until > now() then p.spotlight_until end,
    'prices', jsonb_build_object(
      'signal', (economy() ->> 'signal_heart_cost')::int,
      'spotlight', (economy() ->> 'spotlight_heart_cost')::int,
      'spotlight_minutes', (economy() ->> 'spotlight_minutes')::int
    ),
    'transactions', coalesce((
      select jsonb_agg(jsonb_build_object('amount', t.amount, 'type', t.type, 'created_at', t.created_at)
                       order by t.created_at desc)
      from (select * from wallet_transactions where user_id = p.id order by created_at desc limit 30) t
    ), '[]'::jsonb)
  )
  from profiles p
  where p.id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- 3. 하루 둘러보기 제한 (무료 회원)
--    세는 것: 내가 누른 "관심 있어요" + "다음에" (한국 시간 오늘 0시부터)
--    세지 않는 것: 시그널(따로 횟수·하트를 씀), 나에게 먼저 관심·시그널을 보낸 사람에게 답한 것
-- ---------------------------------------------------------------------
create or replace function public.kst_day_start()
returns timestamptz
language sql
stable
as $$
  select date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
$$;

create or replace function public.my_swipe_quota_internal(p_user uuid)
returns table (unlimited boolean, daily_limit int, used int, remaining int, resets_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select * from profiles where id = p_user),
  counted as (
    select count(*)::int as n
    from swipes s
    where s.actor_id = p_user
      and s.action in ('like', 'pass')
      and s.created_at >= kst_day_start()
      and not exists (
        select 1 from swipes back
        where back.actor_id = s.target_id and back.target_id = p_user and back.action in ('like', 'signal')
          and back.created_at < s.created_at
      )
  )
  select
    is_premium_active(me),
    (economy() ->> 'daily_swipe_limit')::int,
    counted.n,
    greatest((economy() ->> 'daily_swipe_limit')::int - counted.n, 0),
    kst_day_start() + interval '1 day'
  from me, counted;
$$;

create or replace function public.my_swipe_quota()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'unlimited', q.unlimited, 'limit', q.daily_limit, 'used', q.used,
    'remaining', case when q.unlimited then null else q.remaining end, 'resets_at', q.resets_at
  )
  from my_swipe_quota_internal(auth.uid()) q;
$$;

-- 관심/다음에를 기록할 때마다 확인합니다. 앱을 거치지 않은 직접 요청도 여기서 막힙니다.
create or replace function public.enforce_swipe_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  q record;
begin
  -- 사용자 본인의 요청만 셉니다 (서버 작업·테스트 데이터는 제외)
  if auth.uid() is null or new.actor_id <> auth.uid() or new.action not in ('like', 'pass') then
    return new;
  end if;
  -- 나에게 먼저 관심·시그널을 보낸 사람에게 답하는 것은 세지 않습니다.
  if exists (
    select 1 from swipes back
    where back.actor_id = new.target_id and back.target_id = new.actor_id and back.action in ('like', 'signal')
  ) then
    return new;
  end if;

  select * into q from my_swipe_quota_internal(new.actor_id);
  if not q.unlimited and q.remaining <= 0 then
    raise exception '오늘의 둘러보기 횟수를 모두 사용했어요.' using errcode = 'P0003';
  end if;
  return new;
end;
$$;

create trigger swipes_enforce_quota
  before insert on swipes
  for each row execute function public.enforce_swipe_quota();

-- ---------------------------------------------------------------------
-- 추천 목록 (signal 마이그레이션의 함수에 아래만 더했습니다)
--   - 오늘 횟수를 다 쓴 무료 회원에게는 빈 목록
--   - 무료 회원에게는 남은 횟수 + 1명까지만
--   - 스포트라이트 사용 중인 사람을 앞쪽에
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 4. 시그널: 무료 횟수 → 하트 순서로 결제 (signal 마이그레이션의 함수를 교체)
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
  cost int := (economy() ->> 'signal_heart_cost')::int;
  paid text := 'credit';
  hearts_left int;
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

  -- 무료 시그널이 남아 있으면 그것부터, 없으면 하트로 보냅니다.
  update profiles set signal_credits = signal_credits - 1
  where id = me.id and signal_credits > 0
  returning signal_credits into remaining;
  if not found then
    remaining := 0;
    if me.coin_balance < cost then
      -- 앱이 이 코드를 보고 "시그널을 모두 썼고 하트도 부족해요" 안내를 띄웁니다.
      raise exception '무료 시그널을 모두 사용했고 하트가 부족해요.' using errcode = 'P0002';
    end if;
    hearts_left := apply_wallet(me.id, -cost, 'signal', null);
    paid := 'hearts';
  end if;

  -- 상대가 이미 나에게 관심을 보냈다면 트리거가 매칭을 만들고 메시지를 대화로 옮깁니다.
  insert into swipes (actor_id, target_id, action, message)
  values (me.id, p_target, 'signal', msg);

  select m.id into matched
  from matches m
  where m.user_a = least(me.id, p_target) and m.user_b = greatest(me.id, p_target) and m.is_active;

  return jsonb_build_object(
    'match_id', matched,
    'remaining', remaining,
    'paid_with', paid,
    'hearts_left', coalesce(hearts_left, (select coin_balance from profiles where id = me.id))
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 5. 스포트라이트: 하트를 써서 정해진 시간 동안 추천 앞쪽에 노출
--    이미 사용 중이면 남은 시간에 이어서 늘어납니다. 반환: 끝나는 시각
-- ---------------------------------------------------------------------
create or replace function public.activate_spotlight()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  me profiles%rowtype;
  cost int := (economy() ->> 'spotlight_heart_cost')::int;
  minutes int := (economy() ->> 'spotlight_minutes')::int;
  until timestamptz;
begin
  select * into me from profiles where id = auth.uid() for update;
  if not found or me.is_banned or me.onboarding_completed_at is null then
    raise exception '스포트라이트를 사용할 수 없는 계정입니다.';
  end if;

  perform apply_wallet(me.id, -cost, 'spotlight', null);

  update profiles
  set spotlight_until = greatest(coalesce(spotlight_until, now()), now()) + make_interval(mins => minutes)
  where id = me.id
  returning spotlight_until into until;
  return until;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. 받은 관심 (나에게 "관심 있어요"를 보냈고 내가 아직 답하지 않은 사람)
--    시그널은 채팅 탭의 "받은 시그널"에서 따로 보여주므로 여기서는 제외합니다.
--    인원수는 누구나, 명단은 프리미엄 회원만 받습니다 (무료 회원에게는 정보 자체를 보내지 않음).
-- ---------------------------------------------------------------------
create or replace function public.received_likes_base(p_user uuid)
returns table (liker uuid, liked_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select s.actor_id, s.created_at
  from swipes s
  join profiles p on p.id = s.actor_id
  where s.target_id = p_user
    and s.action = 'like'
    and not p.is_banned
    and p.onboarding_completed_at is not null
    and not is_blocked_between(p_user, p.id)
    and not exists (select 1 from swipes mine where mine.actor_id = p_user and mine.target_id = p.id);
$$;

create or replace function public.received_likes_count()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from received_likes_base(auth.uid());
$$;

create or replace function public.received_likes()
returns table (
  id uuid,
  nickname text,
  age int,
  purpose text,
  neighborhood_name text,
  verification_status text,
  trust_level text,
  liked_at timestamptz,
  photo_paths text[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from profiles p where p.id = auth.uid() and is_premium_active(p)) then
    raise exception '프리미엄 회원만 볼 수 있어요.' using errcode = 'P0005';
  end if;

  return query
  select
    p.id, p.nickname, extract(year from age(p.birth_date))::int, p.purpose, p.neighborhood_name,
    p.verification_status, trust_level(p.trust_score), b.liked_at,
    coalesce((
      select array_agg(pp.storage_path order by pp.position, pp.created_at)
      from profile_photos pp where pp.user_id = p.id and pp.moderation_status = 'approved'
    ), '{}')
  from received_likes_base(auth.uid()) b
  join profiles p on p.id = b.liker
  order by b.liked_at desc
  limit 100;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. 관리자
-- ---------------------------------------------------------------------
-- 하트 지급(양수) 또는 회수(음수, 잔액 아래로는 못 내림). 반환: 바뀐 잔액
create or replace function public.admin_grant_hearts(p_user uuid, p_amount int, p_note text default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  balance int;
begin
  perform assert_admin();
  if p_amount = 0 or abs(p_amount) > 10000 then
    raise exception '지급할 하트 수가 올바르지 않습니다.';
  end if;
  balance := apply_wallet(p_user, p_amount, 'admin_grant', null);
  insert into admin_actions (admin_id, action, target_user_id, detail)
  values (auth.uid(), 'hearts_granted', p_user,
          jsonb_build_object('amount', p_amount, 'note', nullif(trim(coalesce(p_note, '')), '')));
  return balance;
end;
$$;

-- 프리미엄 지정: p_days 일 동안 (0 이면 해제). 결제(Phase 8) 전 테스트용.
create or replace function public.admin_set_premium(p_user uuid, p_days int)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  until timestamptz;
begin
  perform assert_admin();
  if p_days < 0 or p_days > 3650 then
    raise exception '기간이 올바르지 않습니다.';
  end if;

  if p_days = 0 then
    update profiles set is_premium = false, premium_expires_at = null where id = p_user;
  else
    update profiles
    set is_premium = true,
        premium_expires_at = greatest(coalesce(case when is_premium_active(profiles) then premium_expires_at end, now()), now())
                             + make_interval(days => p_days)
    where id = p_user
    returning premium_expires_at into until;
  end if;
  if not found then
    raise exception '사용자를 찾을 수 없습니다.';
  end if;

  insert into admin_actions (admin_id, action, target_user_id, detail)
  values (auth.uid(), case when p_days = 0 then 'premium_removed' else 'premium_granted' end, p_user,
          jsonb_build_object('days', p_days));
  return until;
end;
$$;

-- 운영 숫자 변경 (하루 둘러보기 횟수, 시그널·스포트라이트 가격, 스포트라이트 시간)
create or replace function public.admin_update_economy(
  p_daily_swipe_limit int, p_signal_heart_cost int, p_spotlight_heart_cost int, p_spotlight_minutes int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  next_value jsonb;
begin
  perform assert_admin();
  if p_daily_swipe_limit not between 1 and 1000
     or p_signal_heart_cost not between 0 and 1000
     or p_spotlight_heart_cost not between 0 and 1000
     or p_spotlight_minutes not between 5 and 1440 then
    raise exception '값이 허용 범위를 벗어났습니다.';
  end if;

  next_value := jsonb_build_object(
    'daily_swipe_limit', p_daily_swipe_limit,
    'signal_heart_cost', p_signal_heart_cost,
    'spotlight_heart_cost', p_spotlight_heart_cost,
    'spotlight_minutes', p_spotlight_minutes
  );
  insert into app_settings (key, value, updated_at, updated_by) values ('economy', next_value, now(), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();

  insert into admin_actions (admin_id, action, detail) values (auth.uid(), 'settings_economy', next_value);
  return next_value;
end;
$$;

-- 회원 목록: 하트 잔액과 프리미엄 만료일 추가 (반환 형식이 바뀌어 지우고 다시 만듭니다)
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
  trust_score numeric,
  coin_balance int,
  premium_until timestamptz
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
    p.trust_score,
    p.coin_balance,
    case when is_premium_active(p) then coalesce(p.premium_expires_at, 'infinity'::timestamptz) end
  from profiles p
  join auth.users u on u.id = p.id
  where term = ''
     or p.nickname ilike '%' || term || '%'
     or u.email ilike '%' || term || '%'
  order by p.created_at desc
  limit least(greatest(p_limit, 1), 200);
end;
$$;

-- ---------------------------------------------------------------------
-- 실행 권한
-- ---------------------------------------------------------------------
revoke execute on function public.apply_wallet(uuid, int, text, text) from public, anon, authenticated;
revoke execute on function public.my_swipe_quota_internal(uuid) from public, anon, authenticated;
revoke execute on function public.received_likes_base(uuid) from public, anon, authenticated;
revoke execute on function public.enforce_swipe_quota() from public, anon, authenticated;
revoke execute on function public.economy() from public, anon;
revoke execute on function public.my_wallet() from public, anon;
revoke execute on function public.my_swipe_quota() from public, anon;
revoke execute on function public.activate_spotlight() from public, anon;
revoke execute on function public.received_likes_count() from public, anon;
revoke execute on function public.received_likes() from public, anon;
revoke execute on function public.admin_grant_hearts(uuid, int, text) from public, anon;
revoke execute on function public.admin_set_premium(uuid, int) from public, anon;
revoke execute on function public.admin_update_economy(int, int, int, int) from public, anon;
revoke execute on function public.admin_list_users(text, int) from public, anon;
revoke execute on function public.discover_profiles(int) from public, anon;
revoke execute on function public.send_signal(uuid, text) from public, anon;
grant execute on function public.economy() to authenticated;
grant execute on function public.my_wallet() to authenticated;
grant execute on function public.my_swipe_quota() to authenticated;
grant execute on function public.activate_spotlight() to authenticated;
grant execute on function public.received_likes_count() to authenticated;
grant execute on function public.received_likes() to authenticated;
grant execute on function public.admin_grant_hearts(uuid, int, text) to authenticated;
grant execute on function public.admin_set_premium(uuid, int) to authenticated;
grant execute on function public.admin_update_economy(int, int, int, int) to authenticated;
grant execute on function public.admin_list_users(text, int) to authenticated;
grant execute on function public.discover_profiles(int) to authenticated;
grant execute on function public.send_signal(uuid, text) to authenticated;

commit;
