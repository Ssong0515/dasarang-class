import React from 'react';
import { AlertCircle } from 'lucide-react';

/**
 * 작은 "!" 아이콘. 호버/포커스 시 설명을 말풍선으로 띄운다.
 * 화면마다 길게 깔려 있던 설명 문단을 접어 공간을 아끼는 용도.
 * 제목 옆에 inline으로 둘 수 있도록 span 기반으로 만든다.
 */
export const InfoTooltip: React.FC<{ content: string; label?: string }> = ({
  content,
  label = '설명 보기',
}) => (
  <span className="group/info relative inline-flex shrink-0 items-center align-middle">
    <button
      type="button"
      aria-label={label}
      className="flex h-5 w-5 items-center justify-center rounded-full border border-[#E5E3DD] bg-[#FBFBFA] text-[#8B7E74] transition-all hover:border-[#D8D2C8] hover:bg-white hover:text-[#4A3728] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EBD9C1]"
    >
      <AlertCircle size={13} />
    </button>
    <span
      role="tooltip"
      className="pointer-events-none absolute left-0 top-full z-30 mt-2 w-72 max-w-[80vw] -translate-y-1 whitespace-pre-wrap rounded-2xl bg-[#4A3728] px-4 py-3 text-xs font-normal leading-relaxed text-white opacity-0 shadow-xl transition-all duration-150 group-hover/info:translate-y-0 group-hover/info:opacity-100 group-focus-within/info:translate-y-0 group-focus-within/info:opacity-100"
    >
      {content}
    </span>
  </span>
);
