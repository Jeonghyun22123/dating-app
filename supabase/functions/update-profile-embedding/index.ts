// =====================================================================
// update-profile-embedding
// 프로필(만남 목적, 취미, 자기소개, 동네)을 OpenAI text-embedding-3-small 로 임베딩해
// profiles.embedding (vector(1536)) 에 저장합니다. 성향 기반 추천에 사용됩니다.
//
// 호출: 프로필 저장/수정 직후 앱에서 supabase.functions.invoke('update-profile-embedding')
//       (본문 없음. 항상 "호출한 본인"의 프로필만 갱신합니다)
//
// 응답: { updated: true } | { skipped: true, reason: string }
//   - OPENAI_API_KEY 가 없으면 에러 없이 { skipped: true, reason: 'no_api_key' } 를 돌려줍니다.
//   - OpenAI 호출이 실패해도 앱 흐름을 막지 않도록 200 + skipped 로 응답합니다.
//
// 이 파일은 대시보드 편집기에 그대로 붙여넣을 수 있도록 다른 파일을 import 하지 않습니다.
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const EMBEDDING_MODEL = 'text-embedding-3-small'; // 1536 차원 = profiles.embedding 과 동일

const PURPOSE_LABEL: Record<string, string> = {
  friend: '동네 친구',
  hobby: '취미를 함께할 사람',
  serious: '진지한 연애',
};

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

  // 1) 호출한 사용자 확인
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401);

  // 2) 키가 없으면 조용히 건너뜀
  const openaiKey = Deno.env.get('OPENAI_API_KEY') ?? '';
  if (!openaiKey) {
    console.warn('[update-profile-embedding] OPENAI_API_KEY 가 없어 임베딩을 건너뜁니다.');
    return json({ skipped: true, reason: 'no_api_key' });
  }

  // 3) 본인 프로필 읽기
  const { data: profile } = await admin
    .from('profiles')
    .select('purpose, hobbies, bio, neighborhood_name')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (!profile) return json({ skipped: true, reason: 'no_profile' });

  // 닉네임·생년월일·좌표 같은 개인 식별 정보는 OpenAI 로 보내지 않습니다.
  const text = [
    `만남 목적: ${PURPOSE_LABEL[profile.purpose] ?? profile.purpose}`,
    profile.hobbies?.length ? `취미: ${profile.hobbies.join(', ')}` : '',
    profile.bio ? `자기소개: ${profile.bio}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  // 4) 임베딩 생성
  let embedding: number[];
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
    });
    const result = await res.json();
    if (!res.ok) {
      console.error('[update-profile-embedding] openai error', res.status, result?.error?.message);
      return json({ skipped: true, reason: 'openai_error' });
    }
    embedding = result.data[0].embedding;
  } catch (error) {
    console.error('[update-profile-embedding] openai request failed', error);
    return json({ skipped: true, reason: 'openai_unreachable' });
  }

  // 5) 저장 (pgvector 는 '[1,2,3]' 형태의 문자열을 받습니다)
  const { error: updateError } = await admin
    .from('profiles')
    .update({ embedding: `[${embedding.join(',')}]` })
    .eq('id', userData.user.id);
  if (updateError) {
    console.error('[update-profile-embedding] update failed', updateError.message);
    return json({ skipped: true, reason: 'update_failed' });
  }

  return json({ updated: true });
});
