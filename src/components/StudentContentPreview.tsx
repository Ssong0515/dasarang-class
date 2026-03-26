import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, FileText } from 'lucide-react';
import { LessonContent } from '../types';

const iframeResponsiveStyleTag = `
  <style>
    :root {
      color-scheme: light;
    }

    html, body {
      margin: 0;
      width: 100%;
      max-width: none;
      overflow-x: hidden;
    }

    *, *::before, *::after {
      box-sizing: border-box;
    }

    img, video, iframe, canvas, svg {
      max-width: 100% !important;
      height: auto;
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
      var h = document.documentElement.scrollHeight;
      window.parent.postMessage({ type: 'iframe-height', height: h }, '*');
    }

    window.addEventListener('load', function () { setTimeout(sendHeight, 100); });
    new MutationObserver(sendHeight).observe(document.body, { childList: true, subtree: true, attributes: true });
    window.addEventListener('resize', sendHeight);
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
      style={autoHeight ? { border: 'none', overflow: 'hidden' } : { border: 'none' }}
      scrolling={autoHeight ? 'no' : undefined}
      sandbox="allow-scripts allow-same-origin"
      title={title}
      onLoad={autoHeight ? (event) => {
        const iframe = event.target as HTMLIFrameElement;
        try {
          const nextHeight = iframe.contentDocument?.documentElement.scrollHeight;
          if (nextHeight) {
            iframe.style.height = `${nextHeight}px`;
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
}

export const StudentContentCard: React.FC<StudentContentCardProps> = ({
  content,
  className = '',
  headerControls,
  details,
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

      {hasDescription ? (
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

      <StudentContentPreviewFrame
        html={content.html}
        title={content.title}
        className="w-full rounded-b-[32px]"
      />
    </section>
  );
};
