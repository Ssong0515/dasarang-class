import { GoogleGenAI } from '@google/genai';
import { normalizeGeminiErrorMessage } from './geminiClient';

// 학생 페이지 헤더 언어 선택(코드)과의 하위호환 매핑. 실습 번역 버튼은 임의 언어명(예: "Vietnamese", "러시아어")도 보낼 수 있다.
const LANGUAGE_CODE_NAMES: Record<string, string> = {
  EN: 'English',
  RU: 'Russian',
  ZH: 'Chinese (Simplified)',
};

const MAX_TRANSLATION_TEXT_LENGTH = 12000;
const MAX_TARGET_LANGUAGE_LENGTH = 60;
const DEFAULT_TRANSLATION_MODEL = 'gemini-3-flash-preview';

/** 언어 코드(EN/RU/ZH) 또는 임의 언어명. 학생마다 사용 언어가 다양해 고정 목록으로 제한하지 않는다. */
export type TranslationLanguage = string;

export interface TranslatePayload {
  text: string;
  targetLanguage: TranslationLanguage;
}

// 코드면 영어 표기로, 아니면 받은 언어명을 그대로 Gemini에 넘긴다(Gemini가 다양한 언어명을 이해).
const resolveLanguageName = (targetLanguage: string): string =>
  LANGUAGE_CODE_NAMES[targetLanguage] ?? targetLanguage;

const getApiKey = () => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  return apiKey;
};

const buildPrompt = (text: string, targetLanguage: TranslationLanguage) => `Translate the following Korean text into ${resolveLanguageName(targetLanguage)}.

IMPORTANT: This is for a Korean language learning app.
- DO NOT translate specific Korean vocabulary words or examples written in Hangul.
- Keep them in their original Hangul form so students can learn them.
- Only translate the surrounding explanation, context, and instructions.
- If a word is in quotes like '사과', definitely keep it as '사과'.

Text to translate:
${text}`;

export const validateTranslatePayload = (payload: unknown): TranslatePayload => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Request body must be a JSON object.');
  }

  const text = typeof (payload as { text?: unknown }).text === 'string'
    ? (payload as { text: string }).text.trim()
    : '';
  const targetLanguageRaw = (payload as { targetLanguage?: unknown }).targetLanguage;
  const targetLanguage = typeof targetLanguageRaw === 'string' ? targetLanguageRaw.trim() : '';

  if (!text) {
    throw new Error('text is required.');
  }

  if (text.length > MAX_TRANSLATION_TEXT_LENGTH) {
    throw new Error(`text must be ${MAX_TRANSLATION_TEXT_LENGTH} characters or fewer.`);
  }

  if (!targetLanguage) {
    throw new Error('targetLanguage is required (a language code like EN/RU/ZH or a language name).');
  }

  if (targetLanguage.length > MAX_TARGET_LANGUAGE_LENGTH) {
    throw new Error(`targetLanguage must be ${MAX_TARGET_LANGUAGE_LENGTH} characters or fewer.`);
  }

  return {
    text,
    targetLanguage,
  };
};

export const translateText = async ({ text, targetLanguage }: TranslatePayload) => {
  try {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_TRANSLATION_MODEL || DEFAULT_TRANSLATION_MODEL,
      contents: buildPrompt(text, targetLanguage),
    });

    const translatedText = response.text?.trim();
    if (!translatedText) {
      throw new Error('Translation response was empty.');
    }

    return translatedText;
  } catch (error) {
    throw new Error(normalizeGeminiErrorMessage(error));
  }
};
