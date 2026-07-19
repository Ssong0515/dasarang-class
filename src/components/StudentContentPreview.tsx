import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, FileText, Languages, Maximize2, Minimize2, Presentation, X } from 'lucide-react';
import { LessonContent } from '../types';
import { LANGUAGE_ALIASES } from '../utils/studentLanguage';
import { LANG_MAX_AGE_MS, VOICE_LANG_CHANGED_EVENT } from './StudentVoiceButton';

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

// 실습 iframe 병기 번역 엔진. 크롬 페이지 번역은 샌드박스 iframe 내부를 번역하지 않으므로
// (크로뮴 41090662, wontfix), 실습 HTML 자체에 심어 둔 번역 사전(루틴이 생성 시 주입)으로 텍스트를 치환한다.
// 사전 규약: window.__DSR_TR__ = { "러시아어": { "원문": "번역", ... }, "영어": {...} }. 사전이 없으면 아무것도 안 한다.
// ★ 학생 화면에는 버튼 UI가 없다(2026-07-07): 실습 안 🌐 버튼과 우하단 FAB가 동시에 떠 학생이 혼란스러워해서,
//   언어 제어는 학생 페이지 우하단 언어 버튼(StudentVoiceButton) 하나로 통일했다. 초기 언어는 localStorage
//   'dsr_voice_lang'에서 읽고, 수업 중 변경은 부모(StudentContentPreviewFrame)의 postMessage({type:'dsr-voice-lang', iso})를 따른다.
// ★ 교사 검토 화면(__DASA_REVIEW__)에서만 우상단 🌐 수동 버튼을 띄운다 — 강사가 사전 번역을 직접 확인하는 용도.
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
    // ★ 만료 검증 포함(2026-07-07): StudentVoiceButton과 같은 규칙(오늘 날짜 classKey + TTL). FAB가 없는 화면
    //   (강사의 학생 페이지 미리보기, 콘텐츠 라이브러리의 학생 화면 미리보기)에서는 아무도 만료 정리를 안 해 주고
    //   이제 실습 안에 번역을 끌 버튼도 없으므로, 며칠 지난 선택이 자동 번역을 켜지 않게 여기서도 걸러야 한다.
    function readVoiceIso() {
      try {
        var raw = window.localStorage.getItem('dsr_voice_lang');
        if (!raw) return null;
        var parsed = JSON.parse(raw);
        if (!parsed || typeof parsed.iso !== 'string' || !parsed.iso) return null;
        var setAtMs = new Date(parsed.setAt || 0).getTime();
        if (!isFinite(setAtMs) || Date.now() - setAtMs > ${LANG_MAX_AGE_MS}) return null;
        var now = new Date();
        var pad = function (n) { return (n < 10 ? '0' : '') + n; };
        var todayKey = 'today_' + now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
        if (parsed.classKey !== todayKey) return null;
        return parsed.iso;
      } catch (e) { return null; }
    }

    var KO = /[\\uAC00-\\uD7A3]/;       // 한글이 든 텍스트만 번역
    var originals = [];                  // 번역으로 바뀐 텍스트 노드 모음(원문 복원용)
    var state = { lang: null, showOriginal: false };
    var root = null, menuOpen = false;
    var REVIEW = !!window.__DASA_REVIEW__; // 검토 모드에서만 수동 🌐 버튼 UI를 만든다(학생 화면은 버튼 없음)

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
    // 언어 전환 시 이전 언어의 흔적이 남지 않게 먼저 원문으로 되돌린 뒤 새 사전을 적용한다 —
    // 새 사전에 없는 키가 이전 언어 번역으로 남아 두 언어가 섞이는 것 방지(같은 틱이라 화면 깜빡임 없음).
    function selectLang(lang) {
      if (state.lang && state.lang !== lang) restoreOriginals();
      state.lang = lang; state.showOriginal = false; menuOpen = false; renderUI(); applyTranslations();
    }
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
      document.body.appendChild(root);
    }
    // 접힌 🌐 원형 버튼 + 눌렀을 때만 열리는 패널 — 교사 검토 화면 전용(강사가 사전 번역을 확인).
    // 학생 화면에서는 no-op: 언어 제어는 우하단 언어 버튼(StudentVoiceButton) 하나뿐이다.
    function renderUI() {
      if (!REVIEW) return;
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
      // 학생이 우하단 언어 버튼에서 이미 고른 언어가 사전에 있으면 자동으로 그 언어로 켠다.
      // 교사 검토 화면에서는 교사가 원문을 봐야 하므로 자동으로 켜지 않는다(수동 🌐 버튼은 그대로).
      if (!REVIEW) {
        var autoKey = langKeyForIso(readVoiceIso());
        if (autoKey && !state.lang) selectLang(autoKey);
      }
      // 실습이 떠 있는 동안 학생이 우하단 언어 버튼으로 언어를 바꾸면 부모(StudentContentPreviewFrame)가
      // 알려준다 → 즉시 따라간다. 사전에 없는 언어(한국어 되돌리기 iso 'ko' 포함)로 바꾸면 번역을 끄고 원문으로 돌린다.
      window.addEventListener('message', function (e) {
        if (!e.data || e.data.type !== 'dsr-voice-lang') return;
        var key = langKeyForIso(e.data.iso);
        if (key && key !== state.lang) selectLang(key);
        else if (!key && state.lang) turnOff();
      });
      // (검토 화면 전용) 패널이 열린 채 실습을 조작하다 가려지지 않게, 바깥을 누르면 접는다.
      if (REVIEW) {
        document.addEventListener('click', function (e) {
          if (menuOpen && root && !root.contains(e.target)) { menuOpen = false; renderUI(); }
        }, true);
      }
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

// 예제(kind:reference) 공용 화면 전용 '병기' 모드. 학생 화면의 치환 번역과 달리, 한국어 원문은 그대로 두고
// 선택한 언어들의 번역을 각 한국어 구절 바로 아래에 연한 보라 박스로 덧붙인다(병기). 강사가 빔프로젝터에
// 예제를 띄우고 여러 언어를 동시에 보여줄 때 쓴다. 부모(ReferenceAnnotationOverlay)와 규약:
//   iframe→부모: postMessage({type:'dsr-annot-langs', langs})  — 이 예제가 번역 가능한 언어 목록
//   부모→iframe: postMessage({type:'dsr-annot-set', langs})    — 병기할 언어들(빈 배열이면 원문만)
//               postMessage({type:'dsr-annot-report'})         — 언어 목록 다시 보고 요청
// 사전 규약은 학생 번역과 동일: window.__DSR_TR__ = { "러시아어": {원문:번역}, ... }. 사전이 없으면 langs=[].
const iframeAnnotateScriptTag = `
  <script>
  (function () {
    if (window.__dsrAnnotInit) return; window.__dsrAnnotInit = true;

    var TR = window.__DSR_TR__;
    var LANGS = (TR && typeof TR === 'object')
      ? Object.keys(TR).filter(function (k) { return TR[k] && typeof TR[k] === 'object'; })
      : [];
    var KO = /[\\uAC00-\\uD7A3]/;   // 한글이 든 텍스트 노드만 병기 대상
    var selected = [];               // 병기 중인 언어명들
    var inserted = [];               // 우리가 끼워 넣은 병기 박스(정리용)

    function reportLangs() {
      try { window.parent.postMessage({ type: 'dsr-annot-langs', langs: LANGS }, '*'); } catch (e) {}
    }
    function notifyHeight() { try { window.dispatchEvent(new Event('resize')); } catch (e) {} }

    function isSkippable(node) {
      var p = node.parentNode;
      while (p && p.nodeType === 1) {
        var tag = p.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'NOSCRIPT') return true;
        if (p.getAttribute && p.getAttribute('data-dsr-skip') === '1') return true;  // 우리가 넣은 병기 박스는 재순회 제외
        p = p.parentNode;
      }
      return false;
    }
    function clearAnnots() {
      for (var i = 0; i < inserted.length; i++) {
        var el = inserted[i];
        if (el && el.parentNode) el.parentNode.removeChild(el);
      }
      inserted = [];
    }
    function buildAnnot(key) {
      var box = document.createElement('span');
      box.className = 'dsr-annot';
      box.setAttribute('data-dsr-skip', '1');
      var showTag = selected.length > 1;   // 2개 이상 병기할 때만 언어 라벨을 붙인다
      for (var s = 0; s < selected.length; s++) {
        var lang = selected[s];
        var dict = TR[lang];
        var tr = dict ? dict[key] : null;
        if (tr == null) continue;
        var line = document.createElement('span');
        line.className = 'dsr-annot-line';
        if (showTag) {
          var tagEl = document.createElement('span');
          tagEl.className = 'dsr-annot-tag';
          tagEl.textContent = lang;
          line.appendChild(tagEl);
        }
        line.appendChild(document.createTextNode(tr));
        box.appendChild(line);
      }
      return box.childNodes.length ? box : null;
    }
    function applyAnnots() {
      clearAnnots();
      if (!selected.length || !document.body) { notifyHeight(); return; }
      // 먼저 대상 노드를 모아 두고(순회 중 DOM을 건드리지 않게) 나중에 삽입한다.
      var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
      var n, todo = [];
      while ((n = w.nextNode())) {
        if (!n.nodeValue) continue;
        var key = n.nodeValue.trim();
        if (!key || !KO.test(key)) continue;
        if (isSkippable(n)) continue;
        var has = false;
        for (var i = 0; i < selected.length; i++) {
          var d = TR[selected[i]];
          if (d && d[key] != null) { has = true; break; }
        }
        if (has) todo.push({ node: n, key: key });
      }
      for (var t = 0; t < todo.length; t++) {
        var box = buildAnnot(todo[t].key);
        if (!box) continue;
        var node = todo[t].node;
        if (node.parentNode) {
          node.parentNode.insertBefore(box, node.nextSibling);
          inserted.push(box);
        }
      }
      notifyHeight();
    }

    function ensureStyle() {
      if (document.getElementById('dsr-annot-style')) return;
      var st = document.createElement('style');
      st.id = 'dsr-annot-style';
      st.textContent =
        '.dsr-annot{display:block;margin:3px 0 5px;}'
        + '.dsr-annot-line{display:block;background:#ede9fe;color:#4c1d95;border-radius:8px;padding:3px 10px;margin-top:3px;font-size:.85em;font-weight:600;line-height:1.5;}'
        + '.dsr-annot-tag{display:inline-block;font-size:.72em;font-weight:800;color:#7c3aed;margin-right:6px;opacity:.85;}'
        + '@media print{.dsr-annot-line{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}';
      (document.head || document.documentElement).appendChild(st);
    }

    window.addEventListener('message', function (e) {
      if (!e.data) return;
      if (e.data.type === 'dsr-annot-set' && Object.prototype.toString.call(e.data.langs) === '[object Array]') {
        selected = e.data.langs.filter(function (x) { return typeof x === 'string' && TR && TR[x]; });
        applyAnnots();
      } else if (e.data.type === 'dsr-annot-report') {
        reportLangs();
      }
    });

    function init() { ensureStyle(); reportLangs(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
    window.addEventListener('load', reportLangs);   // 로드 완료 후 한 번 더 보고(초기 렌더 경합 방지)
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

// 교사 검토 화면(대시보드·콘텐츠 라이브러리 미리보기)에서만 head에 주입되는 검토 플래그 + 단계 이동 브리지.
// 학생 화면에는 절대 주입하지 않는다. 번역 엔진이 __DASA_REVIEW__ 값으로 수동 🌐 버튼을 띄운다.
//
// ◀ ▶ '콘텐츠 안 단계 이동'(2026-07-19 복원): 미리보기 모달의 ▶는 실습의 다음 단계로 건너뛰고
// ◀는 이전 단계로 되돌린다(콘텐츠와 콘텐츠 사이 이동이 아니라 '한 실습 안에서'의 이동). 부모가
// postMessage({type:'dasa-review-nav', dir:+1|-1})를 보내면, 실습 HTML이 정의한
// window.__reviewNav(dir)를 호출한다(dir>0=다음/건너뛰기, dir<0=이전). 옛 콘텐츠 호환:
// __reviewNav가 없고 dir>0이면 예전 window.__reviewSkip()을 대신 호출한다.
const reviewFlagScriptTag = `<script>
  window.__DASA_REVIEW__ = true;
  (function () {
    window.addEventListener('message', function (e) {
      if (!e.data || e.data.type !== 'dasa-review-nav') return;
      var dir = (e.data.dir < 0) ? -1 : 1;
      try {
        if (typeof window.__reviewNav === 'function') { window.__reviewNav(dir); return; }
        if (dir > 0 && typeof window.__reviewSkip === 'function') { window.__reviewSkip(); }
      } catch (err) {}
    });
  })();
</script>`;

export const buildResponsiveSrcDoc = (
  html: string,
  options?: { review?: boolean; annotate?: boolean }
) => {
  const trimmedHtml = html.trim();
  if (!trimmedHtml) {
    return '';
  }

  // 실습 병기 번역 엔진(이주민 학생용) 주입 여부. 학생 화면은 버튼 없이 우하단 언어 버튼(StudentVoiceButton)을
  // 따라 자동 치환되고, 교사 검토 화면(reviewMode)에서만 수동 🌐 버튼이 뜬다. 끄려면 false로.
  // annotate 모드(예제 공용 화면 병기)는 치환 엔진 대신 병기 엔진을 넣는다 — 둘이 같은 텍스트 노드를
  // 두고 다투지 않게 서로 배타적으로 주입하고, 검토 브리지도 붙이지 않는다.
  const ENABLE_INLINE_TRANSLATE = true;
  const translateTag = options?.annotate
    ? iframeAnnotateScriptTag
    : ENABLE_INLINE_TRANSLATE
      ? iframeTranslateScriptTag
      : '';
  // 플래그는 실습 <script>보다 먼저 실행돼야 하므로 head 쪽에 넣는다.
  const headTags =
    (options?.review && !options?.annotate ? reviewFlagScriptTag : '') + iframeResponsiveStyleTag;

  // 문서 '시작'이 doctype/html/body일 때만 완전한 문서로 취급한다. 문서 전체에서 <body> 등을
  // 찾으면 실습 <script>가 문자열로 조립하는 태그 모양 텍스트(저장용 문서 등)에 오판해서,
  // injectIframeMarkup이 실습 스크립트 한복판에 주입하고 코드가 화면에 raw 텍스트로 새어 나온다.
  if (/^\s*(<!doctype[\s>]|<html[\s>]|<body[\s>])/i.test(trimmedHtml)) {
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
  /** 교사 검토 화면에서 true — 번역이 이 값을 따른다: true면 실습 안 수동 🌐 번역 버튼을 띄우고
   *  자동 번역을 끈다(원문 검토용), false(학생 화면·학생 화면 미리보기)면 버튼 없이
   *  우하단 언어 버튼(localStorage/postMessage)을 따라 자동 치환. */
  reviewMode?: boolean;
  /** 교사 검토 화면의 ◀ ▶ '단계 이동' 신호. seq가 바뀔 때마다 dir(+1=다음/건너뛰기, -1=이전)을
   *  iframe 안 실습(window.__reviewNav)에 전달한다. seq=0(초기값)에는 아무것도 보내지 않는다. */
  reviewNav?: { seq: number; dir: number };
}

export const StudentContentPreviewFrame: React.FC<StudentContentPreviewFrameProps> = ({
  html,
  title,
  autoHeight = true,
  className = '',
  reviewMode = false,
  reviewNav,
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const srcDoc = buildResponsiveSrcDoc(html, { review: reviewMode });

  // 교사 검토 화면의 ◀ ▶ 단계 이동 — seq가 바뀔 때만 iframe 안 실습에 방향을 전달한다.
  useEffect(() => {
    if (!reviewMode || !reviewNav || reviewNav.seq === 0) return;
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'dasa-review-nav', dir: reviewNav.dir },
      '*'
    );
  }, [reviewMode, reviewNav]);

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

interface ReferenceAnnotationOverlayProps {
  /** 예제(kind:reference)의 제목·HTML. HTML 안 window.__DSR_TR__ 사전으로 병기 언어가 정해진다. */
  title: string;
  html: string;
  onClose: () => void;
}

/**
 * 예제 공용 화면(빔프로젝터) 전용 '번역 병기' 창 전체화면 오버레이.
 * - 상단 바: 이 예제가 번역 가능한 언어들이 칩으로 뜨고, 눌러서 여러 개 고를 수 있다(다중 선택).
 * - 본문: 고른 언어들의 번역을 한국어 원문 아래에 병기한 예제를, 스크롤 없이 한 화면에 다 보이도록
 *   높이에 맞춰 자동 축소해 보여준다. (작은 팝업이 아니라 웹브라우저 창 전체를 덮는다.)
 */
export const ReferenceAnnotationOverlay: React.FC<ReferenceAnnotationOverlayProps> = ({
  title,
  html,
  onClose,
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [availableLangs, setAvailableLangs] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [contentHeight, setContentHeight] = useState(0);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  // 강사가 칩을 직접 만졌는지. 만지기 전까지는 언어 목록이 도착하면 전부 자동 선택해서
  // '번역 병기'를 누르자마자 병기가 보이게 한다(예전엔 칩을 한 번 더 눌러야 해서 안 뜨는 것처럼 보였음).
  const userTouchedLangsRef = useRef(false);

  const srcDoc = useMemo(() => buildResponsiveSrcDoc(html, { annotate: true }), [html]);

  // iframe → 부모: 번역 가능한 언어 목록 + 콘텐츠 높이. 다른 iframe(뒤에 깔린 미리보기 등)의 메시지는 무시.
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data as { type?: string; langs?: unknown; height?: unknown } | null;
      if (!data) return;
      const frameWindow = iframeRef.current?.contentWindow;
      if (frameWindow && event.source !== frameWindow) return;
      if (data.type === 'dsr-annot-langs' && Array.isArray(data.langs)) {
        const langs = data.langs.filter((lang): lang is string => typeof lang === 'string');
        setAvailableLangs(langs);
        if (!userTouchedLangsRef.current && langs.length > 0) {
          setSelected((current) => (current.length > 0 ? current : langs));
        }
      } else if (data.type === 'iframe-height' && typeof data.height === 'number' && data.height > 0) {
        setContentHeight(data.height);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // 무대(본문 영역) 크기 추적 — 여기에 맞춰 예제를 축소한다.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 고른 언어가 바뀔 때마다 iframe에 병기 언어 집합을 전달한다.
  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'dsr-annot-set', langs: selected }, '*');
  }, [selected]);

  // Esc로 닫기 + 배경 스크롤 잠금.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const toggleLang = (lang: string) => {
    userTouchedLangsRef.current = true;
    setSelected((current) =>
      current.includes(lang) ? current.filter((l) => l !== lang) : [...current, lang]
    );
  };

  // 가로는 무대 폭에 맞추고(반응형 srcDoc이 그 폭으로 리플로우), 세로로 넘치면 축소하지 말고 스크롤한다.
  // 예전엔 긴 예제(실전 미션 등)를 한 화면에 욱여넣으려고 세로로 균일 축소해서 글씨가 읽을 수 없이
  // 작아졌다 — 공용 화면은 읽기가 우선이라, 넘치면 그냥 세로 스크롤로 본다.
  const MARGIN = 20;
  const availW = Math.max(0, stage.w - MARGIN * 2);
  const availH = Math.max(0, stage.h - MARGIN * 2);
  const measured = contentHeight > 0;
  const logicalWidth = availW;
  const logicalHeight = measured ? contentHeight : availH;
  const overflowsHeight = measured && contentHeight > availH;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-[#1b1a17]">
      {/* 상단 바 — 번역 가능한 언어 칩(다중 선택) + 닫기 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/10 bg-[#211f1b] px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <Languages size={18} className="text-[#C9B8FF]" />
          번역 병기
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {availableLangs.length === 0 ? (
            <span className="text-sm text-white/50">이 예제에는 번역 사전이 없어요.</span>
          ) : (
            <>
              {availableLangs.map((lang) => {
                const on = selected.includes(lang);
                return (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => toggleLang(lang)}
                    aria-pressed={on}
                    className={`rounded-full px-3.5 py-1.5 text-sm font-bold transition-all ${
                      on
                        ? 'bg-[#7C5CFF] text-white shadow'
                        : 'bg-white/10 text-white/80 hover:bg-white/20'
                    }`}
                  >
                    {lang}
                  </button>
                );
              })}
              {selected.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    userTouchedLangsRef.current = true;
                    setSelected([]);
                  }}
                  className="rounded-full px-3 py-1.5 text-sm font-bold text-white/60 transition-all hover:bg-white/10 hover:text-white"
                >
                  원문만
                </button>
              )}
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-white/10 px-3.5 py-2 text-sm font-bold text-white transition-all hover:bg-white/20"
        >
          <X size={16} />
          닫기 <span className="hidden text-white/60 sm:inline">(Esc)</span>
        </button>
      </div>

      {/* 본문 — 무대 폭에 맞춘 예제. 세로로 넘치면 축소하지 않고 스크롤(읽기 우선). */}
      <div
        ref={stageRef}
        className={`relative flex flex-1 justify-center overflow-y-auto overflow-x-hidden ${
          overflowsHeight ? 'items-start' : 'items-center'
        }`}
      >
        <div
          className="relative shrink-0"
          style={{ width: logicalWidth, height: logicalHeight, margin: `${MARGIN}px 0` }}
        >
          <iframe
            ref={iframeRef}
            srcDoc={srcDoc}
            sandbox="allow-scripts allow-same-origin"
            title={`${title} 예제 병기`}
            scrolling="no"
            // 로드 완료 시점에 언어 목록을 다시 요청하고 현재 선택을 재전송한다 — 초기 보고가 리스너보다
            // 먼저 나가는 경합, 그리고 html 핫리로드로 iframe이 다시 뜰 때의 상태 유실을 함께 막는다.
            onLoad={() => {
              const win = iframeRef.current?.contentWindow;
              if (!win) return;
              win.postMessage({ type: 'dsr-annot-report' }, '*');
              win.postMessage({ type: 'dsr-annot-set', langs: selected }, '*');
            }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: logicalWidth || '100%',
              height: measured ? contentHeight : availH || '100%',
              border: 'none',
              background: '#fff',
              borderRadius: 14,
            }}
          />
        </div>
      </div>
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
