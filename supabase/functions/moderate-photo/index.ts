// =====================================================================
// moderate-photo
// 프로필 사진과 인증 셀카를 Sightengine 으로 검수합니다.
//
// 호출 (앱에서 supabase.functions.invoke('moderate-photo', { body })):
//   프로필 사진(가입 중): { "kind": "profile", "photo_id": "<profile_photos.id>" }
//   인증 셀카(가입):     { "kind": "selfie",  "path": "<유저 id>/<파일명>.jpg" }
//   사진 변경 요청:      { "kind": "photo_change", "path": "<유저 id>/<방금 찍은 셀카>.jpg" }
//
// 응답: { status: 'approved' | 'rejected' | 'pending', reason?: string, test_mode: boolean }
//
// 동작
//   - 프로필 사진: 통과 → profile_photos.moderation_status = 'approved'
//                 거절 → 'rejected' 로 기록하고 Storage 에서 파일 삭제
//   - 셀카: 통과 → profiles.selfie_submitted_at 기록, verification_status 는
//                 신규회원 심사 방식이 'AI 먼저'면 'approved'(셀카 즉시 삭제), '관리자 직접 승인'이면 'pending'
//           거절 → 'rejected', 셀카 즉시 삭제
//   - 사진 변경 요청: 가입을 마친 회원이 새로 올린 사진('draft')과 방금 찍은 셀카를 함께 검수합니다.
//           사진수정 심사 방식이 'AI 먼저'이고 전부 통과 → 바로 'approved'(셀카 즉시 삭제)
//           그 외 → 사진을 'review' 로 바꾸고 관리자 심사 대기 (그동안 기존 사진이 그대로 보입니다)
//   - 심사 방식은 관리자 페이지의 각 심사 탭에서 바꿉니다 (app_settings 테이블).
//   - AI 가 판단하기 애매한 점수대는 통과시키지 않고 관리자에게 넘깁니다.
//   - Sightengine 키가 없으면 테스트 모드입니다: 검수 없이 통과로 보되, 자동 승인은 하지 않고 관리자에게 넘깁니다
//     (가입 중 프로필 사진만 예외로 바로 통과).
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

  // 기준의 이 비율을 넘으면 '애매함'으로 보고 관리자에게 넘깁니다 (기준 이상이면 바로 거절).
  const GRAY = 0.7;
  let unsure = false;
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
  if (nudityScore >= nudityLimit * GRAY) unsure = true;

  const checks: [number, string][] = [
    [maxScore(result.weapon), 'weapon'],
    [maxScore(result.recreational_drug), 'drug'],
    [maxScore(result.gore), 'gore'],
    [maxScore(result.offensive), 'offensive'],
  ];
  for (const [score, reason] of checks) {
    if (score >= offensiveLimit) return { status: 'rejected', reason };
    if (score >= offensiveLimit * GRAY) unsure = true;
  }

  // genai: AI 생성(딥페이크 포함) 이미지일 확률
  const aiScore = result.type?.ai_generated ?? 0;
  if (aiScore >= aiLimit) return { status: 'rejected', reason: 'ai_generated' };
  if (aiScore >= aiLimit * GRAY) unsure = true;

  // 셀카는 얼굴이 정확히 한 명 있어야 합니다.
  if (kind === 'selfie') {
    const faces = Array.isArray(result.faces) ? result.faces.length : 0;
    if (faces === 0) return { status: 'rejected', reason: 'no_face' };
    if (faces > 1) return { status: 'rejected', reason: 'multiple_faces' };
  }

  return unsure ? { status: 'pending', reason: 'needs_review' } : { status: 'approved' };
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

  // 관리자 페이지에서 정한 심사 방식 ('ai' = AI 가 먼저 보고 통과하면 바로 반영)
  async function reviewMode(key: 'selfie_verification' | 'photo_review'): Promise<'manual' | 'ai'> {
    const { data } = await admin.from('app_settings').select('value').eq('key', key).maybeSingle();
    const mode = (data?.value as { mode?: string } | null)?.mode;
    return mode === 'ai' || mode === 'auto' ? 'ai' : 'manual';
  }

  // 파일 한 장 검수 (테스트 모드에서는 파일이 실제로 올라왔는지만 확인)
  async function check(bucket: string, path: string, kind: 'profile' | 'selfie'): Promise<Verdict> {
    const { data: signed, error } = await admin.storage.from(bucket).createSignedUrl(path, 120);
    if (error || !signed) return { status: 'rejected', reason: 'file_missing' };
    if (testMode) return { status: 'approved' };
    return checkWithSightengine(signed.signedUrl, kind, apiUser, apiSecret);
  }

  /**
   * 사진 변경 요청: 새로 올린 사진(draft)과 방금 찍은 셀카를 검수하고,
   * 바로 반영하거나 관리자 심사 대기열에 올립니다.
   */
  async function requestPhotoChange(): Promise<Verdict & { error?: string; rejected_photos?: number }> {
    const selfiePath = body.path ?? '';
    if (!selfiePath.startsWith(`${userId}/`) || selfiePath.includes('..')) {
      return { status: 'rejected', reason: 'file_missing' };
    }
    const dropSelfie = () => admin.storage.from(SELFIE_BUCKET).remove([selfiePath]);

    const { data: me } = await admin
      .from('profiles')
      .select('photo_review_status, verification_status, selfie_submitted_at, is_banned')
      .eq('id', userId)
      .maybeSingle();
    if (!me || me.is_banned) {
      await dropSelfie();
      return { status: 'rejected', reason: 'not_allowed' };
    }
    if (me.photo_review_status === 'reviewing') {
      await dropSelfie();
      return { status: 'pending', reason: 'already_reviewing' };
    }
    // 가입 셀카 심사가 아직 진행 중이면(셀카 보관 중) 끝난 뒤에 요청할 수 있습니다.
    if (me.verification_status === 'pending' && me.selfie_submitted_at) {
      await dropSelfie();
      return { status: 'rejected', reason: 'signup_review_in_progress' };
    }

    const { data: drafts } = await admin
      .from('profile_photos')
      .select('id, storage_path')
      .eq('user_id', userId)
      .eq('moderation_status', 'draft')
      .order('created_at');
    if (!drafts || drafts.length === 0) {
      await dropSelfie();
      return { status: 'rejected', reason: 'no_new_photos' };
    }

    // 1) 셀카: 얼굴이 한 명 보이는 실제 사진이어야 합니다.
    const selfie = await check(SELFIE_BUCKET, selfiePath, 'selfie');
    if (selfie.status === 'rejected') {
      await dropSelfie();
      return selfie;
    }

    // 2) 새 사진: 거절된 사진은 바로 지우고, 나머지만 다음 단계로 넘깁니다.
    let allClear = selfie.status === 'approved';
    let rejected = 0;
    let rejectReason: string | undefined;
    const kept: { id: string; storage_path: string }[] = [];
    for (const photo of drafts) {
      const verdict = await check(PROFILE_BUCKET, photo.storage_path, 'profile');
      if (verdict.status === 'rejected') {
        rejected += 1;
        rejectReason ??= verdict.reason;
        await admin
          .from('profile_photos')
          .update({ moderation_status: 'rejected', moderation_reason: verdict.reason ?? null })
          .eq('id', photo.id);
        await admin.storage.from(PROFILE_BUCKET).remove([photo.storage_path]);
      } else {
        if (verdict.status !== 'approved') allClear = false;
        kept.push(photo);
      }
    }
    if (kept.length === 0) {
      await dropSelfie();
      return { status: 'rejected', reason: rejectReason, rejected_photos: rejected };
    }

    // 3) 바로 반영할지, 관리자에게 넘길지
    const auto = allClear && !testMode && (await reviewMode('photo_review')) === 'ai';
    if (auto) {
      const { count } = await admin
        .from('profile_photos')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('moderation_status', 'approved');
      let position = count ?? 0;
      for (const photo of kept) {
        await admin
          .from('profile_photos')
          .update({ moderation_status: 'approved', position: Math.min(position++, 5) })
          .eq('id', photo.id);
      }
      await admin
        .from('profiles')
        .update({ photo_review_status: null, photo_review_note: null, photo_review_requested_at: null })
        .eq('id', userId);
      // 개인정보 보호: 확인이 끝난 셀카는 즉시 영구 파기합니다.
      await dropSelfie();
      return { status: 'approved', rejected_photos: rejected };
    }

    await admin
      .from('profile_photos')
      .update({ moderation_status: 'review' })
      .in('id', kept.map((photo) => photo.id));
    await admin
      .from('profiles')
      .update({
        photo_review_status: 'reviewing',
        photo_review_note: null,
        photo_review_requested_at: new Date().toISOString(),
      })
      .eq('id', userId);
    // 관리자 심사용으로 방금 셀카 1장만 남기고 이 사용자의 다른 셀카는 지웁니다.
    const { data: files } = await admin.storage.from(SELFIE_BUCKET).list(userId);
    const others = (files ?? []).map((file) => `${userId}/${file.name}`).filter((p) => p !== selfiePath);
    if (others.length > 0) await admin.storage.from(SELFIE_BUCKET).remove(others);
    return { status: 'pending', reason: 'in_review', rejected_photos: rejected };
  }

  let body: { kind?: string; photo_id?: string; path?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  // 2) 대상 파일 결정 + 소유권 확인
  let bucket: string;
  let path: string;
  if (body.kind === 'photo_change') {
    if (testMode) console.warn('[moderate-photo] TEST MODE: Sightengine 키가 없어 검수 없이 관리자 심사로 넘깁니다.');
    return json({ ...(await requestPhotoChange()), test_mode: testMode });
  }
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
    // 사진 변경 심사용 셀카가 보관 중일 때 가입 셀카를 다시 내면 서로 섞이므로 막습니다.
    const { data: me } = await admin.from('profiles').select('photo_review_status').eq('id', userId).maybeSingle();
    if (me?.photo_review_status === 'reviewing') {
      await admin.storage.from(bucket).remove([path]);
      return json({ error: 'photo_review_in_progress' }, 409);
    }
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
    // 'AI 먼저' 방식이면 AI 를 통과한 셀카를 바로 승인합니다. 테스트 모드(실제 AI 없음)와
    // AI 가 애매하다고 본 셀카는 항상 관리자에게 넘깁니다.
    const needsHuman = verdict.status === 'pending' && verdict.reason === 'needs_review';
    if (needsHuman) verdict = { status: 'approved' };
    const autoApprove =
      !needsHuman &&
      (Deno.env.get('SELFIE_AUTO_APPROVE') === 'true' ||
        (!testMode && (await reviewMode('selfie_verification')) === 'ai'));

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
