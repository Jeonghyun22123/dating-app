-- =====================================================================
-- 테스트 초기화 (개발 전용): 가짜 프로필을 처음 상태로 되돌려 둘러보기에 다시 나오게 합니다.
-- 사용법: Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 실행. 몇 번이든 다시 실행할 수 있습니다.
--
-- 되돌리는 것 (가짜 프로필 seed-N@seed.invalid 과 관련된 것만)
--   - 내가(실제 사용자가) 가짜 프로필에게 누른 관심/다음에 기록
--   - 가짜 프로필과의 매칭과 그 대화
--   - 가짜 프로필에 대한 차단, 가짜 프로필의 정지 상태
-- 그대로 두는 것
--   - 가짜 프로필 자체와 사진 (scripts/seed-photos.mjs 로 넣은 사진은 유지됩니다)
--   - 가짜 프로필 4명이 나에게 미리 눌러 둔 관심 (다시 관심을 누르면 또 매칭됩니다)
--   - 실제 사용자끼리의 기록, 접수된 신고 내역
-- =====================================================================

begin;

create temporary table seed_ids on commit drop as
  select id from auth.users where email like 'seed-%@seed.invalid';

-- 매칭 삭제 (대화는 함께 지워집니다)
delete from matches
where user_a in (select id from seed_ids) or user_b in (select id from seed_ids);

-- 실제 사용자가 가짜 프로필에게 남긴 관심/다음에 기록
delete from swipes
where target_id in (select id from seed_ids)
  and actor_id not in (select id from seed_ids);

-- 가짜 프로필과의 차단 (양방향)
delete from blocks
where blocked_id in (select id from seed_ids) or blocker_id in (select id from seed_ids);

-- 관리자 테스트로 정지시켰다면 해제
update profiles set is_banned = false
where id in (select id from seed_ids) and is_banned;

commit;

-- 결과 확인: 가짜 프로필 수 / 나에게 미리 눌러 둔 관심 수
select
  (select count(*) from auth.users where email like 'seed-%@seed.invalid') as seed_profiles,
  (select count(*) from swipes s join auth.users u on u.id = s.actor_id
    where u.email like 'seed-%@seed.invalid') as seed_likes_waiting;
