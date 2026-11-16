// =====================================================================
// admin-review-selfie
// 관리자가 신규회원 셀카 인증 또는 사진 변경 요청을 승인/반려합니다.
// 판정과 동시에 셀카 파일을 영구 삭제합니다.
//
// 호출 (관리자 화면에서 supabase.functions.invoke('admin-review-selfie', { body })):
//   { "user_id": "<심사 대상 유저 id>", "approve": true | false, "note": "선택 메모",
//     "kind": "signup"(기본값, 신규회원 심사) | "photo_change"(사진수정 심사) }
//
// 응답: { status: 'approved' | 'rejected', removed_files: number }
//
// 사진수정 심사: 승인 → 검토 중이던 새 사진이 한 번에 공개됩니다.
//               반려 → 새 사진 파일을 지우고 기존 사진을 그대로 둡니다. note 는 사용자에게 사유로 보입니다.
//
// 동작 순서
//   1. 호출자가 관리자(profiles.role = 'admin', 정지 아님)인지 서버에서 확인
//   2. 대상의 셀카 폴더(verification-selfies/<user_id>/)를 전부 삭제
//      → 삭제에 실패하면 판정을 기록하지 않고 오류를 돌려줍니다 (파일이 남은 채 완료되지 않도록)
//   3. profiles.verification_status 갱신 + 관리자 작업 기록(admin_actions)
//
// 왜 Edge Function 인가: Storage 파일 삭제는 SQL 로 할 수 없고, 판정과 파기를 한 번에 처리해
// "검증 완료 즉시 파기" 원칙을 클라이언트 동작에 맡기지 않기 위해서입니다.
//
// 추가 시크릿 없음 (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 는 자동 주입).
// 이 파일은 대시보드 편집기에 그대로 붙여넣을 수 있도록 다른 파일을 import 하지 않습니다.
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SELFIE_BUCKET = 'verification-selfies';
const PROFILE_BUCKET = 'profile-photos';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) 호출자 확인: 로그인 + 관리자
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401);

  const { data: caller } = await admin
    .from('profiles')
    .select('role, is_banned')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (!caller || caller.role !== 'admin' || caller.is_banned) return json({ error: 'forbidden' }, 403);

  let body: { user_id?: string; approve?: boolean; note?: string; kind?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  if (!body.user_id || !UUID.test(body.user_id) || typeof body.approve !== 'boolean') {
    return json({ error: 'invalid_request' }, 400);
  }
  const userId = body.user_id;

  const { data: target } = await admin
    .from('profiles')
    .select('id, verification_status, selfie_submitted_at, photo_review_status')
    .eq('id', userId)
    .maybeSingle();
  if (!target) return json({ error: 'not_found' }, 404);
  const photoChange = body.kind === 'photo_change';
  if (photoChange) {
    if (target.photo_review_status !== 'reviewing') return json({ error: 'no_photo_change_request' }, 409);
  } else if (!target.selfie_submitted_at) {
    return json({ error: 'no_selfie_submitted' }, 409);
  } else if (target.photo_review_status === 'reviewing') {
    // 보관 중인 셀카가 사진 변경 심사용이므로 여기서 지우면 안 됩니다.
    return json({ error: 'photo_change_in_progress' }, 409);
  }

  // 2) 셀카 영구 삭제 (판정 기록보다 먼저)
  const { data: files, error: listError } = await admin.storage.from(SELFIE_BUCKET).list(userId);
  if (listError) {
    console.error('[admin-review-selfie] list failed', listError.message);
    return json({ error: 'storage_unavailable' }, 502);
  }
  const paths = (files ?? []).map((file) => `${userId}/${file.name}`);
  if (paths.length > 0) {
    const { error: removeError } = await admin.storage.from(SELFIE_BUCKET).remove(paths);
    if (removeError) {
      console.error('[admin-review-selfie] remove failed', removeError.message);
      return json({ error: 'storage_unavailable' }, 502);
    }
  }

  const status = body.approve ? 'approved' : 'rejected';
  const note = body.note?.trim() || null;

  // 3-a) 사진수정 심사: 새 사진을 한 번에 공개하거나(승인), 지우고 기존 사진을 유지합니다(반려).
  if (photoChange) {
    const { data: photos } = await admin
      .from('profile_photos')
      .select('id, storage_path')
      .eq('user_id', userId)
      .eq('moderation_status', 'review')
      .order('created_at');
    const pending = photos ?? [];

    if (body.approve) {
      const { count } = await admin
        .from('profile_photos')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('moderation_status', 'approved');
      let position = count ?? 0;
      for (const photo of pending) {
        await admin
          .from('profile_photos')
          .update({ moderation_status: 'approved', moderation_reason: null, position: Math.min(position++, 5) })
          .eq('id', photo.id);
      }
    } else if (pending.length > 0) {
      await admin
        .from('profile_photos')
        .update({ moderation_status: 'rejected', moderation_reason: 'admin_rejected' })
        .in('id', pending.map((photo) => photo.id));
      await admin.storage.from(PROFILE_BUCKET).remove(pending.map((photo) => photo.storage_path));
    }

    const { error: reviewError } = await admin
      .from('profiles')
      .update({
        photo_review_status: body.approve ? null : 'rejected',
        photo_review_note: body.approve ? null : note,
        photo_review_requested_at: null,
      })
      .eq('id', userId);
    if (reviewError) {
      console.error('[admin-review-selfie] photo review update failed', reviewError.message);
      return json({ error: 'update_failed' }, 500);
    }

    await admin.from('admin_actions').insert({
      admin_id: userData.user.id,
      action: `photo_change_${status}`,
      target_user_id: userId,
      detail: { note, photos: pending.length, removed_files: paths.length },
    });
    return json({ status, removed_files: paths.length });
  }

  // 3-b) 신규회원 심사: 판정 기록
  const { error: updateError } = await admin
    .from('profiles')
    .update({ verification_status: status })
    .eq('id', userId);
  if (updateError) {
    console.error('[admin-review-selfie] update failed', updateError.message);
    return json({ error: 'update_failed' }, 500);
  }

  // AI 가 판단을 미뤄 대기 중이던 프로필 사진도 관리자가 함께 보고 승인한 것이므로 공개합니다.
  if (body.approve) {
    await admin
      .from('profile_photos')
      .update({ moderation_status: 'approved' })
      .eq('user_id', userId)
      .eq('moderation_status', 'pending');
  }

  await admin.from('admin_actions').insert({
    admin_id: userData.user.id,
    action: `selfie_${status}`,
    target_user_id: userId,
    detail: { note, removed_files: paths.length },
  });

  return json({ status, removed_files: paths.length });
});
