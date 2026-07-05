import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, FileText, Maximize2, Minimize2, Presentation } from 'lucide-react';
import { LessonContent } from '../types';
import { LANGUAGE_ALIASES } from '../utils/studentLanguage';
import { VOICE_LANG_CHANGED_EVENT } from './StudentVoiceButton';

const toSlideEmbedUrl = (url: string): string => {
  const trimmed = url.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/https:\/\/docs\.google\.com\/presentation\/d\/([^/]+)/);
  if (!match) return trimmed;
  return `https://docs.google.com/presentation/d/${match[1]}/embed`;
};

interface SlideEmbedProps {
  slideUrl: string;
  title: string;
  roundedBottom?: boolean;
}

export const SlideEmbed: React.FC<SlideEmbedProps> = ({ slideUrl, title, roundedBottom = false }) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  const handleFullscreen = () => {
    const el = iframeRef.current;
    if (!el) return;
    if (el.requestFullscreen) {
      void el.requestFullscreen();
    }
  };

  useEffect(() => {
    if (isMaximized) {
      document.body.classList.add('has-maximized-slide');
      document.body.style.overflow = 'hidden';
    } else {
      document.body.classList.remove('has-maximized-slide');
      document.body.style.overflow = '';
    }
    return () => {
      document.body.classList.remove('has-maximized-slide');
      document.body.style.overflow = '';
    };
  }, [isMaximized]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMaximized(false);
      }
    };
    if (isMaximized) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMaximized]);

  return (
    <>
      {!isMaximized && (
        <div className="border-b border-[#F3F2EE] px-5 py-3 sm:px-8">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-[#A89F94]">
            <Presentation size={13} />
            슬라이드
          </div>
        </div>
      )}
      <div
        className={
          isMaximized
            ? "maximized-slide-container fixed inset-0 z-[9999] bg-black flex items-center justify-center"
            : `relative w-full overflow-hidden ${roundedBottom ? 'rounded-b-[32px]' : ''}`
        }
        style={isMaximized ? undefined : { paddingBottom: '56.25%' }}
        onMouseEnter={() => !isMaximized && setIsHovered(true)}
        onMouseLeave={() => !isMaximized && setIsHovered(false)}
      >
        <iframe
          ref={iframeRef}
          src={toSlideEmbedUrl(slideUrl)}
          title={`${title} 슬라이드`}
          className={isMaximized ? "w-full h-full border-none" : "absolute inset-0 h-full w-full"}
          style={{ border: 'none' }}
          allowFullScreen
        />
        {!isMaximized && isHovered && (
          <div className="absolute right-3 top-3 z-10 flex gap-2">
            <button
              type="button"
              onClick={() => setIsMaximized(true)}
              title="브라우저 창 전체화면"
              className="flex items-center gap-1.5 rounded-xl bg-black/60 px-3 py-2 text-[11px] sm:text-xs font-bold text-white backdrop-blur-sm transition-all hover:bg-black/80 shadow-md cursor-pointer"
            >
              <Maximize2 size={13} />
              창 전체화면
            </button>
            <button
              type="button"
              onClick={handleFullscreen}
              title="모니터 전체화면"
              className="flex items-center gap-1.5 rounded-xl bg-black/60 px-3 py-2 text-[11px] sm:text-xs font-bold text-white backdrop-blur-sm transition-all hover:bg-black/80 shadow-md cursor-pointer"
            >
              <Presentation size={13} />
              모니터 전체화면
            </button>
          </div>
        )}
        {isMaximized && (
          <button
            type="button"
            onClick={() => setIsMaximized(false)}
            title="창 전체화면 종료 (Esc)"
            className="absolute right-4 top-4 z-[10000] flex items-center gap-1.5 rounded-xl bg-white/20 px-4 py-2.5 text-xs font-bold text-white backdrop-blur-sm transition-all hover:bg-white/30 cursor-pointer"
          >
            <Minimize2 size={14} />
            창 전체화면 종료 (Esc)
          </button>
        )}
      </div>
    </>
  );
};

const iframeResponsiveStyleTag = `
  <style>
    :root {
      color-scheme: light;
    }

    html, body {
      margin: 0;
      width: 100%;
      max-width: none;
    }

    body {
      overflow-x: hidden;
    }

    *, *::before, *::after {
      box-sizing: border-box;
    }

    img, video, iframe, svg {
      max-width: 100% !important;
      height: auto;
    }

    canvas {
      max-width: 100% !important;
    }

    body > :is(main, section, article, [class*="container"], [class*="wrapper"], [class*="content"], [class*="inner"], [style*="max-width"]),
    .student-content-root,
    .student-content-root > :is(main, section, article, [class*="container"], [class*="wrapper"], [class*="content"], [class*="inner"], [style*="max-width"]) {
      width: 100%;
      max-width: none !important;
      margin-left: 0 !important;
      margin-right: 0 !important;
    }
  </style>
`;

const iframeHeightScriptTag = `
  <script>
    function sendHeight() {
      var h = Math.max(
        document.body ? document.body.scrollHeight : 0,
        document.body ? document.body.offsetHeight : 0,
        document.documentElement.scrollHeight,
        document.documentElement.offsetHeight
      );
      window.parent.postMessage({ type: 'iframe-height', height: h }, '*');
    }

    window.addEventListener('load', function () { setTimeout(sendHeight, 100); });
    if (window.ResizeObserver) {
      new ResizeObserver(sendHeight).observe(document.documentElement);
    }
    new MutationObserver(sendHeight).observe(document.body, { childList: true, subtree: true, attributes: true });
    window.addEventListener('resize', sendHeight);
    setTimeout(sendHeight, 100);
    setTimeout(sendHeight, 300);
    setTimeout(sendHeight, 1000);
  <\/script>
`;

// 실습 iframe 안에 떠 있는 🌐 번역 버튼. 크롬 페이지 번역은 샌드박스 iframe 내부를 번역하지 않으므로
// (크로뮴 41090662, wontfix), 실습 HTML 자체에 번역 사전을 심어 두고(루틴이 생성 시 주입) 버튼으로 치환한다.
// 사전 규약: window.__DSR_TR__ = { "러시아어": { "원문": "번역", ... }, "영어": {...} }. 사전이 없으면 버튼을 띄우지 않는다.
// 학생이 음성 버튼(StudentVoiceButton)에서 고른 언어(localStorage 'dsr_voice_lang')가 사전에 있으면
// 그 언어로 자동으로 켜지고, 수업 중 언어를 바꾸면 부모가 postMessage({type:'dsr-voice-lang', iso})로 알려 따라간다.
const iframeTranslateScriptTag = `
  <script>
  (function () {
    if (window.__dsrTrInit) return; window.__dsrTrInit = true;

    var TR = window.__DSR_TR__;                       // 루틴이 실습 HTML에 심어 둔 번역 사전(언어명 -> {원문: 번역})
    if (!TR || typeof TR !== 'object') return;        // 사전이 없으면(옛 콘텐츠 등) 번역 버튼 자체를 띄우지 않는다
    var LANGS = Object.keys(TR).filter(function (k) { return TR[k] && typeof TR[k] === 'object'; });
    if (LANGS.length === 0) return;

    // iso(음성 버튼의 언어 코드) → 사전 언어명 매핑. 사전 키는 자유 표기라("러시아어"/"Russian" 등)
    // studentLanguage.ts와 같은 별칭 데이터로 느슨하게 잇는다(빌드 시 주입).
    var ALIASES = ${JSON.stringify(LANGUAGE_ALIASES)};
    function langKeyForIso(iso) {
      if (!iso || typeof iso !== 'string') return null;
      var keywords = null;
      for (var i = 0; i < ALIASES.length; i++) {
        if (ALIASES[i].iso === iso) { keywords = ALIASES[i].keywords; break; }
      }
      if (!keywords) return null;
      for (var j = 0; j < LANGS.length; j++) {
        var norm = LANGS[j].toLowerCase().replace(/\\s+/g, '');
        for (var k = 0; k < keywords.length; k++) {
          if (norm.indexOf(keywords[k]) !== -1) return LANGS[j];
        }
      }
      return null;
    }
    // 학생이 음성 버튼에서 고른 언어. srcdoc iframe이 allow-same-origin이라 부모와 localStorage를 공유한다.
    function readVoiceIso() {
      try {
        var raw = window.localStorage.getItem('dsr_voice_lang');
        if (!raw) return null;
        var parsed = JSON.parse(raw);
        return parsed && typeof parsed.iso === 'string' && parsed.iso ? parsed.iso : null;
      } catch (e) { return null; }
    }

    var KO = /[\\uAC00-\\uD7A3]/;       // 한글이 든 텍스트만 번역
    var originals = [];                  // 번역으로 바뀐 텍스트 노드 모음(원문 복원용)
    var state = { lang: null, showOriginal: false };
    var root = null, menuOpen = false;

    function notifyHeight() { try { window.dispatchEvent(new Event('resize')); } catch (e) {} }

    function isSkippable(node) {
      var p = node.parentNode;
      while (p && p.nodeType === 1) {
        var tag = p.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'NOSCRIPT') return true;
        if (p.id === 'dsr-tr' || p.getAttribute('data-dsr-skip') === '1') return true;
        p = p.parentNode;
      }
      return false;
    }
    // 노드의 '원문 키'. 이미 번역된 노드는 저장해 둔 원문을 기준으로 본다(번역된 현재값을 다시 번역해 접두가 겹치는 것 방지).
    function origKey(n) { var base = (n.__dsrOrig != null ? n.__dsrOrig : n.nodeValue) || ''; return base.trim(); }
    function eachKoTextNode(fn) {
      if (!document.body) return;
      var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
      var n;
      while ((n = w.nextNode())) {
        if (!n.nodeValue) continue;
        var key = origKey(n);
        if (!key || !KO.test(key)) continue;
        if (isSkippable(n)) continue;
        fn(n, key);
      }
    }
    function applyTranslations() {
      if (!state.lang || state.showOriginal) return;
      var dict = TR[state.lang] || {};
      eachKoTextNode(function (n, key) {
        var tr = dict[key];
        if (tr == null || n.__dsrTr === tr) return;
        if (n.__dsrOrig == null) { n.__dsrOrig = n.nodeValue; originals.push(n); }
        n.nodeValue = n.__dsrOrig.replace(key, tr);   // 항상 원문에서 치환 → 접두 중복 없음
        n.__dsrTr = tr;
      });
      notifyHeight();
    }
    function restoreOriginals() {
      for (var i = 0; i < originals.length; i++) {
        var n = originals[i];
        if (n && n.__dsrOrig != null) { n.nodeValue = n.__dsrOrig; n.__dsrTr = null; }
      }
      notifyHeight();
    }
    function selectLang(lang) { state.lang = lang; state.showOriginal = false; menuOpen = false; renderUI(); applyTranslations(); }
    function toggleOriginal() {
      state.showOriginal = !state.showOriginal;
      if (state.showOriginal) restoreOriginals(); else applyTranslations();
      renderUI();
    }
    function turnOff() { restoreOriginals(); state.lang = null; state.showOriginal = false; menuOpen = false; renderUI(); }

    function ensureRoot() {
      if (root) return;
      var st = document.createElement('style');
      st.textContent =
        '#dsr-tr{position:fixed;top:10px;right:10px;z-index:2147483000;font-family:"Malgun Gothic","맑은 고딕",system-ui,sans-serif;text-align:right;}'
        + '#dsr-tr *{box-sizing:border-box;}'
        // 평소엔 지름 44px 원형 버튼 하나로 접혀 있어야 실습 콘텐츠(우상단 HUD 등)를 가리지 않는다.
        + '#dsr-tr .dsr-fab{position:relative;width:44px;height:44px;border:none;border-radius:50%;background:#3b6fe0;color:#fff;font-size:21px;line-height:1;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 12px rgba(40,55,90,.25);opacity:.85;}'
        + '#dsr-tr .dsr-fab:hover{opacity:1;}'
        + '#dsr-tr .dsr-fab .dsr-dot{position:absolute;top:1px;right:1px;width:13px;height:13px;border-radius:50%;background:#2ecc71;border:2px solid #fff;}'
        + '#dsr-tr .dsr-panel{margin-top:6px;background:#fff;border:2px solid #e4e8f2;border-radius:14px;box-shadow:0 12px 30px rgba(40,55,90,.18);padding:8px;max-height:60vh;overflow:auto;display:none;min-width:170px;text-align:left;}'
        + '#dsr-tr .dsr-panel.open{display:block;}'
        + '#dsr-tr .dsr-cur{display:block;background:#eafaf0;color:#1a7f47;border:2px solid #56cf8c;border-radius:10px;padding:6px 10px;font-size:13px;font-weight:800;margin-bottom:6px;text-align:center;}'
        + '#dsr-tr .dsr-panel button{display:block;width:100%;text-align:left;border:none;background:none;font-size:15px;font-weight:700;color:#2f3445;padding:9px 12px;border-radius:9px;cursor:pointer;}'
        + '#dsr-tr .dsr-panel button:hover{background:#eef2fb;}'
        + '#dsr-tr .dsr-panel .dsr-off{color:#b42318;}'
        + '@media print{#dsr-tr{display:none!important;}}';
      document.head.appendChild(st);
      root = document.createElement('div');
      root.id = 'dsr-tr';
      root.setAttribute('data-dsr-skip', '1');
      if (window.__DASA_REVIEW__) root.style.top = '46px'; // 교사 검토 화면의 ⏭ 건너뛰기 배지(우상단)와 겹침 방지
      document.body.appendChild(root);
    }
    // 접힌 🌐 원형 버튼 + 눌렀을 때만 열리는 패널. 항상 펼쳐진 칩 줄은 실습 우상단 콘텐츠를 가렸다.
    function renderUI() {
      ensureRoot();
      root.innerHTML = '';
      var fab = document.createElement('button');
      fab.className = 'dsr-fab';
      fab.title = state.lang ? '번역: ' + state.lang : '번역';
      fab.textContent = '🌐';
      if (state.lang && !state.showOriginal) {
        var dot = document.createElement('span'); dot.className = 'dsr-dot'; fab.appendChild(dot);
      }
      fab.onclick = function () {
        // 언어가 하나뿐이고 아직 안 켰으면 바로 그 언어로 번역 (한 번 덜 누르게)
        if (!state.lang && LANGS.length === 1) { selectLang(LANGS[0]); return; }
        menuOpen = !menuOpen; renderUI();
      };
      var panel = document.createElement('div');
      panel.className = 'dsr-panel' + (menuOpen ? ' open' : '');
      if (state.lang) {
        var cur = document.createElement('span');
        cur.className = 'dsr-cur';
        cur.textContent = '🌐 ' + state.lang;
        panel.appendChild(cur);
        var toggle = document.createElement('button');
        toggle.textContent = state.showOriginal ? '번역 보기' : '원문 보기';
        toggle.onclick = toggleOriginal;
        panel.appendChild(toggle);
      }
      LANGS.forEach(function (lang) {
        if (lang === state.lang) return;
        var b = document.createElement('button');
        b.textContent = lang;
        b.onclick = function () { selectLang(lang); };
        panel.appendChild(b);
      });
      if (state.lang) {
        var off = document.createElement('button');
        off.className = 'dsr-off';
        off.textContent = '번역 끄기';
        off.onclick = turnOff;
        panel.appendChild(off);
      }
      root.appendChild(fab);
      root.appendChild(panel);
    }

    var moTimer = null, inited = false;
    function init() {
      if (inited) return; inited = true;
      renderUI();
      // 학생이 이미 고른 언어가 사전에 있으면 자동으로 그 언어로 켠다.
      // 교사 검토 화면(__DASA_REVIEW__)에서는 교사가 원문을 봐야 하므로 자동으로 켜지 않는다(수동 🌐 버튼은 그대로).
      if (!window.__DASA_REVIEW__) {
        var autoKey = langKeyForIso(readVoiceIso());
        if (autoKey && !state.lang) selectLang(autoKey);
      }
      // 실습이 떠 있는 동안 학생이 언어를 바꾸면 부모(StudentContentPreviewFrame)가 알려준다 → 즉시 따라간다.
      // 사전에 없는 언어(한국어 되돌리기 iso 'ko' 포함)로 바꾸면 번역을 끄고 원문으로 돌린다.
      window.addEventListener('message', function (e) {
        if (!e.data || e.data.type !== 'dsr-voice-lang') return;
        var key = langKeyForIso(e.data.iso);
        if (key && key !== state.lang) selectLang(key);
        else if (!key && state.lang) turnOff();
      });
      // 패널이 열린 채 실습을 조작하다 가려지지 않게, 바깥을 누르면 접는다.
      document.addEventListener('click', function (e) {
        if (menuOpen && root && !root.contains(e.target)) { menuOpen = false; renderUI(); }
      }, true);
      try {
        var mo = new MutationObserver(function () {
          if (!state.lang || state.showOriginal) return;
          clearTimeout(moTimer);
          moTimer = setTimeout(applyTranslations, 250);
        });
        mo.observe(document.body, { childList: true, subtree: true });
      } catch (e) {}
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  })();
  <\/script>
`;

// 문서의 특정 오프셋 앞에 문자열을 끼워 넣는다. replace()를 쓰지 않는 이유: 주입 문자열에
// 들어 있는 $&·$1 같은 시퀀스가 특수 치환 패턴으로 해석돼 마크업이 깨질 수 있기 때문.
const spliceAt = (source: string, index: number, insertion: string): string =>
  index < 0 ? source : `${source.slice(0, index)}${insertion}${source.slice(index)}`;

const injectIframeMarkup = (html: string, styleTag: string, scriptTag: string) => {
  let nextHtml = html;
  const lower = () => nextHtml.toLowerCase();

  // 스타일은 문서의 진짜 <head> 닫는 태그(=첫 </head>) 앞에 넣는다. 실습 <script>가 문자열로
  // "</head>"를 품고 있어도 그건 문서 head 뒤라 항상 나중에 나온다.
  const headClose = lower().indexOf('</head>');
  if (headClose !== -1) {
    nextHtml = spliceAt(nextHtml, headClose, styleTag);
  } else {
    const bodyOpen = nextHtml.match(/<body[^>]*>/i);
    if (bodyOpen) {
      nextHtml = spliceAt(nextHtml, bodyOpen.index! + bodyOpen[0].length, styleTag);
    } else {
      nextHtml = `${styleTag}${nextHtml}`;
    }
  }

  // 스크립트는 문서의 진짜 </body>(=마지막 </body>) 앞에 넣는다. 실습 <script>가 다운로드용
  // HTML 문서를 문자열로 조립하면(예: resultDoc() → "…</body></html>") 그 문자열 속 </body>가
  // 먼저 나오는데, 거기에 주입하면 우리 <script>가 실습 <script> 한복판에 박혀 조기 종료시키고
  // 나머지 실습 코드가 화면에 raw 텍스트로 새어 나온다. 그래서 반드시 마지막 것을 골라야 한다.
  const bodyClose = lower().lastIndexOf('</body>');
  nextHtml = bodyClose !== -1 ? spliceAt(nextHtml, bodyClose, scriptTag) : `${nextHtml}${scriptTag}`;

  return nextHtml;
};

// 교사 검토 화면(대시보드·콘텐츠 라이브러리 미리보기)에서만 head에 주입되는 검토 브리지.
// 학생 화면에는 절대 주입하지 않는다. 실습 HTML은 버튼을 직접 만들지 않고
// window.__reviewSkip = () => { ...다음 단계로... } 한 줄만 정의하면, 프레임의 공용
// ⏭ 버튼이 postMessage로 그 훅을 호출한다. 훅이 없는 콘텐츠에는 버튼이 안 뜬다.
const reviewBridgeScriptTag = `<script>
window.__DASA_REVIEW__=true;
(function(){
  function report(){
    try{parent.postMessage({type:'dasa-review-skip-available',available:typeof window.__reviewSkip==='function'},'*');}catch(e){}
  }
  window.addEventListener('message',function(e){
    if(e.data&&e.data.type==='dasa-review-skip'&&typeof window.__reviewSkip==='function'){try{window.__reviewSkip();}catch(err){}}
  });
  window.addEventListener('load',function(){report();setTimeout(report,800);});
})();
</script>`;

export const buildResponsiveSrcDoc = (html: string, options?: { review?: boolean }) => {
  const trimmedHtml = html.trim();
  if (!trimmedHtml) {
    return '';
  }

  // 실습 안 🌐 번역 버튼(이주민 학생용 병기 번역)은 노출한다. 페이지 상단 UI 언어 선택기는 대신 숨긴다.
  // 끄려면 false로.
  const ENABLE_INLINE_TRANSLATE = true;
  const translateTag = ENABLE_INLINE_TRANSLATE ? iframeTranslateScriptTag : '';
  // 브리지는 실습 <script>보다 먼저 실행돼야 하므로 head 쪽에 넣는다.
  const headTags = (options?.review ? reviewBridgeScriptTag : '') + iframeResponsiveStyleTag;

  if (/<html[\s>]/i.test(trimmedHtml) || /<body[\s>]/i.test(trimmedHtml) || /<!doctype/i.test(trimmedHtml)) {
    return injectIframeMarkup(trimmedHtml, headTags, iframeHeightScriptTag + translateTag);
  }

  return `<!DOCTYPE html>
    <html lang="ko">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        ${headTags}
      </head>
      <body>
        <div class="student-content-root">${trimmedHtml}</div>
        ${iframeHeightScriptTag}
        ${translateTag}
      </body>
    </html>`;
};

interface StudentContentPreviewFrameProps {
  html: string;
  title: string;
  autoHeight?: boolean;
  className?: string;
  /** 교사 검토 화면에서 true — 검토 브리지를 주입하고, 콘텐츠가 __reviewSkip 훅을 정의하면 공용 ⏭ 버튼을 띄운다. */
  reviewMode?: boolean;
}

export const StudentContentPreviewFrame: React.FC<StudentContentPreviewFrameProps> = ({
  html,
  title,
  autoHeight = true,
  className = '',
  reviewMode = false,
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [skipAvailable, setSkipAvailable] = useState(false);
  const srcDoc = buildResponsiveSrcDoc(html, { review: reviewMode });

  useEffect(() => {
    if (!autoHeight) {
      return;
    }

    const handleIframeHeightMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'iframe-height' || !event.data.height || !iframeRef.current) {
        return;
      }

      if (iframeRef.current.contentWindow && event.source !== iframeRef.current.contentWindow) {
        return;
      }

      iframeRef.current.style.height = `${event.data.height}px`;
    };

    window.addEventListener('message', handleIframeHeightMessage);
    return () => window.removeEventListener('message', handleIframeHeightMessage);
  }, [autoHeight]);

  useEffect(() => {
    if (!reviewMode) {
      return;
    }

    const handleSkipAvailableMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'dasa-review-skip-available' || !iframeRef.current) {
        return;
      }
      if (iframeRef.current.contentWindow && event.source !== iframeRef.current.contentWindow) {
        return;
      }
      setSkipAvailable(Boolean(event.data.available));
    };

    window.addEventListener('message', handleSkipAvailableMessage);
    return () => window.removeEventListener('message', handleSkipAvailableMessage);
  }, [reviewMode]);

  // srcDoc이 바뀌면(핫리로드) iframe이 새로 뜨므로 지원 여부도 다시 보고받는다.
  useEffect(() => {
    setSkipAvailable(false);
  }, [srcDoc]);

  // 학생이 음성 버튼에서 언어를 바꾸면 iframe 안 번역 스크립트에 전달해 실습 병기 번역도 같은 언어로 맞춘다.
  // (iframe 로드 시점의 초기 언어는 스크립트가 localStorage에서 직접 읽는다 — 여기는 '변경'만 중계.)
  useEffect(() => {
    const handleVoiceLangChanged = (event: Event) => {
      const iso = (event as CustomEvent<{ iso?: unknown }>).detail?.iso;
      if (typeof iso !== 'string' || !iso) return;
      iframeRef.current?.contentWindow?.postMessage({ type: 'dsr-voice-lang', iso }, '*');
    };
    window.addEventListener(VOICE_LANG_CHANGED_EVENT, handleVoiceLangChanged);
    return () => window.removeEventListener(VOICE_LANG_CHANGED_EVENT, handleVoiceLangChanged);
  }, []);

  const iframeElement = (
    <iframe
      ref={iframeRef}
      srcDoc={srcDoc}
      className={className}
      style={autoHeight ? { border: 'none', overflow: 'hidden', height: '600px' } : { border: 'none' }}
      scrolling={autoHeight ? 'no' : undefined}
      sandbox="allow-scripts allow-same-origin"
      title={title}
      onLoad={autoHeight ? (event) => {
        const iframe = event.target as HTMLIFrameElement;
        try {
          const doc = iframe.contentDocument;
          if (doc) {
            const nextHeight = Math.max(
              doc.body?.scrollHeight ?? 0,
              doc.body?.offsetHeight ?? 0,
              doc.documentElement.scrollHeight,
              doc.documentElement.offsetHeight
            );
            if (nextHeight) {
              iframe.style.height = `${nextHeight}px`;
            }
          }
        } catch (_) {
          // Cross-document access can fail for sandboxed content. The postMessage path still handles updates.
        }
      } : undefined}
    />
  );

  if (!reviewMode) {
    return iframeElement;
  }

  // 검토 모드: 콘텐츠 위에 공용 컨트롤을 얹기 위해 relative 래퍼로 감싼다.
  // 래퍼가 기존 className(폭·높이)을 이어받고 iframe이 래퍼를 가득 채운다.
  return (
    <div className={`relative ${className}`.trim()}>
      {React.cloneElement(iframeElement, { className: 'h-full w-full' })}
      {skipAvailable && (
        <button
          type="button"
          onClick={() =>
            iframeRef.current?.contentWindow?.postMessage({ type: 'dasa-review-skip' }, '*')
          }
          className="absolute right-2 top-2 z-10 rounded-lg bg-black/55 px-2.5 py-1.5 text-xs font-bold text-white shadow transition-all hover:bg-black/75"
        >
          ⏭ 건너뛰기
        </button>
      )}
    </div>
  );
};

interface StudentContentCardProps {
  content: LessonContent;
  className?: string;
  headerControls?: React.ReactNode;
  details?: React.ReactNode;
  showDescriptionToggle?: boolean;
}

export const StudentContentCard: React.FC<StudentContentCardProps> = ({
  content,
  className = '',
  headerControls,
  details,
  showDescriptionToggle = true,
}) => {
  const hasDescription = Boolean(content.description?.trim());
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const descriptionPanelId = `content-description-${content.id}`;

  useEffect(() => {
    setIsDescriptionExpanded(false);
  }, [content.id]);

  return (
    <section className={`w-full max-w-none overflow-hidden rounded-[32px] border border-[#E5E3DD] bg-white shadow-sm ${className}`.trim()}>
      <div className="flex flex-col gap-4 border-b border-[#F3F2EE] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#FFF5E9] rounded-xl flex items-center justify-center">
            <FileText size={16} className="text-[#8B5E3C]" />
          </div>
          <h3 className="text-lg font-bold text-[#4A3728]">{content.title}</h3>
          {content.kind === 'reference' && (
            <span className="inline-flex shrink-0 items-center rounded-full bg-[#FFF1DC] px-2.5 py-1 text-xs font-bold text-[#8B5E3C]">
              예시 · 따라 만들어요
            </span>
          )}
        </div>
        {headerControls ? (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            {headerControls}
          </div>
        ) : null}
      </div>

      {showDescriptionToggle && hasDescription ? (
        <div className="border-b border-[#F3F2EE] bg-[#FFFDF9]">
          <button
            type="button"
            aria-expanded={isDescriptionExpanded}
            aria-controls={descriptionPanelId}
            onClick={() => setIsDescriptionExpanded((current) => !current)}
            className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left transition-all hover:bg-[#FFF8EF] sm:px-8"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#8B5E3C] shadow-sm">
                <FileText size={15} />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#A89F94]">수업 설명</p>
                <p className="text-sm font-medium text-[#4A3728]">
                  {isDescriptionExpanded ? '설명을 접기' : '설명 보기'}
                </p>
              </div>
            </div>
            <ChevronDown
              size={18}
              className={`shrink-0 text-[#8B5E3C] transition-transform ${
                isDescriptionExpanded ? 'rotate-180' : 'rotate-0'
              }`}
            />
          </button>

          {isDescriptionExpanded ? (
            <div id={descriptionPanelId} className="border-t border-[#F3F2EE] px-5 py-5 sm:px-8">
              <p className="whitespace-pre-wrap text-sm leading-7 text-[#4A3728]">{content.description}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {details}

      {content.slideUrl?.trim() ? (
        <SlideEmbed
          slideUrl={content.slideUrl}
          title={content.title}
          roundedBottom={!content.html?.trim()}
        />
      ) : null}

      {content.html?.trim() ? (
        <StudentContentPreviewFrame
          html={content.html}
          title={content.title}
          className="w-full rounded-b-[32px]"
        />
      ) : null}
    </section>
  );
};
