import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { History, Keyboard, MessageCircle, Send, X } from 'lucide-react';
import {
  db,
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import type { StudentVoiceMessage, TeacherBroadcastMessage } from '../types';
import { TEACHER_BROADCAST_MESSAGES_COLLECTION } from '../utils/classroomDomain';
import { VOICE_LANG_OPTIONS } from './StudentVoiceButton';
import { BROADCAST_TARGET_CODES } from './TeacherBroadcastButton';
import { normalizeBroadcastDoc } from './StudentSubtitleOverlay';
import { translateFromKorean } from '../utils/translateFromKorean';
import { LinkifiedText, containsUrl } from './LinkifiedText';

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

// 학생 메시지(음성·타이핑)와 교사가 보낸 채팅을 한 스레드로 섞어 그리기 위한 항목.
type ThreadEntry =
  | { side: 'student'; key: string; createdAt: string; student: StudentVoiceMessage }
  | { side: 'teacher'; key: string; createdAt: string; teacher: TeacherBroadcastMessage };

export interface TeacherVoiceChatProps {
  messages: StudentVoiceMessage[];
  activeClassroomId?: string;
  activeClassroomName?: string;
  /** 오늘 날짜('YYYY-MM-DD', 로컬) — 교사 채팅 구독·전송에 쓴다. 학생 쪽 날짜 규칙과 동일해야 한다. */
  date: string;
}

export const TeacherVoiceChat: React.FC<TeacherVoiceChatProps> = ({
  messages,
  activeClassroomId,
  activeClassroomName,
  date,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  // 기본은 '새 메시지'만 보여주고, 헤더의 시계(히스토리) 버튼으로 오늘 전체를 오간다.
  const [view, setView] = useState<'new' | 'history'>('new');
  // 마지막으로 확인한 메시지의 createdAt. 이보다 뒤에 온 메시지 수 = 안읽음.
  // localStorage에서 초기화해 새로고침해도 "봤음" 상태가 유지된다.
  const [seenAt, setSeenAt] = useState<string>(() => readSeenAt());
  // 내가(교사가) 오늘 보낸 채팅 — 학생 메시지와 한 스레드로 섞어 보여준다.
  const [teacherChats, setTeacherChats] = useState<TeacherBroadcastMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  // 패널을 '이번에 연 시점'의 seenAt 기준선. 열려 있는 동안 seenAt이 최신으로 갱신돼도
  // 이 기준선보다 뒤에 온 메시지는 계속 '새 메시지'로 보인다(열자마자 목록이 비는 것 방지).
  const openBaselineRef = useRef<string>('');
  const listRef = useRef<HTMLDivElement | null>(null);

  // 교사 채팅 구독 — 자막 방송과 같은 컬렉션에서 kind 'chat'만 골라낸다.
  // 등호 필터 1개뿐이라 복합 색인 없이 동작한다(자막 오버레이와 동일 규칙, kind 분리는 클라이언트에서).
  useEffect(() => {
    const chatQuery = query(
      collection(db, TEACHER_BROADCAST_MESSAGES_COLLECTION),
      where('date', '==', date)
    );
    const unsubscribe = onSnapshot(
      chatQuery,
      (snapshot) => {
        const chats = snapshot.docs
          .map((docSnap) =>
            normalizeBroadcastDoc(docSnap.id, docSnap.data() as Partial<TeacherBroadcastMessage>)
          )
          .filter((message) => message.kind === 'chat');
        setTeacherChats(chats);
      },
      (error) =>
        handleFirestoreError(error, OperationType.LIST, TEACHER_BROADCAST_MESSAGES_COLLECTION)
    );
    return () => unsubscribe();
  }, [date]);

  // 오래된→최신 정렬(학생 메시지만) — 안읽음 뱃지·'봤음' 기준선 계산용.
  const ordered = useMemo(() => {
    return [...messages].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [messages]);

  const total = ordered.length;
  // 정렬돼 있으므로 마지막이 가장 최신. ISO 문자열은 사전순=시간순이라 문자열 비교로 안전.
  const latestAt = total > 0 ? ordered[total - 1].createdAt : '';
  const unread = isOpen
    ? 0
    : ordered.reduce((n, m) => (m.createdAt > seenAt ? n + 1 : n), 0);

  // 학생 메시지 + 내 채팅을 시간순 한 스레드로 합친다.
  const thread = useMemo<ThreadEntry[]>(() => {
    const entries: ThreadEntry[] = [
      ...messages.map((message) => ({
        side: 'student' as const,
        key: `s_${message.id}`,
        createdAt: message.createdAt,
        student: message,
      })),
      ...teacherChats.map((message) => ({
        side: 'teacher' as const,
        key: `t_${message.id}`,
        createdAt: message.createdAt,
        teacher: message,
      })),
    ];
    return entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [messages, teacherChats]);

  // '새 메시지' 뷰 = 이번에 열었을 때 기준선(openBaseline) 이후 도착분만. 히스토리 뷰 = 오늘 전체.
  const visibleEntries =
    view === 'history'
      ? thread
      : thread.filter((entry) => entry.createdAt > openBaselineRef.current);

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
  }, [visibleEntries.length, view, isOpen]);

  // 채팅 전송 — 오늘 학생 화면 전체로 나간다(자막 방송과 같은 날짜 단위 전달, 반 정보는 메타데이터).
  // 학생 채팅 패널이 자기 언어 병기로 보여줄 수 있게 자막과 같은 대상으로 번역해 담는다.
  const handleSendChat = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const text = draft.trim();
      if (!text || sending) return;
      setSending(true);
      try {
        // URL이 든 메시지는 번역하지 않는다 — 기계번역이 주소를 변형해 링크가 깨질 수 있다.
        const translations = containsUrl(text)
          ? {}
          : await translateFromKorean(text, BROADCAST_TARGET_CODES);
        await addDoc(collection(db, TEACHER_BROADCAST_MESSAGES_COLLECTION), {
          classroomId: activeClassroomId ?? '',
          classroomName: activeClassroomName ?? '',
          date,
          koreanText: text,
          translations,
          kind: 'chat',
          createdAt: new Date().toISOString(),
        });
        setDraft('');
      } catch (error) {
        try {
          handleFirestoreError(error, OperationType.CREATE, TEACHER_BROADCAST_MESSAGES_COLLECTION);
        } catch {
          /* 전송 실패 — 입력을 남겨 다시 보낼 수 있게 한다 */
        }
      } finally {
        setSending(false);
      }
    },
    [draft, sending, activeClassroomId, activeClassroomName, date]
  );

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
          aria-label="수업 채팅 열기"
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
            {view === 'history' ? '수업 채팅 · 오늘 전체' : '수업 채팅 · 새 메시지'}
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

      <div ref={listRef} className="flex max-h-[55vh] flex-col gap-2 overflow-y-auto p-3">
        {visibleEntries.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#A89F94]">
            {view === 'history' ? (
              '아직 주고받은 메시지가 없어요.'
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
            {visibleEntries.map((entry) => {
              if (entry.side === 'teacher') {
                const message = entry.teacher;
                return (
                  <motion.div
                    key={entry.key}
                    layout
                    initial={{ opacity: 0, scale: 0.96, y: 6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.18 }}
                    className="max-w-[85%] self-end rounded-xl rounded-br-sm bg-[#8B5E3C] px-3 py-2 text-white"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[10px] font-semibold text-white/70">나 → 학생 화면</span>
                      <span className="shrink-0 text-[10px] text-white/50">
                        {formatTime(message.createdAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 break-words text-sm font-semibold leading-snug" dir="auto">
                      <LinkifiedText
                        text={message.koreanText}
                        linkClassName="break-all font-semibold text-[#FFD9A8] underline underline-offset-2"
                      />
                    </p>
                  </motion.div>
                );
              }

              const message = entry.student;
              const highlighted =
                Boolean(activeClassroomId) && message.classroomId === activeClassroomId;
              const isTyped = message.kind === 'text';
              // 타이핑 메시지는 원문=한국어인 경우가 대부분(한국어 입력·URL) — 같은 글을 두 줄로 겹쳐 보이지 않게 한다.
              const showSourceLine = message.sourceText.trim() !== message.koreanText.trim();
              return (
                <motion.div
                  key={entry.key}
                  layout
                  initial={{ opacity: 0, scale: 0.96, y: 6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.18 }}
                  className={`max-w-[85%] self-start rounded-xl rounded-bl-sm px-3 py-2 ring-1 ${
                    highlighted
                      ? 'bg-[#FFF5E9] ring-[#EADBC8]'
                      : 'bg-[#FBFBFA] ring-[#EFEDE7]'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    {showSourceLine ? (
                      <span className="truncate text-xs text-[#A89F94]" dir="auto">
                        {message.sourceText}
                      </span>
                    ) : (
                      <span />
                    )}
                    <span className="shrink-0 text-[10px] text-[#C4BBB0]">
                      {formatTime(message.createdAt)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#F3F2EE] px-1.5 py-0.5 text-[10px] font-semibold text-[#8B7E74]">
                      {isTyped ? (
                        <>
                          <Keyboard className="h-3 w-3" /> 입력
                        </>
                      ) : (
                        <>({labelForSourceLang(message.sourceLang)})</>
                      )}
                    </span>
                    {message.classroomName && (
                      <span className="truncate text-[10px] text-[#B7AEA3]">
                        {message.classroomName}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 break-words text-sm font-bold leading-snug text-[#4A3728]" dir="auto">
                    <LinkifiedText text={message.koreanText} />
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

      {/* 학생 화면으로 보내는 채팅 입력 — 링크(제출 폼·자료 등)를 붙여 넣으면 학생 채팅 패널에서 바로 클릭해 열 수 있다. */}
      <form onSubmit={handleSendChat} className="flex items-center gap-2 border-t border-[#F0EDE7] p-2">
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="학생 화면으로 보내기 (링크 가능)"
          maxLength={2000}
          className="min-w-0 flex-1 rounded-xl bg-[#F7F5F1] px-3 py-2 text-sm text-[#4A3728] outline-none ring-1 ring-transparent placeholder:text-[#C4BBB0] focus:ring-[#EADBC8]"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          aria-label="학생 화면으로 보내기"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#8B5E3C] text-white transition-opacity disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
};
