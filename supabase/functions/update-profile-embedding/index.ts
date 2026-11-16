// =====================================================================
// update-profile-embedding
// 프로필(만남 목적, 취미, 자기소개)을 OpenAI text-embedding-3-small 로 임베딩해
// profiles.embedding (vector(1536)) 에 저장합니다. 둘러보기에서 성향이 비슷한 사람을 먼저 보여주는 데 쓰입니다.
//
// 호출 (앱에서 supabase.functions.invoke('update-profile-embedding', { body })):
//   본문 없음                       : 호출한 본인의 임베딩을 새로 만듭니다 (프로필 저장·수정 직후).
//   { "mode": "if_missing" }        : 본인의 임베딩이 아직 없을 때만 만듭니다 (앱을 열 때, 키 등록 전 가입자용).
//   { "mode": "backfill" }          : 관리자 전용. 임베딩이 없는 회원을 한 번에 최대 100명 채웁니다.
//
// 응답: { updated: true } | { skipped: true, reason } | { processed, remaining } (backfill)
//   - OPENAI_API_KEY 가 없으면 에러 없이 { skipped: true, reason: 'no_api_key' } 를 돌려줍니다.
//   - OpenAI 호출이 실패해도 앱 흐름을 막지 않도록 200 + skipped 로 응답합니다.
//
// 개인정보: 닉네임·생년월일·성별·위치는 OpenAI 로 보내지 않습니다.
// 이 파일은 대시보드 편집기에 그대로 붙여넣을 수 있도록 다른 파일을 import 하지 않습니다.
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const EMBEDDING_MODEL = 'text-embedding-3-small'; // 1536 차원 = profiles.embedding 과 동일
const BACKFILL_BATCH = 100;

const PURPOSE_LABEL: Record<string, string> = {
  friend: '동네 친구',
  hobby: '취미를 함께할 사람',
  serious: '진지한 연애',
};

type ProfileText = { id: string; purpose: string; hobbies: string[] | null; bio: string | null };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function toText(profile: ProfileText) {
  return [
    `만남 목적: ${PURPOSE_LABEL[profile.purpose] ?? profile.purpose}`,
    profile.hobbies?.length ? `취미: ${profile.hobbies.join(', ')}` : '',
    profile.bio ? `자기소개: ${profile.bio}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** 여러 프로필을 한 번의 요청으로 임베딩합니다. 실패하면 null. */
async function embed(texts: string[], apiKey: string): Promise<number[][] | null> {
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
    });
    const result = await res.json();
    if (!res.ok) {
      console.error('[update-profile-embedding] openai error', res.status, result?.error?.message);
      return null;
    }
    // 응답 순서가 입력 순서와 같도록 index 로 정렬합니다.
    return (result.data as { index: number; embedding: number[] }[])
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);
  } catch (error) {
    console.error('[update-profile-embedding] openai request failed', error);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) 호출한 사용자 확인
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401);
  const userId = userData.user.id;

  let mode = 'refresh';
  try {
    const body = await req.json();
    if (body?.mode === 'if_missing' || body?.mode === 'backfill') mode = body.mode;
  } catch {
    // 본문이 없으면 기본 동작(본인 임베딩 새로 만들기)
  }

  // 2) 키가 없으면 조용히 건너뜀
  const openaiKey = Deno.env.get('OPENAI_API_KEY') ?? '';
  if (!openaiKey) {
    console.warn('[update-profile-embedding] OPENAI_API_KEY 가 없어 임베딩을 건너뜁니다.');
    return json({ skipped: true, reason: 'no_api_key' });
  }

  // 3-a) 관리자: 임베딩이 없는 회원 채우기
  if (mode === 'backfill') {
    const { data: caller } = await admin
      .from('profiles')
      .select('role, is_banned')
      .eq('id', userId)
      .maybeSingle();
    if (!caller || caller.role !== 'admin' || caller.is_banned) return json({ error: 'forbidden' }, 403);

    const { data: targets } = await admin
      .from('profiles')
      .select('id, purpose, hobbies, bio')
      .is('embedding', null)
      .not('onboarding_completed_at', 'is', null)
      .limit(BACKFILL_BATCH);
    const list = (targets ?? []) as ProfileText[];

    let processed = 0;
    if (list.length > 0) {
      const vectors = await embed(list.map(toText), openaiKey);
      if (!vectors) return json({ skipped: true, reason: 'openai_error' });
      for (let i = 0; i < list.length; i++) {
        const { error } = await admin
          .from('profiles')
          .update({ embedding: `[${vectors[i].join(',')}]` })
          .eq('id', list[i].id);
        if (!error) processed += 1;
      }
    }

    const { count } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .is('embedding', null)
      .not('onboarding_completed_at', 'is', null);

    await admin.from('admin_actions').insert({
      admin_id: userId,
      action: 'embedding_backfill',
      detail: { processed, remaining: count ?? 0 },
    });
    return json({ processed, remaining: count ?? 0 });
  }

  // 3-b) 본인 프로필 읽기
  const { data: profile } = await admin
    .from('profiles')
    .select('id, purpose, hobbies, bio, has_embedding:embedding')
    .eq('id', userId)
    .maybeSingle();
  if (!profile) return json({ skipped: true, reason: 'no_profile' });
  if (mode === 'if_missing' && profile.has_embedding)
    return json({ skipped: true, reason: 'already_exists' });

  // 4) 임베딩 생성 후 저장 (pgvector 는 '[1,2,3]' 형태의 문자열을 받습니다)
  const vectors = await embed([toText(profile as ProfileText)], openaiKey);
  if (!vectors) return json({ skipped: true, reason: 'openai_error' });

  const { error: updateError } = await admin
    .from('profiles')
    .update({ embedding: `[${vectors[0].join(',')}]` })
    .eq('id', userId);
  if (updateError) {
    console.error('[update-profile-embedding] update failed', updateError.message);
    return json({ skipped: true, reason: 'update_failed' });
  }

  return json({ updated: true });
});
