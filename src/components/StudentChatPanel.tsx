import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
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
import type { TeacherBroadcastMessage } from '../types';
import {
  STUDENT_VOICE_MESSAGES_COLLECTION,
  TEACHER_BROADCAST_MESSAGES_COLLECTION,
} from '../utils/classroomDomain';
import { translateToKorean } from '../utils/translateToKorean';
import { VOICE_LANG_OPTIONS, VOICE_LANG_CHANGED_EVENT } from './StudentVoiceButton';
import { normalizeBroadcastDoc } from './StudentSubtitleOverlay';
import { LinkifiedText, containsUrl } from './LinkifiedText';

// 학생 ↔ 교사 텍스트 채팅 FAB + 패널.
// - 받기: 교사가 채팅 입력창으로 보낸 메시지(teacherBroadcastMessages, kind 'chat')를 영구 목록으로 보여준다.
//   자막 방송과 달리 사라지지 않고, 링크가 클릭 가능해 교사가 준 주소로 바로 들어갈 수 있다.
// - 보내기: 타이핑한 메시지를 studentVoiceMessages(kind 'text')로 저장 — 음성 메시지와 같은 권한 모델이라
//   교사만 읽는다(같은 반 학생끼리는 서로 안 보임). 제출 링크를 붙여 넣는 용도.
// - 내가 보낸 메시지는 서버에서 되읽을 수 없으므로(학생은 읽기 권한 없음) 오늘치만 localStorage에 남겨 보여준다.

// StudentVoiceButton과 같은 키 — 학생이 우하단 언어 버튼으로 고른 언어를 그대로 따른다.
const VOICE_LANG_STORAGE_KEY = 'dsr_voice_lang';
// 교사 채팅을 마지막으로 확인한 시각(ISO) — 새로고침해도 안읽음 뱃지가 되살아나지 않게 저장.
const STUDENT_CHAT_SEEN_KEY = 'dsr_student_chat_seen_at';
// 내가 보낸 메시지의 로컬 보관(오늘치만). 공용 기기라도 같은 반 공용 계정이라 노출 문제는 없다.
const STUDENT_CHAT_SENT_KEY = 'dsr_student_chat_sent';
const MAX_STORED_SENT = 100;

// 언어·마이크 FAB(z-[10010], bottom-4 right-4)와 같은 계층의 왼쪽 옆자리. 자막(z-[10005])·창 전체화면(z-[9999])보다
// 위 — 어떤 화면 상태에서도 학생이 교사가 보낸 링크를 열 수 있어야 한다. 언어 피커·말풍선은 언어 FAB '위로'
// 펼쳐지므로 같은 줄 왼쪽에 두면 서로 가리지 않는다. (우하단 FAB 한 줄: [채팅] [언어/마이크])
const CHAT_WRAPPER_CLASS = 'fixed bottom-4 right-24 z-[10010]';

const formatTime = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

// 학생이 고른 언어(iso) 읽기 — StudentSubtitleOverlay와 같은 방식으로 localStorage를 직접 읽는다.
const readStoredIso = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(VOICE_LANG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { iso?: unknown };
    return typeof parsed?.iso === 'string' && parsed.iso ? parsed.iso : null;
  } catch {
    return null;
  }
};

const readSeenAt = (): string => {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(STUDENT_CHAT_SEEN_KEY) ?? '';
  } catch {
    return '';
  }
};

const writeSeenAt = (iso: string): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STUDENT_CHAT_SEEN_KEY, iso);
  } catch {
    /* 무시 */
  }
};

interface SentChatItem {
  text: string;
  createdAt: string; // ISO
}

const readStoredSent = (date: string): SentChatItem[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STUDENT_CHAT_SENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { date?: unknown; items?: unknown };
    if (parsed?.date !== date || !Array.isArray(parsed.items)) return [];
    return (parsed.items as Partial<SentChatItem>[]).filter(
      (item): item is SentChatItem =>
        Boolean(item) && typeof item.text === 'string' && typeof item.createdAt === 'string'
    );
  } catch {
    return [];
  }
};

const writeStoredSent = (date: string, items: SentChatItem[]): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STUDENT_CHAT_SENT_KEY, JSON.stringify({ date, items }));
  } catch {
    /* 무시 */
  }
};

type ChatEntry =
  | { side: 'teacher'; key: string; createdAt: string; teacher: TeacherBroadcastMessage }
  | { side: 'me'; key: string; createdAt: string; text: string };

export interface StudentChatPanelProps {
  classroomId?: string;
  classroomName?: string;
  date: string;
}

export const StudentChatPanel: React.FC<StudentChatPanelProps> = ({
  classroomId,
  classroomName,
  date,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [teacherMessages, setTeacherMessages] = useState<TeacherBroadcastMessage[]>([]);
  const [sent, setSent] = useState<SentChatItem[]>(() => readStoredSent(date));
  const [seenAt, setSeenAt] = useState<string>(() => readSeenAt());
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  // 언어 버튼(StudentVoiceButton)에서 고른 언어 — 교사 메시지를 그 언어 병기로 보여준다.
  const [langIso, setLangIso] = useState<string | null>(() => readStoredIso());
  const listRef = useRef<HTMLDivElement | null>(null);

  // 교사 채팅 구독 — 자막 방송과 같은 컬렉션에서 kind 'chat'만. 날짜 등호 필터 1개라 복합 색인 불필요.
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
        setTeacherMessages(chats);
      },
      (error) =>
        handleFirestoreError(error, OperationType.LIST, TEACHER_BROADCAST_MESSAGES_COLLECTION)
    );
    return () => unsubscribe();
  }, [date]);

  // 날짜가 바뀌면(자정 넘김 등) 어제 보낸 메시지는 버린다.
  useEffect(() => {
    setSent(readStoredSent(date));
  }, [date]);

  // 언어 버튼으로 언어를 바꾸면 떠 있는 교사 메시지 병기도 즉시 따라간다(자막 오버레이와 같은 감각).
  useEffect(() => {
    const handleLangChanged = () => setLangIso(readStoredIso());
    window.addEventListener(VOICE_LANG_CHANGED_EVENT, handleLangChanged);
    return () => window.removeEventListener(VOICE_LANG_CHANGED_EVENT, handleLangChanged);
  }, []);

  // 교사 메시지 + 내가 보낸 메시지를 시간순 한 스레드로 합친다.
  const thread = useMemo<ChatEntry[]>(() => {
    const entries: ChatEntry[] = [
      ...teacherMessages.map((message) => ({
        side: 'teacher' as const,
        key: `t_${message.id}`,
        createdAt: message.createdAt,
        teacher: message,
      })),
      ...sent.map((item, index) => ({
        side: 'me' as const,
        key: `m_${item.createdAt}_${index}`,
        createdAt: item.createdAt,
        text: item.text,
      })),
    ];
    return entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [teacherMessages, sent]);

  // 안읽음 = 마지막으로 확인한 시각 이후에 온 교사 메시지 수. ISO 문자열은 사전순=시간순.
  const latestTeacherAt = teacherMessages.reduce(
    (latest, message) => (message.createdAt > latest ? message.createdAt : latest),
    ''
  );
  const unread = isOpen
    ? 0
    : teacherMessages.reduce((n, m) => (m.createdAt > seenAt ? n + 1 : n), 0);

  // 열려 있는 동안은 최신까지 확인한 것으로 간주하고 영구 저장.
  useEffect(() => {
    if (isOpen && latestTeacherAt && latestTeacherAt > seenAt) {
      setSeenAt(latestTeacherAt);
      writeSeenAt(latestTeacherAt);
    }
  }, [isOpen, latestTeacherAt, seenAt]);

  // 새 메시지 도착·열기 시 맨 아래로 자동 스크롤.
  useEffect(() => {
    if (isOpen && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [thread.length, isOpen]);

  const handleSend = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const text = draft.trim();
      if (!text || sending) return;
      setSending(true);

      // 외국어를 고른 학생의 타이핑은 음성 메시지처럼 한국어로 번역해 교사에게 보여준다.
      // 단 URL이 든 메시지는 번역하지 않는다 — 기계번역이 주소를 변형해 링크가 깨질 수 있다.
      const voiceLang = VOICE_LANG_OPTIONS.find((option) => option.iso === langIso);
      const createdAt = new Date().toISOString();
      try {
        const { koreanText, ok } =
          voiceLang && !containsUrl(text)
            ? await translateToKorean(text, voiceLang.iso)
            : { koreanText: text, ok: true };
        await addDoc(collection(db, STUDENT_VOICE_MESSAGES_COLLECTION), {
          classroomId: classroomId ?? '',
          classroomName: classroomName ?? '',
          date,
          sourceLang: voiceLang?.stt ?? 'ko-KR',
          sourceText: text,
          koreanText,
          translationOk: ok,
          kind: 'text',
          createdAt,
        });
        setSent((prev) => {
          const next = [...prev, { text, createdAt }].slice(-MAX_STORED_SENT);
          writeStoredSent(date, next);
          return next;
        });
        setDraft('');
      } catch (error) {
        try {
          handleFirestoreError(error, OperationType.CREATE, STUDENT_VOICE_MESSAGES_COLLECTION);
        } catch {
          /* 전송 실패 — 입력을 남겨 다시 보낼 수 있게 한다 */
        }
      } finally {
        setSending(false);
      }
    },
    [draft, sending, langIso, classroomId, classroomName, date]
  );

  if (!isOpen) {
    return (
      <div className={CHAT_WRAPPER_CLASS}>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="선생님과 채팅 열기 · Chat"
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
    <div
      className={`${CHAT_WRAPPER_CLASS} flex w-80 max-w-[calc(100vw-7rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-[#EADBC8]`}
    >
      <div className="flex items-center justify-between bg-[#8B5E3C] px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4" />
          <span className="text-sm font-semibold">선생님 · Chat</span>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          aria-label="닫기 · Close"
          className="rounded-lg p-1 transition-colors hover:bg-white/15"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div ref={listRef} className="flex max-h-[55vh] min-h-[140px] flex-col gap-2 overflow-y-auto p-3">
        {thread.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#A89F94]">
            아직 메시지가 없어요.
            <br />
            <span className="text-xs">No messages yet.</span>
          </p>
        ) : (
          thread.map((entry) => {
            if (entry.side === 'me') {
              return (
                <div
                  key={entry.key}
                  className="max-w-[85%] self-end rounded-xl rounded-br-sm bg-[#8B5E3C] px-3 py-2 text-white"
                >
                  <p className="break-words text-sm leading-snug" dir="auto">
                    <LinkifiedText
                      text={entry.text}
                      linkClassName="break-all font-semibold text-[#FFD9A8] underline underline-offset-2"
                    />
                  </p>
                  <p className="mt-0.5 text-right text-[10px] text-white/50">
                    {formatTime(entry.createdAt)}
                  </p>
                </div>
              );
            }

            const message = entry.teacher;
            const korean = message.koreanText.trim();
            // 자막 오버레이와 같은 병기 규칙: 내 언어 번역이 있으면 번역을 크게 + 한국어 원문을 함께(한국어 노출이 곧 학습).
            const translatedRaw = langIso ? message.translations?.[langIso] : undefined;
            const translated = typeof translatedRaw === 'string' ? translatedRaw.trim() : '';
            const primary = translated && translated !== korean ? translated : korean;
            const showKorean = primary !== korean;
            return (
              <div
                key={entry.key}
                className="max-w-[85%] self-start rounded-xl rounded-bl-sm bg-[#FFF5E9] px-3 py-2 ring-1 ring-[#EADBC8]"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[10px] font-semibold text-[#B08968]">선생님 · Teacher</span>
                  <span className="shrink-0 text-[10px] text-[#C4BBB0]">
                    {formatTime(message.createdAt)}
                  </span>
                </div>
                <p className="mt-1 break-words text-sm font-bold leading-snug text-[#4A3728]" dir="auto">
                  <LinkifiedText text={primary} />
                </p>
                {showKorean && (
                  <p
                    lang="ko"
                    className="mt-1 break-words border-t border-[#EADBC8] pt-1 text-xs text-[#8B7E74]"
                  >
                    🇰🇷 <LinkifiedText text={korean} />
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 선생님에게 보내기 — 제출 링크 등을 붙여 넣는다. 교사만 읽는다(같은 반 친구에게는 안 보임). */}
      <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-[#F0EDE7] p-2">
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="메시지 · Message"
          maxLength={2000}
          dir="auto"
          className="min-w-0 flex-1 rounded-xl bg-[#F7F5F1] px-3 py-2 text-sm text-[#4A3728] outline-none ring-1 ring-transparent placeholder:text-[#C4BBB0] focus:ring-[#EADBC8]"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          aria-label="보내기 · Send"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#8B5E3C] text-white transition-opacity disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
};
