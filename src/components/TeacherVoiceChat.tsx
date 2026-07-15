import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { History, MessageCircle, X } from 'lucide-react';
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

// 마지막으로 확인한 메시지의 createdAt(ISO)을 저장한다. 새로고침/재접속해도 "봤음" 상태가 유지돼
// 이미 확인한 오늘치 메시지가 안읽음 뱃지로 다시 뜨지 않는다. (SSR/차단 환경 안전)
const VOICE_CHAT_SEEN_KEY = 'dsr_voice_chat_seen_at';

// 채팅 오버레이의 z-계층. 실습 미리보기 모달(z-[100])·예제 '번역 병기' 창 전체화면 오버레이(z-[9999]) 위에 뜬다 —
// 실습 수업 중 학생 질문을 확인하려고 그 창들을 내리지 않아도, 어느 창 위에서든 우하단에 독립적으로 떠 있어야 한다(사용자 요청).
// 교사 전용이라(App: user && isAdmin) 학생 페이지의 언어 FAB(z-[10010])와는 절대 동시에 렌더되지 않는다
// — StudentVoiceButton·자막은 !isAdmin에서만 뜨므로 그 계층과 충돌하지 않는다.
const CHAT_OVERLAY_WRAPPER = 'fixed bottom-4 right-4 z-[10050]';

const readSeenAt = (): string => {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(VOICE_CHAT_SEEN_KEY) ?? '';
  } catch {
    return '';
  }
};

const writeSeenAt = (iso: string): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(VOICE_CHAT_SEEN_KEY, iso);
  } catch {
    /* 무시 */
  }
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
  // 기본은 '새 메시지'만 보여주고, 헤더의 시계(히스토리) 버튼으로 오늘 전체를 오간다.
  const [view, setView] = useState<'new' | 'history'>('new');
  // 마지막으로 확인한 메시지의 createdAt. 이보다 뒤에 온 메시지 수 = 안읽음.
  // localStorage에서 초기화해 새로고침해도 "봤음" 상태가 유지된다.
  const [seenAt, setSeenAt] = useState<string>(() => readSeenAt());
  // 패널을 '이번에 연 시점'의 seenAt 기준선. 열려 있는 동안 seenAt이 최신으로 갱신돼도
  // 이 기준선보다 뒤에 온 메시지는 계속 '새 메시지'로 보인다(열자마자 목록이 비는 것 방지).
  const openBaselineRef = useRef<string>('');
  const listRef = useRef<HTMLDivElement | null>(null);

  // 오래된→최신 정렬. activeClassroomId가 있으면 해당 반을 뒤(가까운 곳)로 안정 정렬해 살짝 강조하되 전부 보여준다.
  const ordered = useMemo(() => {
    const sorted = [...messages].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    return sorted;
  }, [messages]);

  const total = ordered.length;
  // 정렬돼 있으므로 마지막이 가장 최신. ISO 문자열은 사전순=시간순이라 문자열 비교로 안전.
  const latestAt = total > 0 ? ordered[total - 1].createdAt : '';
  const unread = isOpen
    ? 0
    : ordered.reduce((n, m) => (m.createdAt > seenAt ? n + 1 : n), 0);

  // '새 메시지' 뷰 = 이번에 열었을 때 기준선(openBaseline) 이후 도착분만. 히스토리 뷰 = 오늘 전체.
  const visibleMessages =
    view === 'history'
      ? ordered
      : ordered.filter((message) => message.createdAt > openBaselineRef.current);

  // 열려 있으면 현재 최신까지 확인한 것으로 간주하고 영구 저장. (열려 있는 동안 새로 와도 계속 갱신)
  useEffect(() => {
    if (isOpen && latestAt && latestAt > seenAt) {
      setSeenAt(latestAt);
      writeSeenAt(latestAt);
    }
  }, [isOpen, latestAt, seenAt]);

  // 새 메시지 도착·뷰 전환 시 맨 아래로 자동 스크롤 (열려 있을 때).
  useEffect(() => {
    if (isOpen && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [visibleMessages.length, view, isOpen]);

  if (!isOpen) {
    return (
      <div className={CHAT_OVERLAY_WRAPPER}>
        <button
          type="button"
          onClick={() => {
            // 이번에 연 시점의 '봤음' 기준선을 고정 — 이보다 뒤에 온 것만 새 메시지로 보인다.
            openBaselineRef.current = seenAt;
            setView('new');
            setIsOpen(true);
          }}
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
    <div className={`${CHAT_OVERLAY_WRAPPER} flex w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-[#EADBC8]`}>
      <div className="flex items-center justify-between bg-[#8B5E3C] px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4" />
          <span className="text-sm font-semibold">
            {view === 'history' ? '학생 음성 · 오늘 전체' : '학생 음성 · 새 메시지'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setView((current) => (current === 'new' ? 'history' : 'new'))}
            aria-label={view === 'history' ? '새 메시지만 보기' : '오늘 전체 히스토리 보기'}
            aria-pressed={view === 'history'}
            title={view === 'history' ? '새 메시지만 보기' : '오늘 전체 히스토리 보기'}
            className={`rounded-lg p-1 transition-colors hover:bg-white/15 ${
              view === 'history' ? 'bg-white/25' : ''
            }`}
          >
            <History className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="닫기"
            className="rounded-lg p-1 transition-colors hover:bg-white/15"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div ref={listRef} className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto p-3">
        {visibleMessages.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#A89F94]">
            {view === 'history' ? (
              '아직 온 음성 메시지가 없어요.'
            ) : (
              <>
                새로 온 메시지가 없어요.
                <br />
                <span className="text-xs">
                  지난 메시지는 위의 <History className="inline h-3 w-3 align-[-1px]" /> 버튼으로 볼 수 있어요.
                </span>
              </>
            )}
          </p>
        ) : (
          <AnimatePresence initial={false}>
            {visibleMessages.map((message) => {
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
