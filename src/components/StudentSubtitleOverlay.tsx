import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  db,
  collection,
  query,
  where,
  onSnapshot,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import type { TeacherBroadcastMessage } from '../types';
import { TEACHER_BROADCAST_MESSAGES_COLLECTION } from '../utils/classroomDomain';
import { SUBTITLE_OFF_OPTION, VOICE_LANG_CHANGED_EVENT } from './StudentVoiceButton';

// 학생이 StudentVoiceButton에서 고른 언어(iso)를 읽는 곳 — 같은 localStorage 키를 공유한다.
const VOICE_LANG_STORAGE_KEY = 'dsr_voice_lang';
// 페이지를 뒤늦게 연 학생에게 과거 방송이 한꺼번에 뜨지 않도록, '방금(이 시간 안에) 온' 메시지만 자막으로 띄운다.
const SUBTITLE_FRESH_WINDOW_MS = 20 * 1000;

// 자막을 얼마나 오래 보여줄지 — 길이에 비례하되 6~12초로 제한.
const subtitleDurationMs = (text: string) => Math.min(12000, Math.max(6000, text.length * 120));

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

// 이 학생에게 보여줄 자막. 자기 언어 번역이 있으면 번역(primary) + 한국어 원문(korean)을 병기한다 —
// 한국어 노출이 곧 학습이라 원문을 숨기지 않는다. 번역이 없거나(언어 미선택·한국어 선택·이 메시지에 내 언어 없음)
// 번역이 원문과 같으면(번역 실패 폴백) 한국어만 한 줄로 보여준다.
// 단, '자막 끄기'(iso 'off')를 고른 학생에게만 아무 자막도 띄우지 않는다(null). 미선택·한국어는 한국어 자막이 뜬다.
interface SubtitleText {
  primary: string;
  korean: string | null; // primary가 번역일 때만 채워지는 한국어 원문 병기 줄
}

const pickSubtitle = (message: TeacherBroadcastMessage): SubtitleText | null => {
  const korean = message.koreanText?.trim() ?? '';
  const iso = readStoredIso();
  // '자막 끄기'를 고른 학생에게는 아무 자막도 띄우지 않는다.
  // (언어 미선택 iso=null·한국어 iso='ko'는 아래로 내려가 한국어 원문 자막을 그대로 보여준다.)
  if (iso === SUBTITLE_OFF_OPTION.iso) return null;
  const translated = iso ? message.translations?.[iso] : undefined;
  const translatedText = typeof translated === 'string' ? translated.trim() : '';

  if (translatedText && translatedText !== korean) {
    return { primary: translatedText, korean: korean || null };
  }
  return korean ? { primary: korean, korean: null } : null;
};

const normalizeBroadcastDoc = (id: string, data: Partial<TeacherBroadcastMessage>): TeacherBroadcastMessage => ({
  id,
  classroomId: typeof data.classroomId === 'string' ? data.classroomId : '',
  classroomName: typeof data.classroomName === 'string' ? data.classroomName : '',
  date: typeof data.date === 'string' ? data.date : '',
  koreanText: typeof data.koreanText === 'string' ? data.koreanText : '',
  translations:
    data.translations && typeof data.translations === 'object'
      ? (data.translations as Record<string, string>)
      : {},
  createdAt: typeof data.createdAt === 'string' ? data.createdAt : '',
});

export interface StudentSubtitleOverlayProps {
  date: string;
}

export const StudentSubtitleOverlay: React.FC<StudentSubtitleOverlayProps> = ({ date }) => {
  const [current, setCurrent] = useState<({ id: string } & SubtitleText) | null>(null);
  const [visible, setVisible] = useState(false);
  const lastSeenIdRef = useRef<string | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 지금 자막으로 띄운 방송 원본 — 학생이 언어를 바꾸면 이 메시지로 자막을 새 언어로 다시 그린다.
  const lastMessageRef = useRef<TeacherBroadcastMessage | null>(null);

  // 교사 방송 구독 — 오늘 날짜 전체. 반 선택·수업 공개 여부와 무관하게 강사가 켜면 바로 자막이 뜬다.
  // 등호 필터 1개뿐이라 복합 색인 없이 동작한다(정렬은 클라이언트에서).
  useEffect(() => {
    const broadcastQuery = query(
      collection(db, TEACHER_BROADCAST_MESSAGES_COLLECTION),
      where('date', '==', date)
    );

    const unsubscribe = onSnapshot(
      broadcastQuery,
      (snapshot) => {
        if (snapshot.empty) return;
        const messages = snapshot.docs.map((docSnap) =>
          normalizeBroadcastDoc(docSnap.id, docSnap.data() as Partial<TeacherBroadcastMessage>)
        );
        const newest = messages.reduce((latest, candidate) =>
          candidate.createdAt > latest.createdAt ? candidate : latest
        );

        // 같은 메시지를 다시 처리하지 않는다.
        if (newest.id === lastSeenIdRef.current) return;
        lastSeenIdRef.current = newest.id;

        // 페이지 로드 시 오래된 메시지가 되풀이되지 않도록 '방금 온' 것만 띄운다.
        const ageMs = Date.now() - new Date(newest.createdAt).getTime();
        if (!Number.isFinite(ageMs) || ageMs > SUBTITLE_FRESH_WINDOW_MS) return;

        const subtitle = pickSubtitle(newest);
        if (!subtitle) return;

        lastMessageRef.current = newest;
        setCurrent({ id: newest.id, ...subtitle });
        setVisible(true);
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        // 병기 시 한국어 원문까지 읽을 시간을 주기 위해 두 줄 길이를 합쳐 계산한다.
        hideTimerRef.current = setTimeout(
          () => setVisible(false),
          subtitleDurationMs(subtitle.primary + (subtitle.korean ?? ''))
        );
      },
      (error) =>
        handleFirestoreError(error, OperationType.LIST, TEACHER_BROADCAST_MESSAGES_COLLECTION)
    );

    return () => {
      unsubscribe();
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [date]);

  // 학생이 우하단 언어 버튼(StudentVoiceButton)으로 언어를 바꾸면, 지금 떠 있는 자막도 즉시 그 언어로 다시 그린다.
  // (다음 방송부터가 아니라 '지금' 바뀌어야 버튼 하나로 실습 번역·자막이 함께 따라온다는 감각이 생긴다.)
  // pickSubtitle이 localStorage에서 새 iso를 직접 읽으므로 이벤트 detail은 쓰지 않는다 —
  // chooseLang이 저장을 먼저 하고 이벤트를 쏘기 때문에 이 시점엔 항상 새 언어가 저장돼 있다.
  useEffect(() => {
    const handleLangChanged = () => {
      const message = lastMessageRef.current;
      if (!message) return;
      const subtitle = pickSubtitle(message);
      // '자막 끄기'로 바꾸면 이제 이 학생에겐 자막이 없다 — 지금 떠 있는 자막도 즉시 내린다.
      if (!subtitle) {
        setVisible(false);
        return;
      }
      // 표시 중인 그 자막일 때만 교체(id 동일 → 재애니메이션 없이 텍스트만 스왑). 숨김 타이머는 그대로 둔다.
      setCurrent((prev) => (prev && prev.id === message.id ? { id: message.id, ...subtitle } : prev));
    };
    window.addEventListener(VOICE_LANG_CHANGED_EVENT, handleLangChanged);
    return () => window.removeEventListener(VOICE_LANG_CHANGED_EVENT, handleLangChanged);
  }, []);

  // 상단 중앙에 띄운다 — 학생이 보는 실습 콘텐츠는 화면 중앙~하단이라 위쪽이 가장 덜 가린다.
  // z-[10005]: 헤더(z-50)·화면 공유(z-105)·수업 종료 안내(z-110)는 물론 슬라이드 '창 전체화면'(z-[9999],
  // 종료 버튼 z-[10000])보다도 위, FAB(z-[10010])보다는 아래 — 슬라이드를 전체화면으로 보는 중에도
  // 교사 자막이 보여야 한다(2026-07-07, 우하단 언어 버튼 하나로 자막·실습 번역을 함께 제어하는 개편과 함께 정리).
  // pointer-events-none이라 조작은 막지 않는다.
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[10005] flex justify-center px-4">
      <AnimatePresence>
        {visible && current && (
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="max-w-3xl rounded-2xl bg-black/90 px-5 py-3 text-center leading-snug text-white shadow-2xl"
          >
            <p className="text-base font-bold sm:text-xl" dir="auto">
              {current.primary}
            </p>
            {current.korean && (
              <p
                lang="ko"
                className="mt-1.5 border-t border-white/25 pt-1.5 text-sm font-medium text-white/85 sm:text-base"
              >
                🇰🇷 {current.korean}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
