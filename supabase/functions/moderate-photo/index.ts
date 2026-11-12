// =====================================================================
// moderate-photo
// 프로필 사진과 인증 셀카를 Sightengine 으로 검수합니다.
//
// 호출 (앱에서 supabase.functions.invoke('moderate-photo', { body })):
//   프로필 사진: { "kind": "profile", "photo_id": "<profile_photos.id>" }
//   인증 셀카:   { "kind": "selfie",  "path": "<유저 id>/<파일명>.jpg" }
//
// 응답: { status: 'approved' | 'rejected' | 'pending', reason?: string, test_mode: boolean }
//
// 동작
//   - 프로필 사진: 통과 → profile_photos.moderation_status = 'approved'
//                 거절 → 'rejected' 로 기록하고 Storage 에서 파일 삭제
//   - 셀카: 통과 → profiles.selfie_submitted_at 기록, verification_status 는
//                 SELFIE_AUTO_APPROVE=true 면 'approved'(셀카 즉시 삭제), 아니면 'pending'(관리자 심사 대기)
//           거절 → 'rejected', 셀카 즉시 삭제
//   - Sightengine 키가 없으면 테스트 모드로 모두 통과 처리합니다.
//   - Sightengine 호출이 실패하면 통과시키지 않고 'pending' 으로 둡니다 (fail-closed).
//
// 필요한 시크릿은 supabase/functions/.env.example 참고.
// 이 파일은 대시보드 편집기에 그대로 붙여넣을 수 있도록 다른 파일을 import 하지 않습니다.
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PROFILE_BUCKET = 'profile-photos';
const SELFIE_BUCKET = 'verification-selfies';

type Verdict = { status: 'approved' | 'rejected' | 'pending'; reason?: string };

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

/** 객체 안의 숫자 값 중 최댓값 (Sightengine 모델별 세부 점수 묶음에 사용). */
function maxScore(value: unknown, ignoreKeys: string[] = []): number {
  if (typeof value === 'number') return value;
  if (!value || typeof value !== 'object') return 0;
  let max = 0;
  for (const [key, inner] of Object.entries(value)) {
    if (ignoreKeys.includes(key)) continue;
    max = Math.max(max, maxScore(inner, ignoreKeys));
  }
  return max;
}

/**
 * Sightengine 호출.
 * 문서: https://sightengine.com/docs/  (모델: nudity-2.1, weapon, recreational_drug, gore-2.0, offensive-2.0, genai, face-attributes)
 */
async function checkWithSightengine(
  imageUrl: string,
  kind: 'profile' | 'selfie',
  apiUser: string,
  apiSecret: string,
): Promise<Verdict> {
  const params = new URLSearchParams({
    url: imageUrl,
    models: 'nudity-2.1,weapon,recreational_drug,gore-2.0,offensive-2.0,genai,face-attributes',
    api_user: apiUser,
    api_secret: apiSecret,
  });

  let result: Record<string, any>;
  try {
    const res = await fetch(`https://api.sightengine.com/1.0/check.json?${params}`);
    result = await res.json();
    if (!res.ok || result.status !== 'success') {
      console.error('[moderate-photo] sightengine error', res.status, result?.error);
      return { status: 'pending', reason: 'moderation_unavailable' };
    }
  } catch (error) {
    console.error('[moderate-photo] sightengine request failed', error);
    return { status: 'pending', reason: 'moderation_unavailable' };
  }

  const nudityLimit = numberEnv('MODERATION_NUDITY_THRESHOLD', 0.5);
  const aiLimit = numberEnv('MODERATION_AI_GENERATED_THRESHOLD', 0.85);
  const offensiveLimit = numberEnv('MODERATION_OFFENSIVE_THRESHOLD', 0.6);

  // nudity-2.1: 노출 수위별 점수. 'none'(문제 없음)과 맥락 정보는 제외하고 봅니다.
  const nudity = result.nudity ?? {};
  const nudityScore = Math.max(
    nudity.sexual_activity ?? 0,
    nudity.sexual_display ?? 0,
    nudity.erotica ?? 0,
    nudity.very_suggestive ?? 0,
  );
  if (nudityScore >= nudityLimit) return { status: 'rejected', reason: 'nudity' };

  if (maxScore(result.weapon) >= offensiveLimit) return { status: 'rejected', reason: 'weapon' };
  if (maxScore(result.recreational_drug) >= offensiveLimit) return { status: 'rejected', reason: 'drug' };
  if (maxScore(result.gore) >= offensiveLimit) return { status: 'rejected', reason: 'gore' };
  if (maxScore(result.offensive) >= offensiveLimit) return { status: 'rejected', reason: 'offensive' };

  // genai: AI 생성(딥페이크 포함) 이미지일 확률
  if ((result.type?.ai_generated ?? 0) >= aiLimit) return { status: 'rejected', reason: 'ai_generated' };

  // 셀카는 얼굴이 정확히 한 명 있어야 합니다.
  if (kind === 'selfie') {
    const faces = Array.isArray(result.faces) ? result.faces.length : 0;
    if (faces === 0) return { status: 'rejected', reason: 'no_face' };
    if (faces > 1) return { status: 'rejected', reason: 'multiple_faces' };
  }

  return { status: 'approved' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const apiUser = Deno.env.get('SIGHTENGINE_API_USER') ?? '';
  const apiSecret = Deno.env.get('SIGHTENGINE_API_SECRET') ?? '';
  const testMode = !apiUser || !apiSecret;

  // service_role 클라이언트: RLS 를 우회하므로 아래에서 소유권을 직접 확인합니다.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) 호출한 사용자 확인
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401);
  const userId = userData.user.id;

  let body: { kind?: string; photo_id?: string; path?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  // 2) 대상 파일 결정 + 소유권 확인
  let bucket: string;
  let path: string;
  const kind = body.kind === 'selfie' ? 'selfie' : 'profile';

  if (kind === 'profile') {
    if (!body.photo_id) return json({ error: 'photo_id_required' }, 400);
    const { data: photo } = await admin
      .from('profile_photos')
      .select('id, user_id, storage_path, moderation_status, moderation_reason')
      .eq('id', body.photo_id)
      .maybeSingle();
    if (!photo || photo.user_id !== userId) return json({ error: 'not_found' }, 404);
    // 이미 결과가 난 사진은 다시 검수하지 않습니다 (API 사용량 절약).
    if (photo.moderation_status !== 'pending') {
      return json({ status: photo.moderation_status, reason: photo.moderation_reason, test_mode: testMode });
    }
    bucket = PROFILE_BUCKET;
    path = photo.storage_path;
  } else {
    if (!body.path || !body.path.startsWith(`${userId}/`) || body.path.includes('..')) {
      return json({ error: 'invalid_path' }, 400);
    }
    bucket = SELFIE_BUCKET;
    path = body.path;
  }

  // 3) 검수
  let verdict: Verdict;
  if (testMode) {
    // ⚠️ 테스트 모드: Sightengine 키가 없어 실제 검수 없이 통과시킵니다.
    //    정식 출시 전 SIGHTENGINE_API_USER / SIGHTENGINE_API_SECRET 을 반드시 등록하세요.
    console.warn('[moderate-photo] TEST MODE: Sightengine 키가 없어 검수 없이 통과 처리합니다.');
    // 파일이 실제로 올라왔는지만 확인합니다.
    const { error } = await admin.storage.from(bucket).createSignedUrl(path, 30);
    verdict = error ? { status: 'rejected', reason: 'file_missing' } : { status: 'approved' };
  } else {
    const { data: signed, error } = await admin.storage.from(bucket).createSignedUrl(path, 120);
    verdict = error || !signed
      ? { status: 'rejected', reason: 'file_missing' }
      : await checkWithSightengine(signed.signedUrl, kind, apiUser, apiSecret);
  }

  // 4) 결과 반영
  if (kind === 'profile') {
    if (verdict.status !== 'pending') {
      await admin
        .from('profile_photos')
        .update({ moderation_status: verdict.status, moderation_reason: verdict.reason ?? null })
        .eq('id', body.photo_id!);
    }
    if (verdict.status === 'rejected') {
      await admin.storage.from(bucket).remove([path]);
    }
  } else {
    const autoApprove = Deno.env.get('SELFIE_AUTO_APPROVE') === 'true';

    if (verdict.status === 'approved') {
      await admin
        .from('profiles')
        .update({
          selfie_submitted_at: new Date().toISOString(),
          verification_status: autoApprove ? 'approved' : 'pending',
        })
        .eq('id', userId);
    } else if (verdict.status === 'rejected') {
      await admin.from('profiles').update({ verification_status: 'rejected' }).eq('id', userId);
    }

    // 개인정보 보호: 검증이 끝난 셀카는 즉시 영구 파기합니다.
    // 관리자 수동 심사를 기다리는 경우(통과 + 자동 승인 꺼짐)에만 최신 1장을 남기고,
    // 그 외에는 이 사용자의 셀카 폴더를 전부 비웁니다.
    const keepForReview = verdict.status === 'approved' && !autoApprove;
    const { data: files } = await admin.storage.from(bucket).list(userId);
    const toRemove = (files ?? [])
      .map((file) => `${userId}/${file.name}`)
      .filter((filePath) => !(keepForReview && filePath === path));
    if (toRemove.length > 0) await admin.storage.from(bucket).remove(toRemove);

    // 앱에는 '제출됨/거절됨'만 알려줍니다. 최종 인증 여부는 profiles.verification_status 로 확인합니다.
  }

  return json({ ...verdict, test_mode: testMode });
});
