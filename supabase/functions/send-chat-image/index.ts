// =====================================================================
// send-chat-image
// 채팅에 올린 사진을 AI 로 검수한 뒤, 통과하면 사진 메시지로 만들어 줍니다.
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
//   3. 1분에 사진 10장까지만 (Sightengine 사용량·도배 방지)
//   4. Sightengine 으로 노출·무기·약물·잔인함·혐오 검사. 기준에 못 미치더라도 애매하면(기준의 70% 이상) 보내지 않습니다.
//      검사를 못 한 경우(API 오류)도 보내지 않습니다 (fail-closed). 프로필 사진과 달리 얼굴·AI 생성 여부는 보지 않습니다.
//   5. 통과하면 service_role 로 메시지를 만듭니다 (앱은 messages.image_url 을 직접 쓸 수 없어서 이 검수를 건너뛸 수 없음).
//   - Sightengine 키가 없으면 테스트 모드로 통과 처리합니다.
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

type Verdict = { status: 'approved' | 'rejected'; reason?: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function numberEnv(name: string, fallback: number) {
  const value = Number(Deno.env.get(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function maxScore(value: unknown): number {
  if (typeof value === 'number') return value;
  if (!value || typeof value !== 'object') return 0;
  let max = 0;
  for (const inner of Object.values(value)) max = Math.max(max, maxScore(inner));
  return max;
}

async function checkWithSightengine(imageUrl: string, apiUser: string, apiSecret: string): Promise<Verdict> {
  const params = new URLSearchParams({
    url: imageUrl,
    models: 'nudity-2.1,weapon,recreational_drug,gore-2.0,offensive-2.0',
    api_user: apiUser,
    api_secret: apiSecret,
  });
  let result: Record<string, any>;
  try {
    const res = await fetch(`https://api.sightengine.com/1.0/check.json?${params}`);
    result = await res.json();
    if (!res.ok || result.status !== 'success') {
      console.error('[send-chat-image] sightengine error', res.status, result?.error);
      return { status: 'rejected', reason: 'moderation_unavailable' };
    }
  } catch (error) {
    console.error('[send-chat-image] sightengine request failed', error);
    return { status: 'rejected', reason: 'moderation_unavailable' };
  }

  // 기준의 이 비율을 넘으면 애매한 사진으로 보고 보내지 않습니다.
  const GRAY = 0.7;
  const nudityLimit = numberEnv('MODERATION_NUDITY_THRESHOLD', 0.5);
  const offensiveLimit = numberEnv('MODERATION_OFFENSIVE_THRESHOLD', 0.6);
  const nudity = result.nudity ?? {};
  const nudityScore = Math.max(
    nudity.sexual_activity ?? 0,
    nudity.sexual_display ?? 0,
    nudity.erotica ?? 0,
    nudity.very_suggestive ?? 0,
  );
  if (nudityScore >= nudityLimit * GRAY) return { status: 'rejected', reason: 'nudity' };

  const checks: [number, string][] = [
    [maxScore(result.weapon), 'weapon'],
    [maxScore(result.recreational_drug), 'drug'],
    [maxScore(result.gore), 'gore'],
    [maxScore(result.offensive), 'offensive'],
  ];
  for (const [score, reason] of checks) {
    if (score >= offensiveLimit * GRAY) return { status: 'rejected', reason };
  }
  return { status: 'approved' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const apiUser = Deno.env.get('SIGHTENGINE_API_USER') ?? '';
  const apiSecret = Deno.env.get('SIGHTENGINE_API_SECRET') ?? '';
  const testMode = !apiUser || !apiSecret;

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

  // 3) 도배·비용 방지
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

  // 4) 검수
  const { data: signed, error: signError } = await admin.storage.from(BUCKET).createSignedUrl(path, 120);
  if (signError || !signed) {
    return json({ status: 'rejected', reason: 'file_missing' });
  }
  let verdict: Verdict;
  if (testMode) {
    console.warn('[send-chat-image] TEST MODE: Sightengine 키가 없어 검수 없이 통과 처리합니다.');
    verdict = { status: 'approved' };
  } else {
    verdict = await checkWithSightengine(signed.signedUrl, apiUser, apiSecret);
  }
  if (verdict.status !== 'approved') {
    await drop();
    return json({ status: 'rejected', reason: verdict.reason, test_mode: testMode });
  }

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
  return json({ status: 'sent', message, test_mode: testMode });
});
