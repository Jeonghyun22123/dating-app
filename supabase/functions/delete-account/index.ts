// =====================================================================
// delete-account
// 회원 탈퇴: 호출한 본인의 계정과 데이터를 영구 삭제합니다.
//
// 호출 (앱에서 supabase.functions.invoke('delete-account', { body: { confirm: '탈퇴' } })):
//   본문의 confirm 은 실수로 호출되는 것을 막기 위한 확인 값입니다.
//
// 지워지는 것
//   - Storage: 프로필 사진(profile-photos/<id>/), 인증 셀카(verification-selfies/<id>/)
//   - 계정(auth.users) → 연결된 프로필, 사진 기록, 관심·시그널, 매칭과 대화, 차단, 접속 기록, 동의 기록
// 남는 것
//   - 이 사람에 대한 신고 기록 (피신고자는 "탈퇴한 사용자"로 표시) — 탈퇴로 신고를 없애지 못하게 하기 위함
//   - 이 사람이 접수한 신고 (신고자는 "탈퇴한 사용자"로 표시)
//
// 응답: { deleted: true, removed_files: number }
// 추가 시크릿 없음 (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 는 자동 주입).
// 이 파일은 대시보드 편집기에 그대로 붙여넣을 수 있도록 다른 파일을 import 하지 않습니다.
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BUCKETS = ['profile-photos', 'verification-selfies'];

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

  // 1) 호출한 사용자 확인 — 항상 "본인"만 지울 수 있습니다.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401);
  const userId = userData.user.id;

  let body: { confirm?: string } = {};
  try {
    body = await req.json();
  } catch {
    // 본문이 없으면 아래에서 거절합니다.
  }
  if (body.confirm !== '탈퇴') return json({ error: 'confirmation_required' }, 400);

  // 2) Storage 파일 삭제 (계정을 먼저 지우면 파일이 주인 없이 남으므로 파일부터)
  let removed = 0;
  for (const bucket of BUCKETS) {
    // 한 번에 최대 1000개씩 나눠서 지웁니다.
    for (;;) {
      const { data: files, error: listError } = await admin.storage.from(bucket).list(userId, { limit: 1000 });
      if (listError) {
        console.error('[delete-account] list failed', bucket, listError.message);
        return json({ error: 'storage_unavailable' }, 502);
      }
      if (!files || files.length === 0) break;
      const { error: removeError } = await admin.storage.from(bucket).remove(files.map((f) => `${userId}/${f.name}`));
      if (removeError) {
        console.error('[delete-account] remove failed', bucket, removeError.message);
        return json({ error: 'storage_unavailable' }, 502);
      }
      removed += files.length;
      if (files.length < 1000) break;
    }
  }

  // 2-b) 채팅으로 보낸 사진 삭제. 경로가 "<매칭 id>/<내 id>/..." 라서 폴더로 찾을 수 없어 메시지 기록에서 찾습니다.
  //       (메시지는 계정 삭제 때 함께 지워지므로 그 전에 파일부터 지웁니다)
  for (;;) {
    const { data: sent, error: sentError } = await admin
      .from('messages')
      .select('id, image_url')
      .eq('sender_id', userId)
      .not('image_url', 'is', null)
      .limit(500);
    if (sentError) {
      console.error('[delete-account] chat image lookup failed', sentError.message);
      return json({ error: 'storage_unavailable' }, 502);
    }
    if (!sent || sent.length === 0) break;
    const { error: chatRemoveError } = await admin.storage
      .from('chat-images')
      .remove(sent.map((row) => row.image_url as string));
    if (chatRemoveError) {
      console.error('[delete-account] chat image remove failed', chatRemoveError.message);
      return json({ error: 'storage_unavailable' }, 502);
    }
    removed += sent.length;
    // 같은 행을 다시 읽지 않도록 사진 연결을 끊어 둡니다 (곧 메시지 자체가 지워집니다).
    await admin.from('messages').update({ image_url: null }).in('id', sent.map((row) => row.id));
    if (sent.length < 500) break;
  }

  // 3) 계정 삭제 → 프로필과 연결된 데이터는 DB 의 on delete cascade 로 함께 지워집니다.
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    console.error('[delete-account] delete user failed', deleteError.message);
    return json({ error: 'delete_failed' }, 500);
  }

  return json({ deleted: true, removed_files: removed });
});
