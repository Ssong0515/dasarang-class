import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, FileText, Maximize2, Minimize2, Presentation } from 'lucide-react';
import { LessonContent } from '../types';

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

// 실습 iframe 안에 떠 있는 🌐 번역 버튼 + 브리지. 크롬 페이지 번역은 샌드박스 iframe 내부를 번역하지 않으므로
// (크로뮴 41090662, wontfix), 실습 HTML이 화면의 한국어 텍스트를 부모(StudentPage)에 보내 Gemini로 번역받아 채운다.
// 부모 메시지 규약: 실습→부모 { type:'practice-translate', requestId, texts:string[], targetLanguage }, 부모→실습 { type:'practice-translate-result', requestId, map }.
const iframeTranslateScriptTag = `
  <script>
  (function () {
    if (window.self === window.top) return;            // 앱 밖(단독 실행)에서는 부모가 없어 번역 불가 → 버튼 숨김
    if (window.__dsrTrInit) return; window.__dsrTrInit = true;

    var LANGS = [
      { ko: '러시아어', api: 'Russian' },
      { ko: '영어', api: 'English' },
      { ko: '중국어', api: 'Chinese (Simplified)' },
      { ko: '베트남어', api: 'Vietnamese' },
      { ko: '우즈베크어', api: 'Uzbek' },
      { ko: '몽골어', api: 'Mongolian' },
      { ko: '네팔어', api: 'Nepali' },
      { ko: '필리핀어', api: 'Filipino' },
      { ko: '태국어', api: 'Thai' },
      { ko: '인도네시아어', api: 'Indonesian' },
      { ko: '캄보디아어', api: 'Khmer' },
      { ko: '미얀마어', api: 'Burmese' }
    ];
    var KO = /[\\uAC00-\\uD7A3]/;       // 한글이 든 텍스트만 번역
    var cache = {};                     // api언어 -> { 원문: 번역 }
    var originals = [];                  // 번역으로 바뀐 텍스트 노드 모음(원문 복원용)
    var state = { lang: null, showOriginal: false, busy: false };
    var pending = {};                    // requestId -> api언어
    var reqId = 0;
    var root = null, menuOpen = false;

    function koLabelFor(api) {
      for (var i = 0; i < LANGS.length; i++) if (LANGS[i].api === api) return LANGS[i].ko;
      return api;
    }
    function noPending() { for (var k in pending) if (pending.hasOwnProperty(k)) return false; return true; }
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
    function collectUntranslated(api) {
      var dict = cache[api] || {};
      var seen = {}, list = [];
      eachKoTextNode(function (n, key) {
        if (dict[key] == null && !seen[key]) { seen[key] = 1; list.push(key); }
      });
      return list;
    }
    function applyTranslations() {
      if (!state.lang || state.showOriginal) return;
      var dict = cache[state.lang] || {};
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
    function requestTranslate(api, list) {
      setBusy(true);
      var id = ++reqId; pending[id] = api;
      window.parent.postMessage({ type: 'practice-translate', requestId: id, texts: list, targetLanguage: api }, '*');
      setTimeout(function () { if (pending[id]) { delete pending[id]; if (noPending()) setBusy(false); } }, 20000);
    }
    function ensureTranslated() {
      if (!state.lang || state.showOriginal) return;
      var todo = collectUntranslated(state.lang);
      if (todo.length) requestTranslate(state.lang, todo);
      applyTranslations();
    }
    function selectLang(api) { state.lang = api; state.showOriginal = false; menuOpen = false; renderUI(); ensureTranslated(); }
    function toggleOriginal() {
      state.showOriginal = !state.showOriginal;
      if (state.showOriginal) restoreOriginals(); else applyTranslations();
      renderUI();
    }
    function turnOff() { restoreOriginals(); state.lang = null; state.showOriginal = false; menuOpen = false; renderUI(); }
    function setBusy(b) { state.busy = b; renderUI(); }

    window.addEventListener('message', function (e) {
      var d = e.data;
      if (!d) return;
      if (d.type === 'practice-translate-pong') { init(); return; }   // 부모가 번역을 지원할 때만 버튼을 띄운다
      if (d.type !== 'practice-translate-result') return;
      var api = pending[d.requestId];
      if (api == null) return;
      delete pending[d.requestId];
      var dict = cache[api] || (cache[api] = {});
      var m = d.map || {};
      for (var k in m) if (m.hasOwnProperty(k)) dict[k] = m[k];
      if (noPending()) setBusy(false);
      if (state.lang === api && !state.showOriginal) applyTranslations();
    });

    function ensureRoot() {
      if (root) return;
      var st = document.createElement('style');
      st.textContent =
        '#dsr-tr{position:fixed;top:10px;right:10px;z-index:2147483000;font-family:"Malgun Gothic","맑은 고딕",system-ui,sans-serif;text-align:right;}'
        + '#dsr-tr *{box-sizing:border-box;}'
        + '#dsr-tr .dsr-row{display:inline-flex;gap:6px;align-items:center;justify-content:flex-end;flex-wrap:wrap;}'
        + '#dsr-tr .dsr-btn{display:inline-flex;align-items:center;gap:6px;border:none;border-radius:999px;background:#3b6fe0;color:#fff;font-size:15px;font-weight:800;padding:9px 14px;cursor:pointer;box-shadow:0 4px 12px rgba(40,55,90,.25);}'
        + '#dsr-tr .dsr-btn.ghost{background:#fff;color:#3b6fe0;border:2px solid #cfd9f5;box-shadow:0 3px 8px rgba(40,55,90,.12);}'
        + '#dsr-tr .dsr-chip{background:#eafaf0;color:#1a7f47;border:2px solid #56cf8c;border-radius:999px;padding:7px 12px;font-size:14px;font-weight:800;}'
        + '#dsr-tr .dsr-menu{margin-top:6px;background:#fff;border:2px solid #e4e8f2;border-radius:14px;box-shadow:0 12px 30px rgba(40,55,90,.18);padding:6px;max-height:60vh;overflow:auto;display:none;min-width:160px;text-align:left;}'
        + '#dsr-tr .dsr-menu.open{display:block;}'
        + '#dsr-tr .dsr-menu button{display:block;width:100%;text-align:left;border:none;background:none;font-size:15px;font-weight:700;color:#2f3445;padding:9px 12px;border-radius:9px;cursor:pointer;}'
        + '#dsr-tr .dsr-menu button:hover{background:#eef2fb;}'
        + '@media print{#dsr-tr{display:none!important;}}';
      document.head.appendChild(st);
      root = document.createElement('div');
      root.id = 'dsr-tr';
      root.setAttribute('data-dsr-skip', '1');
      document.body.appendChild(root);
    }
    function buildMenu(container) {
      LANGS.forEach(function (l) {
        var b = document.createElement('button');
        b.textContent = l.ko;
        b.onclick = function () { selectLang(l.api); };
        container.appendChild(b);
      });
      if (menuOpen) container.classList.add('open');
    }
    function renderUI() {
      ensureRoot();
      root.innerHTML = '';
      var row = document.createElement('div'); row.className = 'dsr-row';
      var menu = document.createElement('div'); menu.className = 'dsr-menu';
      if (!state.lang) {
        var main = document.createElement('button');
        main.className = 'dsr-btn';
        main.textContent = state.busy ? '번역 중…' : '🌐 번역';
        main.onclick = function () { menuOpen = !menuOpen; renderUI(); };
        row.appendChild(main);
      } else {
        var chip = document.createElement('span');
        chip.className = 'dsr-chip';
        chip.textContent = state.busy ? '번역 중…' : ('🌐 ' + koLabelFor(state.lang));
        row.appendChild(chip);
        var toggle = document.createElement('button');
        toggle.className = 'dsr-btn ghost';
        toggle.textContent = state.showOriginal ? '번역 보기' : '원문 보기';
        toggle.onclick = toggleOriginal;
        row.appendChild(toggle);
        var langBtn = document.createElement('button');
        langBtn.className = 'dsr-btn ghost';
        langBtn.textContent = '언어';
        langBtn.onclick = function () { menuOpen = !menuOpen; renderUI(); };
        row.appendChild(langBtn);
        var off = document.createElement('button');
        off.className = 'dsr-btn ghost';
        off.textContent = '✕';
        off.onclick = turnOff;
        row.appendChild(off);
      }
      buildMenu(menu);
      root.appendChild(row);
      root.appendChild(menu);
    }

    var moTimer = null, inited = false;
    function init() {
      if (inited) return; inited = true;
      renderUI();
      try {
        var mo = new MutationObserver(function () {
          if (!state.lang || state.showOriginal) return;
          clearTimeout(moTimer);
          moTimer = setTimeout(ensureTranslated, 250);
        });
        mo.observe(document.body, { childList: true, subtree: true });
      } catch (e) {}
    }
    // 부모(학생 페이지)가 번역 브리지를 지원하는지 핑/퐁으로 확인 → 지원할 때만 버튼 표시. (관리자 미리보기 등 미지원 화면에선 안 뜸)
    function pingParent() { try { window.parent.postMessage({ type: 'practice-translate-ping' }, '*'); } catch (e) {} }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pingParent);
    else pingParent();
    setTimeout(pingParent, 600);   // 부모 리스너가 늦게 붙는 경우 대비
  })();
  <\/script>
`;

const injectIframeMarkup = (html: string, styleTag: string, scriptTag: string) => {
  let nextHtml = html;

  if (/<\/head>/i.test(nextHtml)) {
    nextHtml = nextHtml.replace(/<\/head>/i, `${styleTag}</head>`);
  } else if (/<body[^>]*>/i.test(nextHtml)) {
    nextHtml = nextHtml.replace(/<body([^>]*)>/i, `<body$1>${styleTag}`);
  } else {
    nextHtml = `${styleTag}${nextHtml}`;
  }

  if (/<\/body>/i.test(nextHtml)) {
    nextHtml = nextHtml.replace(/<\/body>/i, `${scriptTag}</body>`);
  } else {
    nextHtml = `${nextHtml}${scriptTag}`;
  }

  return nextHtml;
};

export const buildResponsiveSrcDoc = (html: string) => {
  const trimmedHtml = html.trim();
  if (!trimmedHtml) {
    return '';
  }

  if (/<html[\s>]/i.test(trimmedHtml) || /<body[\s>]/i.test(trimmedHtml) || /<!doctype/i.test(trimmedHtml)) {
    return injectIframeMarkup(trimmedHtml, iframeResponsiveStyleTag, iframeHeightScriptTag + iframeTranslateScriptTag);
  }

  return `<!DOCTYPE html>
    <html lang="ko">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        ${iframeResponsiveStyleTag}
      </head>
      <body>
        <div class="student-content-root">${trimmedHtml}</div>
        ${iframeHeightScriptTag}
        ${iframeTranslateScriptTag}
      </body>
    </html>`;
};

interface StudentContentPreviewFrameProps {
  html: string;
  title: string;
  autoHeight?: boolean;
  className?: string;
}

export const StudentContentPreviewFrame: React.FC<StudentContentPreviewFrameProps> = ({
  html,
  title,
  autoHeight = true,
  className = '',
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const srcDoc = buildResponsiveSrcDoc(html);

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

  return (
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
