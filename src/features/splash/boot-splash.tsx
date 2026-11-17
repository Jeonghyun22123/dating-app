import { BRAND, COVER, MARK_PATHS, MARK_STROKE, WORD_LETTERS, WORD_STROKE } from '@/features/brand/paths';

/**
 * 웹 표지 (+html.tsx 에서 서버가 미리 그려 둡니다).
 * 앱 코드가 내려받아지기 전부터 보이고, 준비가 끝나면 SplashCover 가 걷어 냅니다.
 * 애니메이션은 CSS 로만 돌아가서 앱 코드가 무거워도 끊기지 않습니다.
 */

// 저장된 테마를 먼저 읽어 표지 색을 맞춥니다 (화이트 테마 사용자가 어두운 표지를 보지 않도록).
const THEME_SCRIPT = `(function(){window.__bootStart=Date.now();try{var c=${JSON.stringify(BRAND)};var t='dark';var raw=localStorage.getItem('display-theme');if(raw){var s=JSON.parse(raw);if(s&&s.state&&c[s.state.themeId])t=s.state.themeId}var r=document.documentElement;r.style.setProperty('--boot-bg',c[t].bg);r.style.setProperty('--boot-ink',c[t].ink);r.style.backgroundColor=c[t].bg}catch(e){}})();`;

const DRAW_MS = 600;
const STAGGER_MS = 50;
const DRAW_END = DRAW_MS + STAGGER_MS * (MARK_PATHS.length - 1);

const STYLE = `
#boot-splash{position:fixed;top:0;left:0;width:100%;height:calc(100% + env(safe-area-inset-top));overflow:hidden;z-index:2147483646;display:flex;align-items:center;justify-content:center;background:var(--boot-bg,#111113);transition:opacity .45s ease}
#boot-splash svg{width:min(62vw,280px);height:auto;overflow:visible}
#boot-splash .ink{fill:none;stroke:var(--boot-ink,#f43f5e);stroke-linecap:round;stroke-linejoin:round}
#boot-splash .draw{stroke-dasharray:var(--len) var(--gap);stroke-dashoffset:var(--start);animation:boot-draw ${DRAW_MS}ms cubic-bezier(.6,0,.3,1) var(--delay) both}
#boot-splash .draw.heart{transform-box:fill-box;transform-origin:center;animation:boot-draw ${DRAW_MS}ms cubic-bezier(.6,0,.3,1) var(--delay) both,boot-beat 520ms ease-in-out ${DRAW_END}ms 1,boot-beat 1300ms ease-in-out ${DRAW_END + 1100}ms infinite}
#boot-splash .word{opacity:0;animation:boot-fade 450ms ease-out ${DRAW_END - 200}ms forwards}
#boot-splash.boot-out{opacity:0;pointer-events:none}
@keyframes boot-draw{0%{stroke-dashoffset:var(--start)}100%{stroke-dashoffset:0}}
@keyframes boot-beat{0%,100%{transform:scale(1)}30%{transform:scale(1.15)}60%{transform:scale(.97)}}
@keyframes boot-fade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){
#boot-splash .draw,#boot-splash .draw.heart{animation:none;stroke-dasharray:none;stroke-dashoffset:0}
#boot-splash .word{animation:none;opacity:1}
#boot-splash svg{animation:boot-fade .4s ease-out}
}`;

export function BootSplashHead() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      <style dangerouslySetInnerHTML={{ __html: STYLE }} />
    </>
  );
}

export function BootSplash() {
  return (
    <div id="boot-splash" aria-hidden="true">
      <svg viewBox={COVER.viewBox} xmlns="http://www.w3.org/2000/svg">
        <g className="ink" strokeWidth={MARK_STROKE}>
          {MARK_PATHS.map((path, index) => (
            <path
              key={index}
              d={path.d}
              className={path.heart ? 'draw heart' : 'draw'}
              // 빈칸을 선 길이보다 길게 둬야 그리기 전에 선 끝에 둥근 점이 생기지 않습니다.
              style={{
                ['--len' as string]: path.len,
                ['--gap' as string]: path.len + 100,
                // 시작 위치를 선 길이보다 조금 더 밀어야 시작점에도 점이 생기지 않습니다.
                ['--start' as string]: path.len + 4,
                ['--delay' as string]: `${index * STAGGER_MS}ms`,
              }}
            />
          ))}
        </g>
        <g transform={`translate(${COVER.wordX} ${COVER.wordY}) scale(${COVER.wordScale})`}>
          <g className="ink word" strokeWidth={WORD_STROKE}>
            {WORD_LETTERS.map((letter, index) => (
              <path key={index} d={letter.d} transform={`translate(${letter.x} 0)`} />
            ))}
          </g>
        </g>
      </svg>
    </div>
  );
}
