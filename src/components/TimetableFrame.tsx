import React from 'react';
import { ExternalLink } from 'lucide-react';
import { CALENDAR_SITE_URL } from '../utils/appPaths';

/**
 * 참고 시간표(calendar.damuna.org)를 앱 안에서 iframe으로 띄우는 화면.
 * 사이드바 "시간표" 탭에서 바로 연다. iframe이 막히면(헤더 차단) 새 탭 링크로 폴백.
 */
export const TimetableFrame: React.FC = () => {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-[#E5E3DD] bg-[#FBFBFA] px-6 py-3">
        <div>
          <h2 className="text-sm font-bold text-[#4A3728]">참고 시간표</h2>
          <p className="text-xs text-[#8B7E74]">calendar.damuna.org — 여기에서 바로 편집합니다.</p>
        </div>
        <a
          href={CALENDAR_SITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[#E5E3DD] bg-white px-3 py-1.5 text-xs font-bold text-[#8B5E3C] transition-all hover:border-[#8B5E3C] hover:bg-[#FFF5E9]"
        >
          <ExternalLink size={14} />
          새 탭에서 열기
        </a>
      </div>
      <iframe
        src={CALENDAR_SITE_URL}
        title="참고 시간표"
        className="min-h-0 w-full flex-1 border-0 bg-white"
      />
    </div>
  );
};
