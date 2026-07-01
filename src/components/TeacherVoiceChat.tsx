import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageCircle, X } from 'lucide-react';
import type { StudentVoiceMessage } from '../types';
import { VOICE_LANG_OPTIONS } from './StudentVoiceButton';

// STT BCP-47(sourceLang) → 자기 문자 표기 라벨. 없으면 원본 코드를 그대로 쓴다.
const labelForSourceLang = (sourceLang: string): string => {
  const byStt = VOICE_LANG_OPTIONS.find((option) => option.stt === sourceLang);
  if (byStt) return byStt.label;
  const base = sourceLang.split('-')[0];
  const byIso = VOICE_LANG_OPTIONS.find((option) => option.iso === base);
  return byIso?.label ?? sourceLang;
};

const formatTime = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

export interface TeacherVoiceChatProps {
  messages: StudentVoiceMessage[];
  activeClassroomId?: string;
}

export const TeacherVoiceChat: React.FC<TeacherVoiceChatProps> = ({
  messages,
  activeClassroomId,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  // 접혀 있는 동안 도착한 개수를 센다. 마지막으로 확인한 시점 이후 개수 = 안읽음.
  const [seenCount, setSeenCount] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  // 오래된→최신 정렬. activeClassroomId가 있으면 해당 반을 뒤(가까운 곳)로 안정 정렬해 살짝 강조하되 전부 보여준다.
  const ordered = useMemo(() => {
    const sorted = [...messages].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    return sorted;
  }, [messages]);

  const total = ordered.length;
  const unread = isOpen ? 0 : Math.max(0, total - seenCount);

  // 열려 있을 때는 항상 최신까지 읽은 것으로 간주.
  useEffect(() => {
    if (isOpen) setSeenCount(total);
  }, [isOpen, total]);

  // 새 메시지 도착 시 맨 아래로 자동 스크롤 (열려 있을 때).
  useEffect(() => {
    if (isOpen && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [total, isOpen]);

  if (!isOpen) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="학생 음성 채팅 열기"
          className="relative flex h-14 w-14 items-center justify-center rounded-full bg-[#8B5E3C] text-white shadow-lg transition-transform hover:scale-105"
        >
          <MessageCircle className="h-6 w-6" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white shadow">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-[#EADBC8]">
      <div className="flex items-center justify-between bg-[#8B5E3C] px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4" />
          <span className="text-sm font-semibold">학생 음성 · 오늘</span>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          aria-label="닫기"
          className="rounded-lg p-1 transition-colors hover:bg-white/15"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div ref={listRef} className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto p-3">
        {ordered.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#A89F94]">
            아직 온 음성 메시지가 없어요.
          </p>
        ) : (
          <AnimatePresence initial={false}>
            {ordered.map((message) => {
              const highlighted =
                Boolean(activeClassroomId) && message.classroomId === activeClassroomId;
              return (
                <motion.div
                  key={message.id}
                  layout
                  initial={{ opacity: 0, scale: 0.96, y: 6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.18 }}
                  className={`rounded-xl px-3 py-2 ring-1 ${
                    highlighted
                      ? 'bg-[#FFF5E9] ring-[#EADBC8]'
                      : 'bg-[#FBFBFA] ring-[#EFEDE7]'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-xs text-[#A89F94]" dir="auto">
                      {message.sourceText}
                    </span>
                    <span className="shrink-0 text-[10px] text-[#C4BBB0]">
                      {formatTime(message.createdAt)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="shrink-0 rounded-full bg-[#F3F2EE] px-1.5 py-0.5 text-[10px] font-semibold text-[#8B7E74]">
                      ({labelForSourceLang(message.sourceLang)})
                    </span>
                    {message.classroomName && (
                      <span className="truncate text-[10px] text-[#B7AEA3]">
                        {message.classroomName}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm font-bold leading-snug text-[#4A3728]">
                    {message.koreanText}
                  </p>
                  {message.translationOk === false && (
                    <p className="mt-0.5 text-[10px] text-[#C08A5A]">(번역 불가 — 원문)</p>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};
