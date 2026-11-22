// =====================================================================
// send-chat-image
// 채팅에 올린 사진을 사진 메시지로 만들어 줍니다. 사진 내용은 검수하지 않습니다 (자유로운 대화를 위해).
// 사진 검수는 프로필 사진(가입·사진 변경)에만 합니다 (moderate-photo).
//
// 호출 (앱에서 supabase.functions.invoke('send-chat-image', { body })):
//   { "match_id": "<매칭 id>", "path": "<매칭 id>/<내 id>/<파일명>.jpg" }
//   (사진 파일은 앱이 먼저 chat-images 버킷의 위 경로에 올려 둡니다)
//
// 응답
//   { status: 'sent', message: { ...messages 한 줄 } }
//   { status: 'rejected', reason }  → 사진 파일은 이 함수가 바로 삭제합니다
//
// 동작
//   1. 호출자가 로그인한 사용자이고, 이 매칭의 당사자이며, 매칭이 진행 중이고, 차단·정지 상태가 아닌지 확인
//   2. 파일이 호출자 본인 폴더에 있는지 확인 (남의 파일을 내 메시지로 만들 수 없음)
//   3. 1분에 사진 10장까지만 (도배 방지)
//   4. 메시지를 만듭니다. 앱은 messages.image_url 을 직접 쓸 수 없어서, 사진 메시지는 이 함수로만 만들어집니다.
//   - 원치 않는 사진은 받는 사람이 [신고하기] / [차단하기] 로 대응합니다. 신고하면 사진도 증거로 함께 넘어갑니다.
//
// 이 파일은 대시보드 편집기에 그대로 붙여넣을 수 있도록 다른 파일을 import 하지 않습니다.
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BUCKET = 'chat-images';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PER_MINUTE = 10;
/** 사진 메시지의 content 칸에 들어가는 글자 (채팅 목록 미리보기, 신고 스냅샷에서 이 글자가 보입니다) */
const IMAGE_CONTENT = '📷 사진';

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

  // 1) 호출자 확인
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401);
  const userId = userData.user.id;

  let body: { match_id?: string; path?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const matchId = body.match_id ?? '';
  const path = body.path ?? '';
  if (!UUID.test(matchId)) return json({ error: 'invalid_request' }, 400);
  // 2) 파일은 반드시 "<이 매칭>/<나>/<파일명>" 이어야 합니다 (남의 파일·다른 방의 파일을 쓸 수 없음).
  const parts = path.split('/');
  if (parts.length !== 3 || parts[0] !== matchId || parts[1] !== userId || !parts[2] || path.includes('..')) {
    return json({ error: 'invalid_path' }, 400);
  }
  const drop = () => admin.storage.from(BUCKET).remove([path]);

  // 매칭·차단·정지 확인
  const { data: match } = await admin
    .from('matches')
    .select('id, user_a, user_b, is_active')
    .eq('id', matchId)
    .maybeSingle();
  const isMember = !!match && (match.user_a === userId || match.user_b === userId);
  if (!isMember) {
    await drop();
    return json({ error: 'not_found' }, 404);
  }
  if (!match.is_active) {
    await drop();
    return json({ status: 'rejected', reason: 'match_closed' });
  }
  const otherId = match.user_a === userId ? match.user_b : match.user_a;
  const { data: me } = await admin.from('profiles').select('is_banned').eq('id', userId).maybeSingle();
  const { count: blocked } = await admin
    .from('blocks')
    .select('id', { count: 'exact', head: true })
    .or(
      `and(blocker_id.eq.${userId},blocked_id.eq.${otherId}),and(blocker_id.eq.${otherId},blocked_id.eq.${userId})`,
    );
  if (!me || me.is_banned || (blocked ?? 0) > 0) {
    await drop();
    return json({ status: 'rejected', reason: 'not_allowed' });
  }

  // 3) 도배 방지
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count: recent } = await admin
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('sender_id', userId)
    .not('image_url', 'is', null)
    .gte('created_at', since);
  if ((recent ?? 0) >= MAX_PER_MINUTE) {
    await drop();
    return json({ status: 'rejected', reason: 'too_many' });
  }

  // 4) 파일이 실제로 올라와 있는지만 확인합니다 (내용은 보지 않음).
  const { error: signError } = await admin.storage.from(BUCKET).createSignedUrl(path, 30);
  if (signError) return json({ status: 'rejected', reason: 'file_missing' });

  // 5) 사진 메시지 만들기
  const { data: message, error: insertError } = await admin
    .from('messages')
    .insert({ match_id: matchId, sender_id: userId, content: IMAGE_CONTENT, image_url: path })
    .select('id, match_id, sender_id, content, image_url, is_read, created_at')
    .single();
  if (insertError || !message) {
    console.error('[send-chat-image] insert failed', insertError?.message);
    await drop();
    return json({ error: 'insert_failed' }, 500);
  }
  return json({ status: 'sent', message });
});
