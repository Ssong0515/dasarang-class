import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Languages, ChevronDown, Check } from 'lucide-react';
import { VOICE_LANG_OPTIONS } from './StudentVoiceButton';
import { translateFromKorean, warmUpTranslators } from '../utils/translateFromKorean';

// 교사 로컬 실시간 통역 자막(CC) — 교사가 한국어로 말하면 선택한 한 언어로 실시간 번역해 교사 화면(프로젝터 미러링)
// 상단에 자막으로 띄운다. 학생 방송(TeacherBroadcastButton)과 달리 Firestore를 거치지 않는 교사 전용 표시다.
// 음성인식 로직은 검증된 TeacherBroadcastButton 패턴을 그대로 따른다(연속·자동재시작·긴 발화 끊기).

// ─── SpeechRecognition 최소 타입 선언 (TeacherBroadcastButton과 동일) ──────────
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

// 마이크 권한 확보(TeacherBroadcastButton.ensureMic과 동일 패턴). 이미 허용됐으면 재획득하지 않는다.
const ensureMic = async (): Promise<boolean> => {
  try {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return true;
    }
    if (navigator.permissions?.query) {
      try {
        const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        if (status.state === 'granted') return true;
        if (status.state === 'denied') return false;
      } catch {
        /* permissions API 미지원 → 아래에서 요청 */
      }
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    return false;
  }
};

// 긴 발화를 끊는 임계값. 값을 크게 잡아 문장 중간을 덜 자르고, 되도록 음성인식이 자연스러운 '쉼'에서
// 스스로 확정(isFinal)하게 둔다 → 번역이 조각나지 않아 더 매끄럽다. (아주 긴 무정지 발화만 강제로 끊음)
const MAX_INTERIM_CHARS = 140;
const MAX_INTERIM_MS = 11000;
const FLUSH_CHECK_MS = 1500;

// 확정 조각 합치기 — 한 문장이 여러 개의 짧은 isFinal로 쪼개져 오면(자연스러운 쉼마다) 잠깐 모았다가
// 한 번에 번역한다. 문장 단위로 번역해야 훨씬 매끄럽다. 아래 시간 동안 새 조각이 없으면 모은 걸 확정.
const FINAL_COALESCE_MS = 1200;
// 단, 모은 게 이 길이를 넘으면(무정지 장문) 기다리지 않고 바로 번역해 지연을 막는다.
const FINAL_COALESCE_MAX_CHARS = 120;

// 아랫줄(실시간 임시 번역) 갱신 주기 — 진행 중 발화를 이 간격마다 최신 상태로 번역해 계속 바뀌며 보여준다.
// 윗줄(완성 문장)이 늦게 뜨는 답답함을 이 즉시성으로 메운다. 너무 촘촘하면 번역 호출이 잦아지니 적당히.
const LIVE_TRANSLATE_MS = 400;

// 새 발화가 이 시간 동안 없으면 자막을 내린다(길이 비례 6~12초).
const captionDurationMs = (text: string) => Math.min(12000, Math.max(6000, text.length * 120));

const CC_LANG_STORAGE_KEY = 'dsr_cc_lang';
const readStoredIso = (): string => {
  try {
    const stored = localStorage.getItem(CC_LANG_STORAGE_KEY);
    if (stored && VOICE_LANG_OPTIONS.some((option) => option.iso === stored)) return stored;
  } catch {
    /* 무시 */
  }
  return VOICE_LANG_OPTIONS.some((option) => option.iso === 'en') ? 'en' : VOICE_LANG_OPTIONS[0]?.iso ?? 'en';
};

export const TeacherLiveCaption: React.FC = () => {
  const speechSupported = getSpeechRecognitionCtor() !== null;

  const [isOn, setIsOn] = useState(false);
  const [targetIso, setTargetIso] = useState<string>(() => readStoredIso());
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [koreanCaption, setKoreanCaption] = useState(''); // 실시간(미확정 포함) 한국어
  const [translatedCaption, setTranslatedCaption] = useState(''); // 윗줄: 최근 확정 문장의 번역
  const [liveTranslatedCaption, setLiveTranslatedCaption] = useState(''); // 아랫줄: 진행 중 발화의 실시간 임시 번역
  const [notice, setNotice] = useState<string | null>(null);
  // 이론 슬라이드 등이 네이티브 전체화면이면 그 요소(top layer) 위엔 일반 DOM이 안 보인다 →
  // 자막을 '전체화면 요소의 자식'으로 포털해 그 위에 뜨게 한다. iframe이 전체화면이면 자식을 못 넣으므로 body로 폴백.
  const [fsElement, setFsElement] = useState<Element | null>(null);
  useEffect(() => {
    const onFsChange = () => setFsElement(document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const isOnRef = useRef(false);
  const permissionDeniedRef = useRef(false);
  const flushingRef = useRef(false);
  const interimSinceRef = useRef(0);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetIsoRef = useRef(targetIso);
  targetIsoRef.current = targetIso;
  // 번역이 비동기라 늦게 온 예전 문장이 최신 자막을 덮지 않도록 순번을 센다.
  const finalSeqRef = useRef(0);
  // 확정 조각 합치기용 — 모으는 버퍼와 그 타이머.
  const pendingFinalRef = useRef('');
  const finalBufferTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 아랫줄(실시간 임시 번역)용 — 스로틀 타이머·최신 원문·순번.
  const liveThrottleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const livePendingSourceRef = useRef('');
  const liveSeqRef = useRef(0);

  const currentLang = VOICE_LANG_OPTIONS.find((option) => option.iso === targetIso) ?? VOICE_LANG_OPTIONS[0];

  const clearCaptionSoon = useCallback((basisText: string) => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = basisText
      ? setTimeout(() => {
          setKoreanCaption('');
          setTranslatedCaption('');
          setLiveTranslatedCaption('');
        }, captionDurationMs(basisText))
      : null;
  }, []);

  // 확정된 한 마디를 선택 언어로 번역해 자막에 반영한다.
  const handleFinal = useCallback(async (koreanText: string) => {
    const text = koreanText.trim();
    if (!text) return;
    const iso = targetIsoRef.current;
    finalSeqRef.current += 1;
    const seq = finalSeqRef.current;
    try {
      const translations = await translateFromKorean(text, [iso]);
      // 그 사이 더 최신 발화가 확정됐으면 이 번역은 버린다(순서 꼬임 방지).
      if (seq !== finalSeqRef.current) return;
      const out = translations[iso];
      if (out) setTranslatedCaption(out);
    } catch {
      /* 번역 실패는 무시 — 한국어 자막은 계속 보인다 */
    }
  }, []);

  // 모아 둔 확정 조각을 한 문장으로 확정해 번역한다(윗줄). 이 문장은 윗줄로 확정되니 아랫줄(임시)은 비운다.
  const flushPendingFinal = useCallback(() => {
    if (finalBufferTimerRef.current) {
      clearTimeout(finalBufferTimerRef.current);
      finalBufferTimerRef.current = null;
    }
    if (liveThrottleTimerRef.current) {
      clearTimeout(liveThrottleTimerRef.current);
      liveThrottleTimerRef.current = null;
    }
    livePendingSourceRef.current = '';
    setLiveTranslatedCaption('');
    const text = pendingFinalRef.current.trim();
    pendingFinalRef.current = '';
    if (text) void handleFinal(text);
  }, [handleFinal]);

  // 새 확정 조각을 버퍼에 붙이고, 잠깐 기다렸다가(더 안 오면) 한 번에 번역한다.
  const bufferFinal = useCallback((chunk: string) => {
    const piece = chunk.trim();
    if (!piece) return;
    pendingFinalRef.current = `${pendingFinalRef.current} ${piece}`.trim();
    // 충분히 길면(무정지 장문) 기다리지 않고 바로 번역.
    if (pendingFinalRef.current.length >= FINAL_COALESCE_MAX_CHARS) {
      flushPendingFinal();
      return;
    }
    if (finalBufferTimerRef.current) clearTimeout(finalBufferTimerRef.current);
    finalBufferTimerRef.current = setTimeout(flushPendingFinal, FINAL_COALESCE_MS);
  }, [flushPendingFinal]);

  // 아랫줄 — 진행 중 발화(source)를 지금 언어로 번역해 즉시 반영. 늦게 온 예전 결과가 최신을 덮지 않게 순번으로 가드.
  const runLiveTranslate = useCallback(async (source: string) => {
    const iso = targetIsoRef.current;
    liveSeqRef.current += 1;
    const seq = liveSeqRef.current;
    try {
      const translations = await translateFromKorean(source, [iso]);
      if (seq !== liveSeqRef.current) return; // 더 최신 요청이 있으면 버림
      setLiveTranslatedCaption(translations[iso] || '');
    } catch {
      /* 임시 번역 실패는 무시 */
    }
  }, []);

  // 진행 중 발화를 스로틀(최대 LIVE_TRANSLATE_MS마다)로 번역 예약 — 계속 말하는 동안 아랫줄이 주기적으로 갱신된다.
  const scheduleLiveTranslate = useCallback((source: string) => {
    const text = source.trim();
    livePendingSourceRef.current = text;
    if (!text) {
      setLiveTranslatedCaption('');
      return;
    }
    if (liveThrottleTimerRef.current) return; // 이미 예약돼 있으면 최신 원문만 갱신하고 대기
    liveThrottleTimerRef.current = setTimeout(() => {
      liveThrottleTimerRef.current = null;
      const latest = livePendingSourceRef.current.trim();
      if (latest) void runLiveTranslate(latest);
    }, LIVE_TRANSLATE_MS);
  }, [runLiveTranslate]);

  const stopCaption = useCallback((nextNotice: string | null = null) => {
    isOnRef.current = false;
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (finalBufferTimerRef.current) {
      clearTimeout(finalBufferTimerRef.current);
      finalBufferTimerRef.current = null;
    }
    if (liveThrottleTimerRef.current) {
      clearTimeout(liveThrottleTimerRef.current);
      liveThrottleTimerRef.current = null;
    }
    pendingFinalRef.current = '';
    livePendingSourceRef.current = '';
    flushingRef.current = false;
    interimSinceRef.current = 0;
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onend = null;
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
    setIsOn(false);
    setKoreanCaption('');
    setTranslatedCaption('');
    setLiveTranslatedCaption('');
    setNotice(nextNotice);
  }, []);

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

  const beginRecognition = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

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
    flushingRef.current = false;
    interimSinceRef.current = 0;

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
      if (finalText) bufferFinal(finalText);

      const interimTrimmed = interim.trim();
      if (interimTrimmed) {
        if (interimSinceRef.current === 0) interimSinceRef.current = Date.now();
      } else {
        interimSinceRef.current = 0;
      }
      // 한국어 미리보기는 내부용(재번역·타이머 기준)으로만 추적한다.
      const previewText = (finalChunk + interim).trim();
      if (previewText) setKoreanCaption(previewText);
      clearCaptionSoon(previewText || koreanCaption);

      // 아랫줄(실시간 임시 번역) — 진행 중인 문장(아직 안 합쳐진 확정분 + 미확정분)을 짧은 주기로 번역해 계속 갱신.
      scheduleLiveTranslate(`${pendingFinalRef.current} ${interim}`.trim());

      if (interimTrimmed.length >= MAX_INTERIM_CHARS) flushRecognition();
    };

    recognition.onerror = (event) => {
      const code = typeof event?.error === 'string' ? event.error : '';
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        permissionDeniedRef.current = true;
        stopCaption('마이크 권한이 필요해요. 브라우저에서 마이크를 허용해 주세요.');
      }
    };

    recognition.onend = () => {
      if (!isOnRef.current || permissionDeniedRef.current) return;
      beginRecognition();
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      /* InvalidStateError 등은 무시(다음 onend 사이클에서 회복) */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bufferFinal, scheduleLiveTranslate, stopCaption, flushRecognition, clearCaptionSoon]);

  const startCaption = useCallback(async () => {
    if (isOnRef.current) return;
    if (!getSpeechRecognitionCtor()) {
      setNotice('이 브라우저에서는 음성 인식을 지원하지 않아요.');
      return;
    }
    permissionDeniedRef.current = false;
    isOnRef.current = true;
    setNotice(null);
    setKoreanCaption('');
    setTranslatedCaption('');
    setIsOn(true);

    const micOk = await ensureMic();
    if (!isOnRef.current) return;
    if (!micOk) {
      permissionDeniedRef.current = true;
      stopCaption('마이크 권한이 필요해요. 브라우저에서 마이크를 허용해 주세요.');
      return;
    }

    void warmUpTranslators([targetIsoRef.current]);

    flushTimerRef.current = setInterval(() => {
      if (interimSinceRef.current > 0 && Date.now() - interimSinceRef.current >= MAX_INTERIM_MS) {
        flushRecognition();
      }
    }, FLUSH_CHECK_MS);

    beginRecognition();
  }, [beginRecognition, stopCaption, flushRecognition]);

  const handleToggle = () => {
    if (isOn) stopCaption(null);
    else void startCaption();
  };

  const handlePickLang = (iso: string) => {
    setTargetIso(iso);
    setLangMenuOpen(false);
    try {
      localStorage.setItem(CC_LANG_STORAGE_KEY, iso);
    } catch {
      /* 무시 */
    }
    // 언어를 바꾸면 그 언어 모델을 미리 예열하고, 지금 떠 있는 번역은 새 언어로 다시 만든다.
    if (isOnRef.current) {
      void warmUpTranslators([iso]);
      const korean = koreanCaption.trim();
      if (korean) void handleFinal(korean);
    }
  };

  // 언마운트 정리.
  useEffect(() => {
    return () => {
      isOnRef.current = false;
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (finalBufferTimerRef.current) clearTimeout(finalBufferTimerRef.current);
      if (liveThrottleTimerRef.current) clearTimeout(liveThrottleTimerRef.current);
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

  // 자막을 띄울 위치 — 전체화면 요소가 있고 그게 자식을 담을 수 있으면(iframe 아님) 그 안에, 아니면 body에.
  const captionHost =
    fsElement && fsElement.tagName !== 'IFRAME' ? (fsElement as Element) : (typeof document !== 'undefined' ? document.body : null);

  return (
    <>
      {/* 자막 오버레이 — 상단 중앙(프로젝터). 선택 언어 번역을 크게, 한국어 원문을 그 아래 작게 병기.
          전체화면(이론 슬라이드 등) 요소가 있으면 그 요소 안으로 포털해 전체화면 위에도 뜨게 한다.
          z-[10005]: 학생 자막 계층과 동일(교사 화면엔 학생 자막이 없어 충돌 없음). */}
      {isOn && (translatedCaption || liveTranslatedCaption) && captionHost &&
        createPortal(
          <div className="pointer-events-none fixed inset-x-0 top-4 z-[10005] flex justify-center px-4">
            <div className="max-w-[92vw] rounded-2xl bg-black/90 px-6 py-4 text-center shadow-2xl sm:px-8 sm:py-5">
              {/* 윗줄: 완성된 문장 번역(문장이 끝날 때마다 갱신) */}
              {translatedCaption && (
                <p className="text-3xl font-bold leading-snug text-white sm:text-4xl" dir="auto">
                  {translatedCaption}
                </p>
              )}
              {/* 아랫줄: 진행 중 발화의 실시간 임시 번역(계속 변동) — 옅고 조금 작게 표시해 '아직 확정 아님'을 나타냄 */}
              {liveTranslatedCaption && (
                <p
                  className={`text-2xl font-medium leading-snug text-white/55 sm:text-3xl ${translatedCaption ? 'mt-1.5' : ''}`}
                  dir="auto"
                >
                  {liveTranslatedCaption}
                </p>
              )}
            </div>
          </div>,
          captionHost
        )}

      {/* 컨트롤 — 좌하단(우하단 방송·채팅 FAB와 겹치지 않게). 언어 선택 + CC 토글. */}
      <div className="fixed bottom-4 left-4 z-40 flex items-center gap-2">
        {notice && !isOn && (
          <div className="max-w-[70vw] rounded-full bg-red-50 px-4 py-1.5 text-xs font-semibold text-red-600 shadow ring-1 ring-red-100">
            {notice}
          </div>
        )}
        <div className="relative">
          <button
            type="button"
            onClick={() => setLangMenuOpen((open) => !open)}
            title="자막 언어 선택"
            className="flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-xs font-bold text-[#4A3728] shadow-lg ring-1 ring-[#EADBC8] transition-all hover:bg-[#FFF5E9]"
          >
            <Languages size={14} className="text-[#8B5E3C]" />
            {currentLang?.label ?? '언어'}
            <ChevronDown size={13} className="text-[#8B7E74]" />
          </button>
          {langMenuOpen && (
            <div className="absolute bottom-full left-0 mb-2 min-w-[9rem] overflow-hidden rounded-2xl bg-white py-1 shadow-xl ring-1 ring-[#EADBC8]">
              {VOICE_LANG_OPTIONS.map((option) => (
                <button
                  key={option.iso}
                  type="button"
                  onClick={() => handlePickLang(option.iso)}
                  className={`flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm transition-colors hover:bg-[#FFF5E9] ${
                    option.iso === targetIso ? 'font-bold text-[#8B5E3C]' : 'text-[#4A3728]'
                  }`}
                >
                  {option.label}
                  {option.iso === targetIso && <Check size={14} className="text-[#8B5E3C]" />}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleToggle}
          disabled={!speechSupported}
          aria-pressed={isOn}
          title={
            !speechSupported
              ? '이 브라우저에서는 음성 인식을 지원하지 않아요'
              : isOn
                ? 'CC 끄기'
                : 'CC 켜기 — 내가 말하는 걸 선택한 언어로 화면 상단에 자막으로 띄웁니다'
          }
          className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold shadow-lg transition-all ${
            !speechSupported
              ? 'cursor-not-allowed bg-[#E5E3DD] text-[#A89F94]'
              : isOn
                ? 'animate-pulse bg-red-500 text-white'
                : 'bg-[#8B5E3C] text-white hover:scale-105'
          }`}
        >
          CC {isOn ? '끄기' : '켜기'}
        </button>
      </div>
    </>
  );
};
