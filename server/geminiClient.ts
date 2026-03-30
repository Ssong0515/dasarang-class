import { GoogleGenAI } from '@google/genai';

const GEMINI_API_KEY_PLACEHOLDER = 'MY_GEMINI_API_KEY';
const DEFAULT_GEMINI_MODEL = 'gemini-3-flash-preview';

const INVALID_KEY_PATTERN =
  /api key not valid|please pass a valid api key|invalid api key|api_key_invalid/i;
const QUOTA_PATTERN = /quota|rate limit|resource exhausted|429/i;
const OVERLOAD_PATTERN = /503|unavailable|overloaded|temporarily unavailable|high demand/i;
const NETWORK_PATTERN = /network|fetch failed|timed out|timeout|econnreset|enotfound|socket hang up/i;

const normalizeEnvValue = (value?: string | null) => (typeof value === 'string' ? value.trim() : '');

const getRawErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;

    if (typeof record.error === 'string' && record.error.trim()) {
      return record.error.trim();
    }

    if (record.error && typeof record.error === 'object') {
      const nestedMessage = getRawErrorMessage(record.error);
      if (nestedMessage) {
        return nestedMessage;
      }
    }

    if (typeof record.message === 'string' && record.message.trim()) {
      return record.message.trim();
    }
  }

  return '';
};

export const getGeminiApiKey = () => {
  const apiKey = normalizeEnvValue(process.env.GEMINI_API_KEY);

  if (!apiKey || apiKey === GEMINI_API_KEY_PLACEHOLDER) {
    throw new Error('로컬 Gemini 키 설정이 필요합니다. .env의 GEMINI_API_KEY를 확인하세요.');
  }

  return apiKey;
};

export const createGeminiClient = () => new GoogleGenAI({ apiKey: getGeminiApiKey() });

export const getGeminiTranslationModel = () =>
  normalizeEnvValue(process.env.GEMINI_TRANSLATION_MODEL) || DEFAULT_GEMINI_MODEL;

export const getGeminiClassNoteModel = () =>
  normalizeEnvValue(process.env.GEMINI_CLASS_NOTE_MODEL) || getGeminiTranslationModel();

export const normalizeGeminiErrorMessage = (
  error: unknown,
  fallback = 'Gemini 요청에 실패했습니다. 잠시 후 다시 시도하세요.'
) => {
  const rawMessage = getRawErrorMessage(error);

  if (!rawMessage) {
    return fallback;
  }

  if (
    rawMessage === 'GEMINI_API_KEY is not configured.' ||
    rawMessage.includes('로컬 Gemini 키 설정이 필요합니다.') ||
    /GEMINI_API_KEY/.test(rawMessage)
  ) {
    return '로컬 Gemini 키 설정이 필요합니다. .env의 GEMINI_API_KEY를 확인하세요.';
  }

  if (INVALID_KEY_PATTERN.test(rawMessage)) {
    return 'Gemini API 키가 유효하지 않습니다. 로컬 .env의 GEMINI_API_KEY를 새 키로 업데이트하세요.';
  }

  if (QUOTA_PATTERN.test(rawMessage)) {
    return 'Gemini 사용량 한도에 도달했습니다. 잠시 후 다시 시도하거나 API 키 상태를 확인하세요.';
  }

  if (OVERLOAD_PATTERN.test(rawMessage)) {
    return 'Gemini 서버가 일시적으로 바쁩니다. 잠시 후 다시 시도하세요.';
  }

  if (NETWORK_PATTERN.test(rawMessage)) {
    return 'Gemini 서버에 연결하지 못했습니다. 네트워크와 키 설정을 확인하세요.';
  }

  if (/response was empty/i.test(rawMessage)) {
    return 'Gemini 응답이 비어 있습니다. 잠시 후 다시 시도하세요.';
  }

  return rawMessage;
};
