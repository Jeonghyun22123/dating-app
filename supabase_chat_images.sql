-- =====================================================================
-- Dating App · 채팅 사진 보내기
-- 선행 조건: supabase_mbti.sql 까지 실행 완료
-- 사용법: Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 한 번 실행하세요. 여러 번 실행해도 안전합니다.
--         함께 배포할 Edge Function: send-chat-image (새 함수), delete-account (내용이 바뀜)
--
-- 구조
--   1. chat-images 버킷(비공개): 파일 경로는 "<매칭 id>/<보낸 사람 id>/<파일명>.jpg"
--   2. 올리기: 진행 중인 매칭의 당사자가 자기 폴더에만 올릴 수 있습니다.
--   3. 보기: 그 매칭의 당사자만 (신고된 대화의 증거 확인용으로 관리자도 가능).
--      관리자는 messages 표를 볼 수 없어 경로를 알 수 없고, 신고로 넘어온 스냅샷의 경로로만 열람합니다.
--   4. 메시지로 만드는 것은 서버 함수(send-chat-image)만 합니다. 앱은 messages.image_url 을 직접 넣을 수 없습니다
--      (supabase_phase3.sql 에서 이미 막혀 있음). 그래서 AI 검수를 건너뛰고 사진을 보낼 수 없습니다.
-- =====================================================================

begin;

-- 경로의 첫 칸(매칭 id)이 올바른 uuid 이고, 내가 그 매칭의 당사자인지. (active_only: 진행 중인 매칭만)
create or replace function public.is_chat_member(p_match text, p_active_only boolean default false)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_match ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (
      select 1 from matches m
      where m.id = p_match::uuid
        and (m.user_a = auth.uid() or m.user_b = auth.uid())
        and (not p_active_only or m.is_active)
    );
$$;

revoke execute on function public.is_chat_member(text, boolean) from public, anon;
grant execute on function public.is_chat_member(text, boolean) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-images', 'chat-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "chat-images: upload to own folder in active match" on storage.objects;
create policy "chat-images: upload to own folder in active match"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-images'
  and (storage.foldername(name))[2] = auth.uid()::text
  and public.is_chat_member((storage.foldername(name))[1], true)
  and public.is_active_user()
);

drop policy if exists "chat-images: view in own match" on storage.objects;
create policy "chat-images: view in own match"
on storage.objects for select to authenticated
using (
  bucket_id = 'chat-images'
  and (public.is_chat_member((storage.foldername(name))[1]) or public.is_admin())
);

-- 올렸다가 보내기에 실패한 파일을 앱이 치울 수 있게 (자기 폴더만)
drop policy if exists "chat-images: delete own" on storage.objects;
create policy "chat-images: delete own"
on storage.objects for delete to authenticated
using (bucket_id = 'chat-images' and (storage.foldername(name))[2] = auth.uid()::text);

-- 사진 메시지 도배·검수 비용 방지용 (서버 함수가 1분에 보낸 사진 수를 셉니다)
create index if not exists messages_image_rate_idx
  on messages (sender_id, created_at desc) where image_url is not null;

commit;
