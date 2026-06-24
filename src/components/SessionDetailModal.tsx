import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, FileText } from 'lucide-react';
import { CurriculumSession } from '../types';

interface SessionDetailModalProps {
  /** 표시할 회차. null이면 모달이 닫혀 있다. */
  session: CurriculumSession | null;
  onClose: () => void;
}

/**
 * 커리큘럼 회차의 details(상세 설명)를 읽기 전용으로 보여 주는 팝업.
 * 대시보드 커리큘럼 탭과 커리큘럼 관리 페이지에서 공용으로 쓴다.
 */
export const SessionDetailModal: React.FC<SessionDetailModalProps> = ({ session, onClose }) => {
  return (
    <AnimatePresence>
      {session && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div className="absolute inset-0 bg-black/30" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            className="relative flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-[32px] border border-[#E5E3DD] bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[#E5E3DD] px-7 py-5">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#8B5E3C]">
                  <FileText size={14} />
                  {session.order}회차 상세
                </div>
                <h2 className="mt-1 truncate text-lg font-bold text-[#4A3728]">
                  {session.topic || '주제 미정'}
                </h2>
              </div>
              <button
                onClick={onClose}
                aria-label="닫기"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#8B7E74] transition-all hover:bg-[#F3F2EE]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-7 py-6">
              {session.details?.trim() ? (
                <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-[#4A3728]">
                  {session.details}
                </pre>
              ) : (
                <p className="rounded-2xl border border-dashed border-[#E5E3DD] bg-[#FBFBFA] px-5 py-8 text-center text-sm text-[#8B7E74]">
                  이 회차에는 아직 상세 설명이 없습니다. (ChatGPT/Claude로 details를 채울 수 있어요)
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
