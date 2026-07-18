import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { db, collection, addDoc, handleFirestoreError, OperationType } from '../firebase';
import { TEACHER_BROADCAST_MESSAGES_COLLECTION } from '../utils/classroomDomain';
import { VOICE_LANG_OPTIONS } from './StudentVoiceButton';
import { translateFromKorean, warmUpTranslators } from '../utils/translateFromKorean';

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
  onstart: (() => void) | null;
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

// 마이크 권한을 확보한다(StudentVoiceButton.warmUpMic과 동일 패턴).
// 중요: 이미 허용된 상태면 getUserMedia를 다시 호출하지 않는다. 인식 시작 직전에 마이크를 잡았다 놓으면
// 방금 시작한 SpeechRecognition의 오디오 파이프라인이 끊겨 onresult가 안 오는 경합이 생긴다.
// 반환값: 마이크를 쓸 수 있으면 true, 거부됐으면 false.
const ensureMic = async (): Promise<boolean> => {
  try {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return true; // 물어볼 방법이 없으면 그냥 진행(SpeechRecognition이 알아서 처리)
    }
    if (navigator.permissions?.query) {
      try {
        const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        if (status.state === 'granted') return true; // 이미 허용됨 → 재획득하지 않음(인식 시작과 충돌 방지)
        if (status.state === 'denied') return false;
      } catch {
        /* permissions API 미지원 → 아래에서 그냥 요청 */
      }
    }
    // 아직 미허용(prompt) 상태일 때만 권한을 요청한다.
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop()); // 권한만 얻고 즉시 해제
    return true;
  } catch {
    return false; // 사용자가 거부
  }
};

// 방송 번역 대상 — 출석 기록·학생 프로필과 무관하게 항상 '지원 언어 전부 + 한국어'.
// 학생이 어떤 언어를 골라도(또는 출석 체크 전이라도) 즉시 그 언어 자막이 나오게 한다.
// 온디바이스 번역이라 비용이 없고, 언어별 8초 타임아웃 폴백이 있어 발화당 병렬 번역 부담도 작다.
// TeacherVoiceChat의 채팅 전송도 같은 대상으로 번역하므로 export해 공유한다.
export const BROADCAST_TARGET_CODES = ['ko', ...VOICE_LANG_OPTIONS.map((option) => option.iso)];

// 긴 발화를 자막 크기로 끊어 보내기 위한 임계값. 교사가 쉼표 없이 길게 말해도 아래 조건이면 강제로 끊어 확정·전송하고 이어서 다시 인식한다.
const MAX_INTERIM_CHARS = 60; // 확정 안 된 미리보기가 이 글자 수를 넘으면 끊는다.
const MAX_INTERIM_MS = 6000; // 또는 확정 없이 이 시간(ms) 동안 이어지면 끊는다.
const FLUSH_CHECK_MS = 1500; // 시간 기반 끊기 점검 주기.

// 교사 미리보기 버블 자동 숨김 — 마지막 말이 화면에 계속 남지 않도록, 새 인식 이벤트가 이 시간 동안
// 없으면 내린다. 학생 자막(StudentSubtitleOverlay)과 같은 길이 비례 계산(6~12초)을 써서 감각을 맞춘다.
const previewDurationMs = (text: string) => Math.min(12000, Math.max(6000, text.length * 120));

export interface TeacherBroadcastButtonProps {
  /** 활성 반이 있으면 그 반 정보를 메타데이터로 기록한다. 없어도 방송은 동작한다(전역 방송). */
  classroomId?: string;
  classroomName?: string;
  date: string;
}

type BroadcastNotice = { kind: 'error' | 'info'; text: string } | null;

export const TeacherBroadcastButton: React.FC<TeacherBroadcastButtonProps> = ({
  classroomId,
  classroomName,
  date,
}) => {
  const speechSupported = getSpeechRecognitionCtor() !== null;

  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [notice, setNotice] = useState<BroadcastNotice>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const isBroadcastingRef = useRef(false);
  const permissionDeniedRef = useRef(false);
  // 긴 발화 자동 끊기용.
  const flushingRef = useRef(false); // stop() 호출 후 중복 호출 방지 가드
  const interimSinceRef = useRef(0); // 현재 미확정 미리보기가 시작된 시각(ms). 없으면 0.
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 미리보기 버블 자동 숨김 타이머 — 새 인식 이벤트마다 리셋되므로 말하는 중에는 사라지지 않는다.
  const previewHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // onresult/onend 클로저가 항상 '최신' 값을 읽도록 ref에 보관(고정 스냅샷이 아니라 매번 최신값 참조).
  const ctxRef = useRef({ classroomId, classroomName, date });
  ctxRef.current = { classroomId, classroomName, date };

  // 확정된(final) 한 마디를 그 시점 대상 언어로 번역해 Firestore에 새 문서로 추가한다.
  // 반 선택 여부와 무관하게 전송한다(학생 수신도 반 구분 없이 날짜만 본다).
  const sendBroadcast = useCallback(async (koreanText: string) => {
    const text = koreanText.trim();
    if (!text) return;
    const ctx = ctxRef.current;

    const translations = await translateFromKorean(text, BROADCAST_TARGET_CODES);
    try {
      await addDoc(collection(db, TEACHER_BROADCAST_MESSAGES_COLLECTION), {
        classroomId: ctx.classroomId ?? '',
        classroomName: ctx.classroomName ?? '',
        date: ctx.date,
        koreanText: text,
        translations,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      // handleFirestoreError는 로깅 후 다시 throw한다 — 여기서 삼켜서, 공개 토글 등과 겹쳐 한 마디 저장이
      // 실패해도 처리 안 된 에러로 화면을 깨거나 방송 전체를 끊지 않게 한다(그 한 마디만 유실).
      try {
        handleFirestoreError(error, OperationType.CREATE, TEACHER_BROADCAST_MESSAGES_COLLECTION);
      } catch {
        /* 로깅만 하고 방송은 계속 */
      }
    }
  }, []);

  const stopBroadcast = useCallback((nextNotice: BroadcastNotice = null) => {
    isBroadcastingRef.current = false;
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    if (previewHideTimerRef.current) {
      clearTimeout(previewHideTimerRef.current);
      previewHideTimerRef.current = null;
    }
    flushingRef.current = false;
    interimSinceRef.current = 0;
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

  // 진행 중(확정 안 된) 발화를 강제로 확정시켜 보낸다. stop() → onresult(final) 전송 → onend → 자동 재시작.
  const flushRecognition = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition || flushingRef.current) return;
    flushingRef.current = true;
    try {
      recognition.stop();
    } catch {
      /* onend에서 재시작 */
    }
  }, []);

  // SpeechRecognition 인스턴스를 새로 만들어 시작한다. onend에서 자기 자신을 호출해 자동 재시작한다.
  const beginRecognition = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    // 이전 인스턴스가 남아 있으면 반드시 정리한다. 안 그러면 마이크를 두 인스턴스가 동시에 잡아 어느 쪽도 인식 결과를 못 낸다.
    const previous = recognitionRef.current;
    if (previous) {
      previous.onstart = null;
      previous.onresult = null;
      previous.onerror = null;
      previous.onend = null;
      try {
        previous.abort();
      } catch {
        /* 무시 */
      }
      recognitionRef.current = null;
    }

    let recognition: SpeechRecognitionLike;
    try {
      recognition = new Ctor();
    } catch {
      return;
    }
    recognition.lang = 'ko-KR';
    recognition.continuous = true;
    recognition.interimResults = true;
    // 새 세션 시작 → 끊기 상태 초기화.
    flushingRef.current = false;
    interimSinceRef.current = 0;

    recognition.onstart = () => {
      console.info('[broadcast] recognition started');
    };

    recognition.onresult = (event) => {
      let interim = '';
      let finalChunk = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? '';
        if (result.isFinal) {
          finalChunk += transcript;
        } else {
          interim += transcript;
        }
      }
      const finalText = finalChunk.trim();
      if (finalText) void sendBroadcast(finalText);

      const interimTrimmed = interim.trim();
      // 미확정 미리보기가 시작된 시각을 추적(시간 기반 끊기용).
      if (interimTrimmed) {
        if (interimSinceRef.current === 0) interimSinceRef.current = Date.now();
      } else {
        interimSinceRef.current = 0;
      }
      // 확정 문장 + 진행 중 텍스트를 함께 미리보기로 보여준다(확정만 오는 브라우저에서도 버블이 뜨도록).
      const previewText = (finalChunk + interim).trim();
      setInterimText(previewText);
      // 발화가 끝나 새 이벤트가 안 오면(마지막 말이 계속 남지 않게) 잠시 뒤 미리보기를 내린다.
      if (previewHideTimerRef.current) clearTimeout(previewHideTimerRef.current);
      previewHideTimerRef.current = previewText
        ? setTimeout(() => setInterimText(''), previewDurationMs(previewText))
        : null;

      // 확정 없이 미리보기가 너무 길어지면 강제로 끊어 보낸다.
      if (interimTrimmed.length >= MAX_INTERIM_CHARS) flushRecognition();
    };

    recognition.onerror = (event) => {
      const code = typeof event?.error === 'string' ? event.error : '';
      console.warn('[broadcast] recognition error:', code);
      // 권한 거부/서비스 불가는 재시작해도 소용없으니 방송을 끈다. 그 외(no-speech·network·aborted 등)는 onend에서 자동 재시작.
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        permissionDeniedRef.current = true;
        stopBroadcast({ kind: 'error', text: '마이크 권한이 필요해요. 브라우저에서 마이크를 허용해 주세요.' });
      }
    };

    recognition.onend = () => {
      console.info('[broadcast] recognition ended (broadcasting:', isBroadcastingRef.current, ')');
      // 사용자가 끈 게 아니고(=여전히 방송 중) 권한 문제도 아니면 자동 재시작.
      // 시간제한 없음 — 교사가 '통역 자막 끄기'를 누를 때까지 계속 방송한다.
      if (!isBroadcastingRef.current || permissionDeniedRef.current) return;
      // Chrome은 무음이 길면(~60초) onend를 조용히 발생시킨다 → 계속 방송하려면 새 인스턴스로 다시 시작.
      beginRecognition();
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      // 이미 시작된 상태의 InvalidStateError 등은 무시(다음 onend 사이클에서 회복).
    }
  }, [sendBroadcast, stopBroadcast, flushRecognition]);

  const startBroadcast = useCallback(async () => {
    if (isBroadcastingRef.current) return;
    if (!getSpeechRecognitionCtor()) {
      setNotice({ kind: 'error', text: '이 브라우저에서는 음성 인식을 지원하지 않아요.' });
      return;
    }

    permissionDeniedRef.current = false;
    isBroadcastingRef.current = true;
    setNotice(null);
    setInterimText('');
    setIsBroadcasting(true);

    // 마이크 권한을 먼저 확실히 확보한다(교사 창은 학생 창과 별개의 권한 컨텍스트라 여기서 프롬프트가 떠야 함).
    // 거부되면 방송을 켜지 않는다(조용히 인식만 안 되는 상황 방지).
    const micOk = await ensureMic();
    if (!isBroadcastingRef.current) return; // 그 사이 사용자가 껐으면 중단
    if (!micOk) {
      permissionDeniedRef.current = true;
      stopBroadcast({ kind: 'error', text: '마이크 권한이 필요해요. 브라우저에서 마이크를 허용해 주세요.' });
      return;
    }

    // 번역 모델을 미리 예열한다(첫 발화가 ko→언어 모델 다운로드로 지연/블록되지 않게). 실패는 무시.
    void warmUpTranslators(BROADCAST_TARGET_CODES);

    // 긴 발화 시간 기반 끊기: 확정 없이 오래 이어지면(끊어 읽지 않으면) 끊어 보낸다.
    flushTimerRef.current = setInterval(() => {
      if (interimSinceRef.current > 0 && Date.now() - interimSinceRef.current >= MAX_INTERIM_MS) {
        flushRecognition();
      }
    }, FLUSH_CHECK_MS);

    beginRecognition();
  }, [beginRecognition, stopBroadcast, flushRecognition]);

  const handleToggle = () => {
    if (isBroadcasting) {
      stopBroadcast(null);
    } else {
      void startBroadcast();
    }
  };

  // 언마운트 정리.
  useEffect(() => {
    return () => {
      isBroadcastingRef.current = false;
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
      if (previewHideTimerRef.current) clearTimeout(previewHideTimerRef.current);
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

  // ── 렌더: 미지원 브라우저 — 채팅 FAB 위 같은 자리에 비활성 아이콘만 ─────────
  if (!speechSupported) {
    return (
      <div className="fixed bottom-20 right-4 z-40">
        <button
          type="button"
          disabled
          title="이 브라우저에서는 음성 인식을 지원하지 않아요"
          className="flex h-14 w-14 cursor-not-allowed items-center justify-center rounded-full bg-[#E5E3DD] text-[#A89F94] shadow-lg"
        >
          <MicOff className="h-6 w-6" />
        </button>
      </div>
    );
  }

  return (
    <>
      {/* STT 미리보기·안내 문구는 기존대로 하단 중앙에 표시 */}
      {(isBroadcasting && interimText) || (notice && !isBroadcasting) ? (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 flex-col items-center gap-2">
          {/* 인식 중인 말 미리보기(교사 확인용) */}
          {isBroadcasting && interimText && (
            <div
              className="max-w-[80vw] rounded-2xl bg-white/95 px-4 py-2 text-sm text-[#4A3728] shadow-lg ring-1 ring-[#EADBC8]"
              dir="auto"
            >
              {interimText}
            </div>
          )}
          {/* 안내(권한 오류 등) — 꺼진 상태에서만 표시 */}
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
        </div>
      ) : null}

      {/* 방송 토글 — 학생 채팅 FAB(bottom-4 right-4) 바로 위, 같은 크기의 아이콘 버튼.
          채팅 패널(z-50)이 열리면 그 뒤로 가려지도록 z-40. */}
      <div className="fixed bottom-20 right-4 z-40">
        <button
          type="button"
          onClick={handleToggle}
          aria-pressed={isBroadcasting}
          aria-label={isBroadcasting ? '통역 자막 끄기' : '통역 자막 켜기'}
          title={isBroadcasting ? '통역 자막 끄기' : '통역 자막 시작'}
          className={`flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-all ${
            isBroadcasting
              ? 'animate-pulse bg-red-500'
              : 'bg-[#8B5E3C] hover:scale-105'
          }`}
        >
          <Mic className="h-6 w-6" />
        </button>
      </div>
    </>
  );
};
