// =====================================================================
// admin-review-selfie
// 관리자가 셀카 인증을 승인/반려합니다. 판정과 동시에 셀카 파일을 영구 삭제합니다.
//
// 호출 (관리자 화면에서 supabase.functions.invoke('admin-review-selfie', { body })):
//   { "user_id": "<심사 대상 유저 id>", "approve": true | false, "note": "선택 메모" }
//
// 응답: { status: 'approved' | 'rejected', removed_files: number }
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

  let body: { user_id?: string; approve?: boolean; note?: string };
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
    .select('id, verification_status, selfie_submitted_at')
    .eq('id', userId)
    .maybeSingle();
  if (!target) return json({ error: 'not_found' }, 404);
  if (!target.selfie_submitted_at) return json({ error: 'no_selfie_submitted' }, 409);

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

  // 3) 판정 기록
  const status = body.approve ? 'approved' : 'rejected';
  const { error: updateError } = await admin
    .from('profiles')
    .update({ verification_status: status })
    .eq('id', userId);
  if (updateError) {
    console.error('[admin-review-selfie] update failed', updateError.message);
    return json({ error: 'update_failed' }, 500);
  }

  await admin.from('admin_actions').insert({
    admin_id: userData.user.id,
    action: `selfie_${status}`,
    target_user_id: userId,
    detail: { note: body.note?.trim() || null, removed_files: paths.length },
  });

  return json({ status, removed_files: paths.length });
});
