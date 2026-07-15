import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Globe, Check, CaptionsOff } from 'lucide-react';
import { db, collection, addDoc, handleFirestoreError, OperationType } from '../firebase';
import { STUDENT_VOICE_MESSAGES_COLLECTION } from '../utils/classroomDomain';
import { translateToKorean } from '../utils/translateToKorean';

// ─────────────────────────────────────────────────────────────────────────────
// 언어 선택지 (단일 출처). label=자기 문자 표기, stt=SpeechRecognition.lang(BCP-47), iso=translateToKorean용 기본 ISO
// ─────────────────────────────────────────────────────────────────────────────
export interface VoiceLangOption {
  label: string;
  stt: string;
  iso: string;
}

export const VOICE_LANG_OPTIONS: VoiceLangOption[] = [
  { label: 'Русский', stt: 'ru-RU', iso: 'ru' },
  { label: '中文', stt: 'zh-CN', iso: 'zh' },
  { label: 'Tiếng Việt', stt: 'vi-VN', iso: 'vi' },
  { label: 'اردو', stt: 'ur-PK', iso: 'ur' },
  { label: 'Tagalog', stt: 'fil-PH', iso: 'tl' },
  { label: 'English', stt: 'en-US', iso: 'en' },
];

// '한국어(번역 없음)' 선택지 — 외국어를 골랐다가 되돌리고 싶은 학생용. VOICE_LANG_OPTIONS에 넣지 않는 이유:
// 그 배열은 교사 방송 번역 대상·학생 언어 매핑의 단일 출처라 한국어가 섞이면 안 된다.
// 이 모드에선 번역 자막·마이크 없이 조용한 언어 버튼만 남는다(자막 오버레이는 iso 'ko' 번역이 없어 한국어 원문 폴백).
export const KOREAN_LANG_OPTION: VoiceLangOption = { label: '한국어', stt: 'ko-KR', iso: 'ko' };

// '자막 끄기' 선택지 — 교사 방송 자막을 아예 받지 않으려는 학생용(CaptionsOff 아이콘 = CC에 취소선).
// 한국어 모드(자막은 한국어로 뜸)와 다른 점은 '자막을 전혀 안 띄운다'는 것 하나뿐이다.
// 언어 미선택·한국어 선택은 한국어 원문 자막이 뜨고, 이 옵션만 자막을 끈다(StudentSubtitleOverlay에서 iso로 분기).
// VOICE_LANG_OPTIONS에 넣지 않는 이유는 KOREAN_LANG_OPTION과 동일 — 번역·매핑의 단일 출처를 오염시키지 않으려고.
// 이 모드도 마이크·번역을 안 쓴다(iso 'off'는 번역 사전에 없어 실습 병기 번역도 자동으로 꺼진다).
export const SUBTITLE_OFF_OPTION: VoiceLangOption = { label: '자막 끄기', stt: '', iso: 'off' };

// ── 푸시투토크 안전장치 상수 ─────────────────────────────────────────────────
// 이보다 짧게 누르면 '누른 채 말하기'를 모르는 것으로 보고 사용법 힌트를 띄운다.
const MIN_HOLD_MS = 600;
// stop()이 시작 경합으로 씹혔을 때(짧은 클릭 직후) 강제 종료까지 기다리는 시간.
const STOP_FAILSAFE_MS = 1000;
// 어떤 경우에도 녹음이 이 시간을 넘기면 자동으로 끝내 보낸다 — '계속 켜짐' 상태의 최종 복구선.
const MAX_RECORD_MS = 30 * 1000;

// 짧게 탭만 한 학생에게 자기 언어로 '꾹 누른 채 말하고, 다 말하면 떼기'를 알려주는 힌트.
const HOLD_HINTS: Record<string, string> = {
  ru: 'Нажми и держи 🎤 говори, потом отпусти',
  zh: '按住不放 🎤 说完再松开',
  vi: 'Nhấn giữ 🎤 nói xong mới thả tay',
  ur: '🎤 دبائے رکھیں اور بولیں، پھر چھوڑیں',
  tl: 'Pindutin nang matagal 🎤 magsalita, saka bitawan',
  en: 'Press and hold 🎤 speak, then let go',
};
const holdHintFor = (iso: string): string => HOLD_HINTS[iso] ?? HOLD_HINTS.en;

const VOICE_LANG_STORAGE_KEY = 'dsr_voice_lang';
// FAB 스택(언어 칩·피커·마이크)의 공통 래퍼. z-[10010]: 학생 페이지의 모든 오버레이(콘텐츠 드롭다운 z-90 ·
// 업로드 모달 z-100 · 수업 종료 안내 z-110 · 교사 자막 z-120)는 물론 슬라이드 '창 전체화면'(z-[9999], 종료 버튼
// z-[10000])보다도 위 — 언어·마이크 버튼은 어떤 화면 상태에서도 항상 맨 위에 떠 있어야 한다(2026-07-07 사용자 요청).
// 이 버튼 하나가 실습 병기 번역·교사 방송 자막의 언어를 모두 제어하므로 가려지면 안 된다.
const FAB_WRAPPER_CLASS = 'fixed bottom-4 right-4 z-[10010]';
// 같은 탭의 다른 기능(실습 병기 번역 등)이 언어 변경을 즉시 따라가도록 쏘는 커스텀 이벤트.
// storage 이벤트는 다른 탭에서만 발생하므로 같은 탭 전파는 이 이벤트로 한다. detail: { iso }.
export const VOICE_LANG_CHANGED_EVENT = 'dsr-voice-lang-changed';
// 학생 언어 세션 TTL(180분). 교사 방송(TeacherBroadcastButton)의 최대 자동 정지 시간과 같은 값을 써야 하므로
// 상수를 이중으로 정의하지 않고 여기서 export해 공유한다.
export const LANG_MAX_AGE_MS = 3 * 60 * 60 * 1000; // 3시간

interface StoredVoiceLang {
  iso: string;
  stt: string;
  label: string;
  setAt: string; // ISO
  classKey: string; // `today_${date}` — 날짜 단위 세션 키(반 무관)
}

// ─── SpeechRecognition 최소 타입 선언 (lib.dom에 표준화 전이라 좁게 정의) ─────────────
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
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives?: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: unknown) => void) | null;
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

// ─── localStorage 헬퍼 (SSR/차단 환경 안전) ────────────────────────────────────
const readStoredLang = (): StoredVoiceLang | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(VOICE_LANG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredVoiceLang>;
    if (
      parsed &&
      typeof parsed.iso === 'string' &&
      typeof parsed.stt === 'string' &&
      typeof parsed.label === 'string' &&
      typeof parsed.setAt === 'string' &&
      typeof parsed.classKey === 'string'
    ) {
      return parsed as StoredVoiceLang;
    }
  } catch {
    /* 무시 */
  }
  return null;
};

const writeStoredLang = (value: StoredVoiceLang) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(VOICE_LANG_STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* 무시 */
  }
};

const clearStoredLang = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(VOICE_LANG_STORAGE_KEY);
  } catch {
    /* 무시 */
  }
};

// 마이크 권한을 미리 받아둔다(이미 허용돼 있으면 프롬프트 없이 통과).
// 언어 선택 시 호출 → 첫 '누르고 말하기'가 권한 프롬프트로 끊기지 않게 한다.
const warmUpMic = async () => {
  try {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
    if (navigator.permissions?.query) {
      try {
        const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        if (status.state === 'granted') return; // 이미 허용됨 → 아무것도 안 함
      } catch {
        /* permissions API 미지원 → 그냥 요청 시도 */
      }
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop()); // 권한만 얻고 즉시 해제
  } catch {
    /* 사용자가 거부하면 첫 녹음 때 브라우저가 다시 물음 */
  }
};

export interface StudentVoiceButtonProps {
  classroomId?: string;
  classroomName?: string;
  date: string;
  endNoticeAt?: string | null;
}

type SendState = 'idle' | 'sending' | 'sent';

export const StudentVoiceButton: React.FC<StudentVoiceButtonProps> = ({
  classroomId,
  classroomName,
  date,
  endNoticeAt,
}) => {
  // 언어 선택은 '오늘' 단위로 유지한다. classroomId를 키에 넣으면 학생이 수업 공개 전에
  // 언어를 골랐다가 공개 순간 반이 특정되면서(undefined→반ID) 선택이 리셋되는 문제가 생긴다.
  const classKey = `today_${date}`;
  const speechSupported = getSpeechRecognitionCtor() !== null;

  const [lang, setLang] = useState<VoiceLangOption | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [sendState, setSendState] = useState<SendState>('idle');

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTextRef = useRef('');
  const sentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 푸시투토크 안전장치: 누른 시각(짧은 탭 감지), 정지 요청 플래그(start/stop 경합 방지), 힌트 표시.
  const pressStartedAtRef = useRef(0);
  const stopRequestedRef = useRef(false);
  const holdHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holdHint, setHoldHint] = useState(false);

  // 저장된 언어가 만료됐는지 판단하고, 유효하면 채택한다.
  useEffect(() => {
    const stored = readStoredLang();
    if (!stored) {
      setLang(null);
      return;
    }

    const expired =
      stored.classKey !== classKey ||
      (typeof endNoticeAt === 'string' &&
        endNoticeAt.length > 0 &&
        new Date(endNoticeAt).getTime() > new Date(stored.setAt).getTime()) ||
      Date.now() - new Date(stored.setAt).getTime() > LANG_MAX_AGE_MS;

    if (expired) {
      clearStoredLang();
      setLang(null);
      return;
    }

    const matched = VOICE_LANG_OPTIONS.find((option) => option.iso === stored.iso);
    setLang(matched ?? { label: stored.label, stt: stored.stt, iso: stored.iso });
  }, [classKey, endNoticeAt]);

  // 언마운트 정리.
  useEffect(() => {
    return () => {
      if (sentTimerRef.current) clearTimeout(sentTimerRef.current);
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
      if (holdHintTimerRef.current) clearTimeout(holdHintTimerRef.current);
      try {
        recognitionRef.current?.abort();
      } catch {
        /* 무시 */
      }
    };
  }, []);

  const chooseLang = (option: VoiceLangOption) => {
    writeStoredLang({
      iso: option.iso,
      stt: option.stt,
      label: option.label,
      setAt: new Date().toISOString(),
      classKey,
    });
    setLang(option);
    setIsPickerOpen(false);
    // 실습 병기 번역(StudentContentPreview iframe)이 이미 떠 있어도 바로 이 언어로 따라가게 알린다.
    // (한국어 되돌리기 포함 — iso 'ko'를 알려 병기 번역을 끄게 한다.)
    try {
      window.dispatchEvent(new CustomEvent(VOICE_LANG_CHANGED_EVENT, { detail: { iso: option.iso } }));
    } catch {
      /* 무시 */
    }
    // 마이크로 말하는 실제 음성 언어(VOICE_LANG_OPTIONS)일 때만 권한을 미리 확보한다.
    // 한국어(번역 없음)·자막 끄기 모드는 마이크를 안 쓰므로 권한 프롬프트를 띄우지 않는다.
    if (VOICE_LANG_OPTIONS.some((voiceOption) => voiceOption.iso === option.iso)) {
      void warmUpMic(); // 언어 고른 김에 마이크 권한 미리 확보 → 첫 녹음이 안 끊김
    }
  };

  const finishAndSend = useCallback(async () => {
    const text = finalTextRef.current.trim();
    finalTextRef.current = '';
    if (!text || !lang) {
      setInterimText('');
      return;
    }

    // 뗀 뒤에도 인식된 텍스트를 ~1.2초 유지 → 학생이 자기가 말한 걸 확인할 수 있게.
    setInterimText(text);
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    clearTimerRef.current = setTimeout(() => setInterimText(''), 1200);

    setSendState('sending');
    const { koreanText, ok } = await translateToKorean(text, lang.iso);
    try {
      await addDoc(collection(db, STUDENT_VOICE_MESSAGES_COLLECTION), {
        classroomId: classroomId ?? '',
        classroomName: classroomName ?? '',
        date,
        sourceLang: lang.stt,
        sourceText: text,
        koreanText,
        translationOk: ok,
        createdAt: new Date().toISOString(),
      });
      setSendState('sent');
      if (sentTimerRef.current) clearTimeout(sentTimerRef.current);
      sentTimerRef.current = setTimeout(() => setSendState('idle'), 1600);
    } catch (error) {
      setSendState('idle');
      handleFirestoreError(error, OperationType.CREATE, STUDENT_VOICE_MESSAGES_COLLECTION);
    }
  }, [classroomId, classroomName, date, lang]);

  const startRecording = useCallback(() => {
    if (!lang) return;
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    // 이전 인스턴스가 남아 있으면(더블클릭·연타로 stop이 씹힌 경우) 반드시 정리하고 시작한다.
    // 정리 없이 새로 만들면 마이크를 두 인스턴스가 잡아 어느 쪽도 멈출 수 없는 '계속 켜짐' 상태가 된다.
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
    recognition.lang = lang.stt;
    recognition.interimResults = true;
    recognition.continuous = true;

    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    finalTextRef.current = '';
    setInterimText('');
    stopRequestedRef.current = false;

    // 어떤 경우에도 무한 녹음으로 남지 않게 상한을 둔다(멈춤 실패 시 최종 복구선).
    const maxTimer = setTimeout(() => {
      stopRequestedRef.current = true;
      try {
        recognition.stop();
      } catch {
        /* 무시 */
      }
      setTimeout(() => {
        try {
          recognition.abort();
        } catch {
          /* 무시 */
        }
      }, STOP_FAILSAFE_MS);
    }, MAX_RECORD_MS);

    recognition.onstart = () => {
      // 인식 서비스가 붙기 전에 이미 손을 뗐다면(아주 짧은 클릭) 시작되자마자 멈춘다.
      // start() 직후의 stop()은 씹힐 수 있어서, 여기서 한 번 더 멈춰야 '계속 켜짐'이 안 생긴다.
      if (stopRequestedRef.current) {
        try {
          recognition.stop();
        } catch {
          /* 무시 */
        }
      }
    };
    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? '';
        if (result.isFinal) {
          finalTextRef.current += transcript;
        } else {
          interim += transcript;
        }
      }
      setInterimText((finalTextRef.current + interim).trim());
    };
    recognition.onerror = () => {
      // no-op: onend에서 정리·전송한다.
    };
    recognition.onend = () => {
      clearTimeout(maxTimer);
      // 연타로 이미 새 세션이 시작됐다면 이 종료 이벤트는 무시한다.
      // 여기서 ref를 무조건 지우면 새 세션의 핸들이 사라져 멈출 방법이 없어진다(기존 버그).
      if (recognitionRef.current !== recognition) return;
      setIsRecording(false);
      recognitionRef.current = null;
      void finishAndSend();
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsRecording(true);
    } catch {
      clearTimeout(maxTimer);
      recognitionRef.current = null;
    }
  }, [lang, finishAndSend]);

  const stopRecording = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    stopRequestedRef.current = true;
    try {
      recognition.stop(); // onend에서 finishAndSend 호출
    } catch {
      /* 무시 */
    }
    // stop()이 시작 경합으로 씹혀도 잠시 뒤 abort로 강제 종료한다(abort도 onend를 발생시킨다).
    setTimeout(() => {
      if (recognitionRef.current === recognition) {
        try {
          recognition.abort();
        } catch {
          /* 무시 */
        }
      }
    }, STOP_FAILSAFE_MS);
  }, []);

  // ── 렌더: 미지원 브라우저 ────────────────────────────────────────────────
  if (!speechSupported) {
    return (
      <div className={FAB_WRAPPER_CLASS}>
        <button
          type="button"
          disabled
          title="이 브라우저에서는 지원되지 않아요"
          className="flex h-14 w-14 cursor-not-allowed items-center justify-center rounded-full bg-[#E5E3DD] text-[#A89F94] shadow-lg"
        >
          <Mic className="h-6 w-6" />
        </button>
      </div>
    );
  }

  // ── 렌더: 언어 미선택 → 시각적 강조로 선택 유도 ─────────────────────────────
  // 학생들 언어가 제각각이라 텍스트 안내 대신 누구나 알아보는 신호만 쓴다:
  // 퍼지는 핑 링 + 굵은 금색 링 + 위에서 통통 튀는 👇 이모지. 피커를 열면 강조는 사라진다.
  if (!lang) {
    return (
      <div className={`${FAB_WRAPPER_CLASS} flex flex-col items-end gap-2`}>
        {isPickerOpen && (
          <LangPicker onChoose={chooseLang} onClose={() => setIsPickerOpen(false)} />
        )}
        {!isPickerOpen && (
          <div
            aria-hidden
            className="pointer-events-none flex w-16 animate-bounce justify-center text-4xl drop-shadow"
          >
            👇
          </div>
        )}
        <button
          type="button"
          onClick={() => setIsPickerOpen((open) => !open)}
          aria-label="언어 선택 · Choose language"
          className="relative flex h-16 w-16 items-center justify-center rounded-full bg-[#8B5E3C] text-white shadow-lg transition-transform hover:scale-105"
        >
          {!isPickerOpen && (
            <>
              {/* 바깥으로 퍼지는 물결 — '여기 눌러' 신호 */}
              <span className="absolute inset-0 animate-ping rounded-full bg-[#8B5E3C] opacity-40" />
              {/* 숨쉬는 금색 링 — 정적 상태에서도 눈에 띄게 */}
              <span className="absolute -inset-1.5 animate-pulse rounded-full ring-4 ring-[#F0B24A]/80" />
            </>
          )}
          <Globe className="relative h-7 w-7" />
        </button>
      </div>
    );
  }

  // ── 렌더: 마이크 없는 조용한 모드 — 한국어(번역 없음) / 자막 끄기 ──────────────
  // 외국어를 골랐다가 되돌린 학생이 다시 '언어 고르라'는 강조 애니메이션에 시달리지 않게,
  // 미선택 상태로 돌리지 않고 선택 상태를 저장해 둔다(TTL·수업 종료 리셋은 다른 언어와 동일).
  // 한국어는 자막이 한국어로 뜨고, 자막 끄기는 자막을 전혀 안 띄운다 — 칩 아이콘·글자로 구분한다.
  if (lang.iso === KOREAN_LANG_OPTION.iso || lang.iso === SUBTITLE_OFF_OPTION.iso) {
    const isSubtitleOff = lang.iso === SUBTITLE_OFF_OPTION.iso;
    return (
      <div className={`${FAB_WRAPPER_CLASS} flex flex-col items-end gap-2`}>
        {isPickerOpen && <LangPicker onChoose={chooseLang} onClose={() => setIsPickerOpen(false)} />}
        <button
          type="button"
          onClick={() => setIsPickerOpen((open) => !open)}
          aria-label="언어 선택 · Choose language"
          className="flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-xs font-bold text-[#8B5E3C] shadow-lg ring-1 ring-[#EADBC8] transition-transform hover:scale-105"
        >
          {isSubtitleOff ? <CaptionsOff className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
          {isSubtitleOff ? '자막 끄기' : '한국어'}
        </button>
      </div>
    );
  }

  // ── 렌더: 마이크 모드 (누르고 있는 동안 녹음) ──────────────────────────────
  // 버블은 인식된 텍스트를 그대로 보여준다(말하는 중 + 뗀 뒤 ~1.2초). 전송 확인은 버튼 초록 ✓로.
  const bubbleText = interimText;

  return (
    <div className={`${FAB_WRAPPER_CLASS} flex flex-col items-end gap-2`}>
      {isPickerOpen && <LangPicker onChoose={chooseLang} onClose={() => setIsPickerOpen(false)} />}

      {bubbleText && (
        <div
          className="max-w-[240px] rounded-2xl bg-white px-4 py-2 text-sm text-[#4A3728] shadow-lg ring-1 ring-[#EADBC8]"
          dir="auto"
        >
          {bubbleText}
        </div>
      )}

      {/* 짧은 탭 사용법 힌트 — 학생이 고른 언어로 '꾹 누른 채 말하기' 안내 */}
      {holdHint && !isRecording && !bubbleText && lang && (
        <div
          className="max-w-[240px] animate-bounce rounded-2xl bg-[#4A3728] px-4 py-2 text-sm font-bold text-white shadow-lg"
          dir="auto"
        >
          {holdHintFor(lang.iso)}
        </div>
      )}

      <div className="relative">
        {/* 언어 코너 칩 — 탭하면 피커 다시 열림 */}
        <button
          type="button"
          onClick={() => setIsPickerOpen((open) => !open)}
          className="absolute -left-2 -top-2 z-10 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-[#8B5E3C] shadow ring-1 ring-[#EADBC8]"
          dir="auto"
        >
          {lang.label}
        </button>

        <button
          type="button"
          // 누르고 있는 동안 녹음 (마우스·터치·펜 모두 지원).
          // 포인터 캡처로 손/마우스가 버튼 밖으로 살짝 나가도 뗄 때까지 녹음이 끊기지 않게 한다.
          onPointerDown={(e) => {
            e.preventDefault();
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              /* 캡처 미지원 환경은 무시 */
            }
            pressStartedAtRef.current = Date.now();
            startRecording();
          }}
          onPointerUp={() => {
            stopRecording();
            // 짧게 탭만 했다면(누른 채 말하기를 모르는 것) 학생 언어로 사용법 힌트를 띄운다.
            if (Date.now() - pressStartedAtRef.current < MIN_HOLD_MS) {
              setHoldHint(true);
              if (holdHintTimerRef.current) clearTimeout(holdHintTimerRef.current);
              holdHintTimerRef.current = setTimeout(() => setHoldHint(false), 3500);
            }
          }}
          onPointerCancel={stopRecording}
          onContextMenu={(e) => e.preventDefault()}
          aria-label="누르고 있는 동안 말하기"
          className={`flex h-16 w-16 select-none items-center justify-center rounded-full text-white shadow-lg transition-transform ${
            isRecording
              ? 'animate-pulse bg-red-500 scale-110'
              : sendState === 'sent'
              ? 'bg-green-500'
              : 'bg-[#8B5E3C] hover:scale-105'
          }`}
          style={{ touchAction: 'none' }}
        >
          {sendState === 'sent' ? <Check className="h-7 w-7" /> : <Mic className="h-7 w-7" />}
        </button>
      </div>
    </div>
  );
};

// 언어 피커 팝업 (6개 옵션)
const LangPicker: React.FC<{
  onChoose: (option: VoiceLangOption) => void;
  onClose: () => void;
}> = ({ onChoose, onClose }) => (
  <div className="w-52 rounded-2xl bg-white p-2 shadow-xl ring-1 ring-[#EADBC8]">
    <div className="flex items-center justify-between px-2 pb-1 pt-0.5">
      <span className="text-[11px] font-semibold text-[#8B7E74]">언어 · Language</span>
      <button
        type="button"
        onClick={onClose}
        className="text-[11px] text-[#A89F94] hover:text-[#4A3728]"
      >
        ✕
      </button>
    </div>
    <div className="grid grid-cols-2 gap-1.5">
      {VOICE_LANG_OPTIONS.map((option) => (
        <button
          key={option.iso}
          type="button"
          onClick={() => onChoose(option)}
          dir="auto"
          className="rounded-xl bg-[#FFF5E9] px-3 py-2 text-sm font-semibold text-[#8B5E3C] transition-colors hover:bg-[#F6E7D3]"
        >
          {option.label}
        </button>
      ))}
      {/* 되돌리기용 한국어 — 외국어를 잘못 골랐던 학생이 번역·마이크를 끄는 선택지(자막은 한국어로 뜬다) */}
      <button
        type="button"
        onClick={() => onChoose(KOREAN_LANG_OPTION)}
        className="col-span-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-[#8B7E74] ring-1 ring-[#EADBC8] transition-colors hover:bg-[#F9F7F3]"
      >
        한국어 · 번역 없음
      </button>
      {/* 자막 끄기 — 교사 방송 자막을 아예 안 받고 싶은 학생용(CC 취소선). 맨 끝에 둔다. */}
      <button
        type="button"
        onClick={() => onChoose(SUBTITLE_OFF_OPTION)}
        className="col-span-2 flex items-center justify-center gap-1.5 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-[#8B7E74] ring-1 ring-[#EADBC8] transition-colors hover:bg-[#F9F7F3]"
      >
        <CaptionsOff className="h-4 w-4" />
        자막 끄기
      </button>
    </div>
  </div>
);
