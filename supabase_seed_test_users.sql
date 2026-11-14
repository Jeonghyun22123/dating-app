-- =====================================================================
-- 테스트용 가짜 프로필 8명 만들기 (개발 전용 — 실제 서비스 DB 에서는 실행하지 마세요)
--
-- 선행 조건: supabase_phase5.sql 까지 실행했고, 앱에서 내 계정으로 가입 + 온보딩을 끝낸 상태여야 합니다.
-- 사용법: Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 실행.
--
-- 동작
--   - 가장 최근에 온보딩을 마친 실제 사용자(=나)의 위치를 기준으로 반경 약 5km 안에 8명을 만듭니다.
--   - 홀수 번째 4명은 나에게 이미 '좋아요'를 눌러 둡니다 → 내가 좋아요를 누르면 바로 매칭됩니다.
--   - 가짜 계정은 비밀번호가 없어 로그인할 수 없습니다.
--   - 사진 파일은 SQL 로 넣을 수 없어 처음에는 이름 첫 글자가 들어간 기본 이미지로 보입니다.
--     사진을 넣으려면 이 SQL 실행 후 터미널에서 scripts/seed-photos.mjs 를 실행하세요 (파일 상단 설명 참고).
--
-- 지우기: 파일 맨 아래 "정리" 쿼리를 실행하세요.
-- =====================================================================

do $$
declare
  target_id uuid;
  base geography;
  uid uuid;
  i int;
  nicknames text[] := array['하늘', '준호', '서연', '민재', '지우', '도윤', '수아', '현우'];
  genders   text[] := array['female', 'male', 'female', 'male', 'female', 'male', 'female', 'male'];
  purposes  text[] := array['hobby', 'friend', 'serious', 'hobby', 'friend', 'serious', 'hobby', 'friend'];
  towns     text[] := array['성수동', '연남동', '망원동', '한남동', '서교동', '합정동', '이태원동', '신사동'];
  bios      text[] := array[
    '주말마다 한강에서 러닝해요. 같이 뛰실 분!',
    '동네 맛집 지도 만드는 게 취미예요.',
    '전시 보고 카페에서 수다 떠는 걸 좋아해요.',
    '클라이밍 3년 차. 초보도 환영합니다.',
    '보드게임 모임 같이 하실 분 찾아요.',
    '퇴근 후 요리하는 직장인입니다.',
    '사진 찍으러 여기저기 다녀요.',
    '강아지랑 산책하는 게 하루의 낙이에요.'
  ];
  hobby_sets text[][] := array[
    array['러닝', '카페', '여행'],
    array['맛집 탐방', '와인', '요리'],
    array['전시', '카페', '독서'],
    array['클라이밍', '헬스', '캠핑'],
    array['보드게임', '게임', '영화'],
    array['요리', '베이킹', '와인'],
    array['사진', '여행', '전시'],
    array['반려동물', '등산', '러닝']
  ];
begin
  if exists (select 1 from auth.users where email like 'seed-%@seed.invalid') then
    raise exception '이미 테스트 프로필이 있습니다. 아래 "정리" 쿼리로 지운 뒤 다시 실행하세요.';
  end if;

  select p.id, p.location into target_id, base
  from profiles p
  where p.onboarding_completed_at is not null and p.location is not null
  order by p.created_at desc
  limit 1;

  if target_id is null then
    raise exception '먼저 앱에서 가입과 온보딩(동네 설정 포함)을 완료해 주세요.';
  end if;

  for i in 1..8 loop
    uid := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
      format('seed-%s@seed.invalid', i), '', now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(),
      '', '', '', ''
    );

    insert into profiles (
      id, nickname, gender, birth_date, purpose, hobbies, bio,
      location, neighborhood_name, verification_status,
      selfie_submitted_at, onboarding_completed_at,
      pref_genders, pref_age_min, pref_age_max, pref_distance_km
    ) values (
      uid, nicknames[i], genders[i],
      (current_date - make_interval(years => 24 + i, days => i * 17))::date,
      purposes[i], array(select unnest(hobby_sets[i:i])), bios[i],
      -- 기준 위치에서 0.3~4.5km 떨어진 임의의 방향
      st_project(base, 300 + random() * 4200, radians(random() * 360)),
      towns[i],
      case when i % 2 = 0 then 'approved' else 'pending' end,
      now(), now(),
      -- 테스트하기 쉽도록 가짜 프로필은 조건을 가장 넓게 둡니다 (누구에게나 추천됨).
      array['male', 'female'], 19, 60, 500
    );

    -- 추천 목록은 '승인된 사진이 있는 사람'만 보여주므로 기록만 넣어 둡니다 (실제 파일 없음).
    insert into profile_photos (user_id, storage_path, position, moderation_status)
    values (uid, format('seed/%s.jpg', uid), 0, 'approved');

    if i % 2 = 1 then
      insert into swipes (actor_id, target_id, action) values (uid, target_id, 'like');
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- (선택) 상대가 보낸 메시지 받아보기
-- 매칭된 가짜 프로필들이 나에게 인사 메시지를 보냅니다.
-- 채팅 화면을 열어 둔 채로 실행하면 실시간 수신을 확인할 수 있어요.
-- ---------------------------------------------------------------------
-- insert into messages (match_id, sender_id, content)
-- select m.id, u.id, '안녕하세요! 반가워요 :)'
-- from matches m
-- join auth.users u on u.id in (m.user_a, m.user_b)
-- where u.email like 'seed-%@seed.invalid' and m.is_active;

-- ---------------------------------------------------------------------
-- (선택) 시그널 받아보기 — supabase_signal.sql 실행 후 사용
-- 나에게 아직 관심을 보내지 않은 가짜 프로필(2번, 4번)이 메시지와 함께 시그널을 보냅니다.
-- 채팅 탭의 "받은 시그널"과 둘러보기 맨 앞 카드에서 확인할 수 있어요.
-- ---------------------------------------------------------------------
-- insert into swipes (actor_id, target_id, action, message)
-- select u.id,
--        (select p.id from profiles p
--          where p.id not in (select id from auth.users where email like 'seed-%@seed.invalid')
--          order by p.created_at desc limit 1),
--        'signal',
--        case u.email when 'seed-2@seed.invalid' then '동네 맛집 좋아하신다면 같이 가요!'
--                     else '프로필 보고 연락드려요. 클라이밍 해보셨어요?' end
-- from auth.users u
-- where u.email in ('seed-2@seed.invalid', 'seed-4@seed.invalid')
-- on conflict (actor_id, target_id) do nothing;

-- ---------------------------------------------------------------------
-- 정리: 테스트 프로필과 관련 데이터(스와이프, 매칭, 메시지) 전부 삭제
-- 사진을 넣었다면 먼저 `node scripts/seed-photos.mjs --clean` 으로 Storage 파일을 지운 뒤 실행하세요.
-- ---------------------------------------------------------------------
-- delete from auth.users where email like 'seed-%@seed.invalid';
