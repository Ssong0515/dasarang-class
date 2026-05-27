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
    return injectIframeMarkup(trimmedHtml, iframeResponsiveStyleTag, iframeHeightScriptTag);
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
