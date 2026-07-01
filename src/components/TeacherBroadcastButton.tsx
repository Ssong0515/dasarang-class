import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { db, collection, addDoc, handleFirestoreError, OperationType } from '../firebase';
import { TEACHER_BROADCAST_MESSAGES_COLLECTION } from '../utils/classroomDomain';
// LANG_MAX_AGE_MS(180분)는 학생 언어 세션 TTL과 반드시 같은 값이어야 하므로 StudentVoiceButton에서 import해 재사용한다(이중 정의 금지).
import { LANG_MAX_AGE_MS, VOICE_LANG_OPTIONS } from './StudentVoiceButton';
import { translateFromKorean } from '../utils/translateFromKorean';

// ─── SpeechRecognition 최소 타입 선언 (StudentVoiceButton과 동일하게 좁게 정의) ──────────
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
  isFinal: boolean;
  length: number;
}
interface SpeechRecognitionResultListLike {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}
interface SpeechRecognitionErrorEventLike {
  error?: string;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives?: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

const getSpeechRecognitionCtor = (): SpeechRecognitionCtor | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

const labelForIso = (iso: string): string =>
  VOICE_LANG_OPTIONS.find((option) => option.iso === iso)?.label ?? iso;

export interface TeacherBroadcastButtonProps {
  classroomId?: string;
  classroomName?: string;
  date: string;
  /** 지금 출석(결석/제외 아님)한 학생들의 언어 iso 코드. 방송 중 실시간으로 바뀌면 다음 발화부터 반영된다. */
  targetLangCodes: string[];
  endNoticeAt?: string | null;
}

type BroadcastNotice = { kind: 'error' | 'info'; text: string } | null;

export const TeacherBroadcastButton: React.FC<TeacherBroadcastButtonProps> = ({
  classroomId,
  classroomName,
  date,
  targetLangCodes,
  endNoticeAt,
}) => {
  const speechSupported = getSpeechRecognitionCtor() !== null;

  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [notice, setNotice] = useState<BroadcastNotice>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const isBroadcastingRef = useRef(false);
  const permissionDeniedRef = useRef(false);
  const startedAtRef = useRef(0);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startEndNoticeRef = useRef<string | null>(null);

  // onresult/onend 클로저가 항상 '최신' 값을 읽도록 ref에 보관(고정 스냅샷이 아니라 매번 최신값 참조).
  const ctxRef = useRef({ classroomId, classroomName, date });
  ctxRef.current = { classroomId, classroomName, date };
  const targetCodesRef = useRef(targetLangCodes);
  targetCodesRef.current = targetLangCodes;
  const latestEndNoticeRef = useRef<string | null>(endNoticeAt ?? null);
  latestEndNoticeRef.current = endNoticeAt ?? null;

  // 확정된(final) 한 마디를 그 시점 출석 언어로 번역해 Firestore에 새 문서로 추가한다.
  const sendBroadcast = useCallback(async (koreanText: string) => {
    const text = koreanText.trim();
    if (!text) return;
    const ctx = ctxRef.current;
    if (!ctx.classroomId) return;

    const translations = await translateFromKorean(text, targetCodesRef.current);
    try {
      await addDoc(collection(db, TEACHER_BROADCAST_MESSAGES_COLLECTION), {
        classroomId: ctx.classroomId,
        classroomName: ctx.classroomName ?? '',
        date: ctx.date,
        koreanText: text,
        translations,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, TEACHER_BROADCAST_MESSAGES_COLLECTION);
    }
  }, []);

  const stopBroadcast = useCallback((nextNotice: BroadcastNotice = null) => {
    isBroadcastingRef.current = false;
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onend = null; // 자동 재시작 막기
      recognition.onresult = null;
      recognition.onerror = null;
      try {
        recognition.stop();
      } catch {
        /* 무시 */
      }
      try {
        recognition.abort();
      } catch {
        /* 무시 */
      }
    }
    setIsBroadcasting(false);
    setInterimText('');
    setNotice(nextNotice);
  }, []);

  // SpeechRecognition 인스턴스를 새로 만들어 시작한다. onend에서 자기 자신을 호출해 자동 재시작한다.
  const beginRecognition = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    let recognition: SpeechRecognitionLike;
    try {
      recognition = new Ctor();
    } catch {
      return;
    }
    recognition.lang = 'ko-KR';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? '';
        if (result.isFinal) {
          const finalText = transcript.trim();
          if (finalText) void sendBroadcast(finalText);
        } else {
          interim += transcript;
        }
      }
      setInterimText(interim.trim());
    };

    recognition.onerror = (event) => {
      const code = typeof event?.error === 'string' ? event.error : '';
      // 권한 거부/서비스 불가는 재시작해도 소용없으니 방송을 끈다. 그 외(no-speech·network·aborted 등)는 onend에서 자동 재시작.
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        permissionDeniedRef.current = true;
        stopBroadcast({ kind: 'error', text: '마이크 권한이 필요해요. 브라우저에서 마이크를 허용해 주세요.' });
      }
    };

    recognition.onend = () => {
      // 사용자가 끈 게 아니고(=여전히 방송 중) 권한 문제도 아니면 자동 재시작.
      if (!isBroadcastingRef.current || permissionDeniedRef.current) return;
      // 최대 시간(180분) 초과 시엔 재시작하지 않고 자동 정지 안내.
      if (Date.now() - startedAtRef.current >= LANG_MAX_AGE_MS) {
        stopBroadcast({ kind: 'info', text: '3시간이 지나 통역 자막이 자동으로 꺼졌어요.' });
        return;
      }
      // Chrome은 무음이 길면(~60초) onend를 조용히 발생시킨다 → 계속 방송하려면 새 인스턴스로 다시 시작.
      beginRecognition();
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      // 이미 시작된 상태의 InvalidStateError 등은 무시(다음 onend 사이클에서 회복).
    }
  }, [sendBroadcast, stopBroadcast]);

  const startBroadcast = useCallback(() => {
    if (isBroadcastingRef.current) return;
    if (!getSpeechRecognitionCtor()) {
      setNotice({ kind: 'error', text: '이 브라우저에서는 음성 인식을 지원하지 않아요.' });
      return;
    }
    if (!ctxRef.current.classroomId) {
      setNotice({ kind: 'error', text: '먼저 반을 선택해 주세요.' });
      return;
    }

    permissionDeniedRef.current = false;
    isBroadcastingRef.current = true;
    startedAtRef.current = Date.now();
    startEndNoticeRef.current = latestEndNoticeRef.current; // 시작 시점의 endNoticeAt을 기준값으로 잡는다.
    setNotice(null);
    setInterimText('');
    setIsBroadcasting(true);

    // 최대 180분 자동 정지(무음으로 재시작이 반복돼도 총 경과 시간으로 끊는다).
    autoStopTimerRef.current = setTimeout(() => {
      stopBroadcast({ kind: 'info', text: '3시간이 지나 통역 자막이 자동으로 꺼졌어요.' });
    }, LANG_MAX_AGE_MS);

    beginRecognition();
  }, [beginRecognition, stopBroadcast]);

  const handleToggle = () => {
    if (isBroadcasting) {
      stopBroadcast(null);
    } else {
      startBroadcast();
    }
  };

  // 수업 종료 연동 — 교사가 '수업 종료'를 누르면 endNoticeAt(prop)이 새 값으로 바뀐다.
  // 방송 중에 시작 기준값과 달라지면 자동으로 정지한다. (endNoticeAt은 App의 publishedLessons onSnapshot에서 내려온다)
  useEffect(() => {
    if (!isBroadcasting) return;
    const current = endNoticeAt ?? null;
    if (current && current !== startEndNoticeRef.current) {
      stopBroadcast({ kind: 'info', text: '수업이 종료되어 통역 자막을 껐어요.' });
    }
  }, [endNoticeAt, isBroadcasting, stopBroadcast]);

  // 언마운트 정리.
  useEffect(() => {
    return () => {
      isBroadcastingRef.current = false;
      if (autoStopTimerRef.current) clearTimeout(autoStopTimerRef.current);
      const recognition = recognitionRef.current;
      if (recognition) {
        recognition.onend = null;
        recognition.onresult = null;
        recognition.onerror = null;
        try {
          recognition.abort();
        } catch {
          /* 무시 */
        }
      }
    };
  }, []);

  // ── 렌더: 미지원 브라우저 ────────────────────────────────────────────────
  if (!speechSupported) {
    return (
      <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
        <div className="flex items-center gap-2 rounded-full bg-[#E5E3DD] px-4 py-2 text-xs font-semibold text-[#8B7E74] shadow ring-1 ring-[#E5E3DD]">
          <MicOff className="h-4 w-4" />
          이 브라우저에서는 음성 인식을 지원하지 않아요
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {/* 인식 중인 말 미리보기(교사 확인용) */}
      {isBroadcasting && interimText && (
        <div
          className="max-w-[80vw] rounded-2xl bg-white/95 px-4 py-2 text-sm text-[#4A3728] shadow-lg ring-1 ring-[#EADBC8]"
          dir="auto"
        >
          {interimText}
        </div>
      )}

      {/* 안내(권한 오류·자동 정지·수업 종료) — 꺼진 상태에서만 표시 */}
      {notice && !isBroadcasting && (
        <div
          className={`max-w-[80vw] rounded-full px-4 py-1.5 text-xs font-semibold shadow ring-1 ${
            notice.kind === 'error'
              ? 'bg-red-50 text-red-600 ring-red-100'
              : 'bg-[#FFF5E9] text-[#8B5E3C] ring-[#EADBC8]'
          }`}
        >
          {notice.text}
        </div>
      )}

      <button
        type="button"
        onClick={handleToggle}
        aria-pressed={isBroadcasting}
        aria-label={isBroadcasting ? '통역 자막 끄기' : '통역 자막 켜기'}
        className={`flex items-center gap-2 rounded-full px-5 py-3 text-sm font-bold shadow-lg ring-1 transition-all ${
          isBroadcasting
            ? 'animate-pulse bg-red-500 text-white ring-red-300'
            : 'bg-[#8B5E3C] text-white ring-[#7A5030] hover:scale-105'
        }`}
      >
        {isBroadcasting ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        <span>{isBroadcasting ? '통역 자막 끄기' : '통역 자막 시작'}</span>
        {isBroadcasting && (
          <span className="ml-1 flex items-center gap-1">
            {targetLangCodes.length === 0 ? (
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold">
                번역 대상 없음
              </span>
            ) : (
              targetLangCodes.map((code) => (
                <span
                  key={code}
                  className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold"
                  dir="auto"
                >
                  {labelForIso(code)}
                </span>
              ))
            )}
          </span>
        )}
      </button>
    </div>
  );
};
