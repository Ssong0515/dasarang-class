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

// 이 학생에게 보여줄 자막 텍스트: 자기 언어 번역이 있으면 그걸, 없으면(언어 미선택·이 메시지에 내 언어 없음) 한국어 원문으로 폴백.
const pickSubtitle = (message: TeacherBroadcastMessage): string | null => {
  const iso = readStoredIso();
  if (iso) {
    const translated = message.translations?.[iso];
    if (typeof translated === 'string' && translated.trim()) return translated.trim();
  }
  return message.koreanText?.trim() ? message.koreanText.trim() : null;
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
  const [current, setCurrent] = useState<{ id: string; text: string } | null>(null);
  const [visible, setVisible] = useState(false);
  const lastSeenIdRef = useRef<string | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

        const text = pickSubtitle(newest);
        if (!text) return;

        setCurrent({ id: newest.id, text });
        setVisible(true);
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(() => setVisible(false), subtitleDurationMs(text));
      },
      (error) =>
        handleFirestoreError(error, OperationType.LIST, TEACHER_BROADCAST_MESSAGES_COLLECTION)
    );

    return () => {
      unsubscribe();
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [date]);

  // 상단 중앙에 띄운다 — 학생이 보는 실습 콘텐츠는 화면 중앙~하단이라 위쪽이 가장 덜 가린다.
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-40 flex justify-center px-4">
      <AnimatePresence>
        {visible && current && (
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="max-w-3xl rounded-2xl bg-black/75 px-5 py-3 text-center text-base font-bold leading-snug text-white shadow-2xl sm:text-xl"
            dir="auto"
          >
            {current.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
