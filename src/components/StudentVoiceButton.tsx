import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Globe, Check } from 'lucide-react';
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

const VOICE_LANG_STORAGE_KEY = 'dsr_voice_lang';
const LANG_MAX_AGE_MS = 3 * 60 * 60 * 1000; // 3시간

interface StoredVoiceLang {
  iso: string;
  stt: string;
  label: string;
  setAt: string; // ISO
  classKey: string; // `${classroomId}_${date}`
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
  const classKey = `${classroomId ?? ''}_${date}`;
  const speechSupported = getSpeechRecognitionCtor() !== null;

  const [lang, setLang] = useState<VoiceLangOption | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [sendState, setSendState] = useState<SendState>('idle');

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTextRef = useRef('');
  const sentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  };

  const finishAndSend = useCallback(async () => {
    const text = finalTextRef.current.trim();
    finalTextRef.current = '';
    setInterimText('');
    if (!text || !lang) return;

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
    if (!lang || isRecording) return;
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    let recognition: SpeechRecognitionLike;
    try {
      recognition = new Ctor();
    } catch {
      return;
    }
    recognition.lang = lang.stt;
    recognition.interimResults = true;
    recognition.continuous = true;

    finalTextRef.current = '';
    setInterimText('');

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
      setIsRecording(false);
      recognitionRef.current = null;
      void finishAndSend();
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsRecording(true);
    } catch {
      recognitionRef.current = null;
    }
  }, [lang, isRecording, finishAndSend]);

  const stopRecording = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    try {
      recognition.stop(); // onend에서 finishAndSend 호출
    } catch {
      /* 무시 */
    }
  }, []);

  // ── 렌더: 미지원 브라우저 ────────────────────────────────────────────────
  if (!speechSupported) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
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

  // ── 렌더: 언어 미선택 → 프롬프트 + 피커 ────────────────────────────────────
  if (!lang) {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
        {isPickerOpen && (
          <LangPicker onChoose={chooseLang} onClose={() => setIsPickerOpen(false)} />
        )}
        <button
          type="button"
          onClick={() => setIsPickerOpen((open) => !open)}
          className="flex items-center gap-2 rounded-full bg-[#FFF5E9] px-4 py-3 text-sm font-semibold text-[#8B5E3C] shadow-lg ring-1 ring-[#EADBC8] transition-transform hover:scale-105"
        >
          <Globe className="h-5 w-5" />
          <span>Choose language · 언어 선택</span>
        </button>
      </div>
    );
  }

  // ── 렌더: 마이크 모드 (누르고 있는 동안 녹음) ──────────────────────────────
  const bubbleText =
    sendState === 'sent'
      ? '보냈어요 ✓'
      : sendState === 'sending'
      ? '보내는 중…'
      : interimText;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {isPickerOpen && <LangPicker onChoose={chooseLang} onClose={() => setIsPickerOpen(false)} />}

      {bubbleText && (
        <div
          className="max-w-[240px] rounded-2xl bg-white px-4 py-2 text-sm text-[#4A3728] shadow-lg ring-1 ring-[#EADBC8]"
          dir="auto"
        >
          {bubbleText}
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
            startRecording();
          }}
          onPointerUp={stopRecording}
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
    </div>
  </div>
);
