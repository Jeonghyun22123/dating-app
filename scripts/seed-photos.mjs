#!/usr/bin/env node
// =====================================================================
// 테스트용 가짜 프로필(supabase_seed_test_users.sql)에 사진을 넣는 개발 전용 스크립트.
//
// 선행 조건: supabase_seed_test_users.sql 을 먼저 실행해 가짜 프로필 8명이 있어야 합니다.
//
// 사용법 (프로젝트 폴더에서):
//   SUPABASE_SERVICE_ROLE_KEY=여기에_키 node scripts/seed-photos.mjs
//
//   키 위치: Supabase 대시보드 > Project Settings > API > service_role (또는 Secret key)
//   ⚠️ 이 키는 모든 보안 규칙을 우회합니다. 파일에 저장하거나 git 에 올리지 말고,
//      위처럼 명령어 앞에 한 번만 붙여서 쓰세요. (.env.local 에 넣지 마세요)
//
// 사진 출처 (둘 중 하나, 프로필 번호 1~8 기준)
//   1) 직접 고른 사진: 프로젝트 폴더에 seed-photos 폴더를 만들고
//        1.jpg, 2.jpg ... 또는 여러 장이면 1-1.jpg, 1-2.jpg 처럼 넣으면 그 사진을 씁니다.
//        (jpg / jpeg / png / webp, 장당 5MB 이하)
//   2) 넣지 않은 번호는 아래 DEFAULT_PHOTOS 의 Unsplash 사진을 내려받습니다.
//        Unsplash 사진은 무료 사용이 허용되지만 개발·테스트 용도로만 쓰세요.
//
// 지우기:  SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-photos.mjs --clean
//   (가짜 프로필을 SQL 로 삭제하기 "전에" 실행해야 Storage 의 파일까지 지워집니다)
// =====================================================================
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'profile-photos';
const LOCAL_DIR = 'seed-photos';
const SEED_EMAIL = /^seed-(\d+)@seed\.invalid$/;

// 프로필 번호 → 기본 사진 (4:5 비율로 얼굴 중심 자르기). 번호는 시드 SQL 의 순서와 같습니다.
//   1 하늘(여) 2 준호(남) 3 서연(여) 4 민재(남) 5 지우(여) 6 도윤(남) 7 수아(여) 8 현우(남)
const unsplash = (id) => `https://images.unsplash.com/photo-${id}?w=1080&h=1350&fit=crop&crop=faces&q=80&fm=jpg`;
const DEFAULT_PHOTOS = {
  1: [unsplash('1494790108377-be9c29b29330')],
  2: [unsplash('1507003211169-0a1dd7228f2d')],
  3: [unsplash('1438761681033-6461ffad8d80')],
  4: [unsplash('1500648767791-00dcc994a43e')],
  5: [unsplash('1534528741775-53994a69daeb')],
  6: [unsplash('1506794778202-cad84cf45f1d')],
  7: [unsplash('1544005313-94ddf0286df2')],
  8: [unsplash('1472099645785-5658abf4ff4e')],
};

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const MAX_BYTES = 5 * 1024 * 1024;

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

/** .env.local 에서 Supabase URL 을 읽습니다 (환경변수가 있으면 그걸 우선). */
function readSupabaseUrl() {
  let url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
  if (!url && existsSync('.env.local')) {
    const line = readFileSync('.env.local', 'utf8')
      .split('\n')
      .find((l) => l.trim().startsWith('EXPO_PUBLIC_SUPABASE_URL='));
    url = line ? line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '') : '';
  }
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

/** seed-photos 폴더에서 해당 번호의 사진을 찾습니다: "3.jpg", "3-1.png", "3-2.webp" ... */
function localPhotos(number) {
  if (!existsSync(LOCAL_DIR)) return [];
  return readdirSync(LOCAL_DIR)
    .filter((name) => new RegExp(`^${number}(-\\d+)?\\.(jpe?g|png|webp)$`, 'i').test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name) => {
      const bytes = readFileSync(join(LOCAL_DIR, name));
      return { label: `${LOCAL_DIR}/${name}`, bytes, contentType: MIME[extname(name).toLowerCase()] };
    });
}

async function downloadPhotos(number) {
  const results = [];
  for (const url of DEFAULT_PHOTOS[number] ?? []) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      const contentType = (res.headers.get('content-type') ?? '').split(';')[0];
      if (!res.ok || !contentType.startsWith('image/')) {
        console.log(`    · 내려받기 실패 (${res.status}) — 건너뜀`);
        continue;
      }
      results.push({ label: 'Unsplash', bytes: Buffer.from(await res.arrayBuffer()), contentType });
    } catch (error) {
      console.log(`    · 내려받기 실패 (${error.name}) — 건너뜀`);
    }
  }
  return results;
}

async function listSeedUsers(supabase) {
  const users = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(`사용자 목록을 읽지 못했어요: ${error.message}\n  키가 service_role(Secret) 키가 맞는지 확인하세요.`);
    for (const user of data.users) {
      const match = SEED_EMAIL.exec(user.email ?? '');
      if (match) users.push({ id: user.id, number: Number(match[1]) });
    }
    if (data.users.length < 200) break;
  }
  return users.sort((a, b) => a.number - b.number);
}

async function removeFolder(supabase, userId) {
  const { data: files } = await supabase.storage.from(BUCKET).list(userId);
  const paths = (files ?? []).map((file) => `${userId}/${file.name}`);
  if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths);
  return paths.length;
}

async function main() {
  const clean = process.argv.includes('--clean');
  const url = readSupabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url) fail('.env.local 에서 EXPO_PUBLIC_SUPABASE_URL 을 찾지 못했어요. 프로젝트 폴더에서 실행했는지 확인하세요.');
  if (!key) fail('SUPABASE_SERVICE_ROLE_KEY 가 없어요.\n  예: SUPABASE_SERVICE_ROLE_KEY=키 node scripts/seed-photos.mjs');

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const seeds = await listSeedUsers(supabase);
  if (seeds.length === 0) fail('가짜 프로필이 없어요. 먼저 supabase_seed_test_users.sql 을 실행하세요.');

  const { data: profiles } = await supabase.from('profiles').select('id, nickname').in('id', seeds.map((s) => s.id));
  const nickname = new Map((profiles ?? []).map((p) => [p.id, p.nickname]));

  console.log(`\n${url}\n가짜 프로필 ${seeds.length}명 ${clean ? '사진 삭제' : '사진 등록'}\n`);
  let done = 0;

  for (const seed of seeds) {
    const name = nickname.get(seed.id) ?? '?';
    console.log(`  ${seed.number}. ${name}`);

    // 이전에 넣은 사진은 항상 먼저 지웁니다 (여러 번 실행해도 쌓이지 않도록).
    const removed = await removeFolder(supabase, seed.id);
    await supabase.from('profile_photos').delete().eq('user_id', seed.id);

    if (clean) {
      // 추천 목록에 계속 보이도록 파일 없는 기록 1개를 되돌려 둡니다 (시드 SQL 과 같은 상태).
      await supabase
        .from('profile_photos')
        .insert({ user_id: seed.id, storage_path: `seed/${seed.id}.jpg`, position: 0, moderation_status: 'approved' });
      console.log(`    · 파일 ${removed}개 삭제`);
      done++;
      continue;
    }

    let photos = localPhotos(seed.number);
    if (photos.length === 0) photos = await downloadPhotos(seed.number);
    photos = photos.filter((photo) => {
      if (photo.bytes.length <= MAX_BYTES) return true;
      console.log(`    · ${photo.label} 은 5MB 를 넘어 건너뜀`);
      return false;
    });

    const rows = [];
    for (const [index, photo] of photos.slice(0, 6).entries()) {
      const ext = photo.contentType === 'image/png' ? 'png' : photo.contentType === 'image/webp' ? 'webp' : 'jpg';
      const path = `${seed.id}/seed-${index + 1}.${ext}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, photo.bytes, { contentType: photo.contentType, upsert: true });
      if (error) {
        console.log(`    · 업로드 실패: ${error.message}`);
        continue;
      }
      rows.push({ user_id: seed.id, storage_path: path, position: index, moderation_status: 'approved' });
      console.log(`    · ${photo.label} → 등록 (${Math.round(photo.bytes.length / 1024)}KB)`);
    }

    if (rows.length === 0) {
      // 사진을 하나도 못 넣었으면 기존처럼 이름 첫 글자 화면으로 보이게 둡니다.
      rows.push({ user_id: seed.id, storage_path: `seed/${seed.id}.jpg`, position: 0, moderation_status: 'approved' });
      console.log('    · 사진 없음 — 기본 화면(이름 첫 글자)으로 유지');
    } else {
      done++;
    }
    const { error } = await supabase.from('profile_photos').insert(rows);
    if (error) console.log(`    · 기록 실패: ${error.message}`);
  }

  console.log(`\n✓ ${done}/${seeds.length}명 완료. 앱에서 둘러보기를 새로고침해 보세요.\n`);
}

main().catch((error) => fail(error.message));
