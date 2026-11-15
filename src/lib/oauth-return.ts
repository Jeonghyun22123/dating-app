/**
 * 간편 로그인(구글·카카오)에서 실패하고 돌아왔을 때 주소에 붙어 오는 오류를, 앱이 화면을 그리기 전에 읽어 둡니다.
 * 돌아오는 주소는 "/" 이고 곧바로 로그인 화면으로 이동하면서 주소 뒤의 #error=... 가 사라지기 때문에,
 * 가장 먼저 실행되는 supabase.ts 에서 이 파일을 불러 값을 보관합니다.
 */
function readError(): string | null {
  if (typeof window === 'undefined' || !window.location) return null;
  const read = (raw: string) => new URLSearchParams(raw.replace(/^[#?]/, ''));
  const code = read(window.location.hash).get('error') ?? read(window.location.search).get('error');
  if (!code) return null;
  window.history.replaceState(null, '', window.location.pathname);
  return code;
}

let pending = readError();

/** 보관한 오류 코드를 한 번만 꺼내 줍니다 (없으면 null). */
export function consumeOAuthError(): string | null {
  const code = pending;
  pending = null;
  return code;
}
