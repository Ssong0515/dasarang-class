import { GoogleGenAI } from '@google/genai';

const SUPPORTED_LANGUAGES = {
  EN: 'English',
  RU: 'Russian',
  ZH: 'Chinese (Simplified)',
} as const;

const MAX_TRANSLATION_TEXT_LENGTH = 12000;
const DEFAULT_TRANSLATION_MODEL = 'gemini-3-flash-preview';

export type TranslationLanguage = keyof typeof SUPPORTED_LANGUAGES;

export interface TranslatePayload {
  text: string;
  targetLanguage: TranslationLanguage;
}

const getApiKey = () => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  return apiKey;
};

const buildPrompt = (text: string, targetLanguage: TranslationLanguage) => `Translate the following Korean text into ${SUPPORTED_LANGUAGES[targetLanguage]}.

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
  const targetLanguage = (payload as { targetLanguage?: unknown }).targetLanguage;

  if (!text) {
    throw new Error('text is required.');
  }

  if (text.length > MAX_TRANSLATION_TEXT_LENGTH) {
    throw new Error(`text must be ${MAX_TRANSLATION_TEXT_LENGTH} characters or fewer.`);
  }

  if (!targetLanguage || typeof targetLanguage !== 'string' || !(targetLanguage in SUPPORTED_LANGUAGES)) {
    throw new Error('targetLanguage must be one of EN, RU, or ZH.');
  }

  return {
    text,
    targetLanguage: targetLanguage as TranslationLanguage,
  };
};

export const translateText = async ({ text, targetLanguage }: TranslatePayload) => {
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
};
