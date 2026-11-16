-- =====================================================================
-- Dating App · 상대 프로필 보기 (채팅 상대 · 시그널을 보낸 사람)
-- 선행 조건: supabase_photo_review.sql 까지 실행 완료
-- 사용법: Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 한 번 실행하세요. 여러 번 실행해도 안전합니다.
--
-- member_profile(p_user): 다른 회원의 프로필을 돌려줍니다. 아래 경우에만 볼 수 있고, 그 외에는 null 입니다.
--   - 지금 나와 매칭 중인 상대 (매칭이 해제되면 더 이상 볼 수 없음)
--   - 나에게 시그널을 보냈고 내가 아직 답하지 않은 사람 (수락할지 정하려면 프로필을 봐야 하므로)
--   차단한/차단당한 사이, 정지된 계정은 볼 수 없습니다.
--
-- 돌려주는 것: 닉네임, 나이, 만남 목적, 취미, 자기소개, 동네 이름, 인증 상태, 신뢰 등급, 승인된 사진 경로
-- 돌려주지 않는 것: 좌표와 거리, 생년월일, 신뢰 점수 숫자, 만남 조건, 이메일, 검토 중이거나 반려된 사진
--   (거리는 일부러 뺐습니다. 매칭 후에도 거리가 계속 갱신되면 상대의 이동을 짐작할 수 있습니다)
-- =====================================================================

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
