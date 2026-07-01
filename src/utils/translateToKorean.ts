// 학생 음성 → 한국어 번역이 일어나는 유일한 곳. 지금은 Chrome 내장 Translator API(온디바이스, 무료, 서버·API키 불필요)를
// 쓰지만, 이 파일만 바꾸면(예: 서버의 Google Cloud Translation 호출) 호출부는 그대로 둔 채 구현을 교체할 수 있게 자기완결형으로 둔다.

export interface TranslateResult {
  koreanText: string;
  ok: boolean;
}

/**
 * Chrome 내장 Translator API의 최소 타입 선언. 표준 lib.dom에 아직 없어서 여기서 좁게 정의한다.
 * (스펙: https://developer.chrome.com/docs/ai/translator-api)
 */
type TranslatorAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface TranslatorInstance {
  translate: (input: string) => Promise<string>;
}

interface TranslatorFactory {
  availability: (options: {
    sourceLanguage: string;
    targetLanguage: string;
  }) => Promise<TranslatorAvailability>;
  create: (options: {
    sourceLanguage: string;
    targetLanguage: string;
  }) => Promise<TranslatorInstance>;
}

/**
 * 학생 언어(sourceIso, 예 'ru','zh','vi','ur','tl','en')를 한국어로 번역한다.
 * - Translator API가 없거나 이 언어쌍이 unavailable이거나 어떤 오류든 나면 원문을 그대로 돌려주고 ok:false.
 * - 브라우저가 모델을 아직 안 받았어도(downloadable/downloading) create()가 다운로드를 처리하니 시도한다.
 */
export async function translateToKorean(text: string, sourceIso: string): Promise<TranslateResult> {
  const fallback: TranslateResult = { koreanText: text, ok: false };

  try {
    if (typeof self === 'undefined' || !('Translator' in self)) {
      return fallback;
    }

    // 이미 한국어면 번역할 필요 없음.
    if (sourceIso === 'ko') {
      return { koreanText: text, ok: true };
    }

    const Translator = (self as unknown as { Translator: TranslatorFactory }).Translator;

    const availability = await Translator.availability({
      sourceLanguage: sourceIso,
      targetLanguage: 'ko',
    });

    if (availability === 'unavailable') {
      return fallback;
    }

    const translator = await Translator.create({
      sourceLanguage: sourceIso,
      targetLanguage: 'ko',
    });
    const out = await translator.translate(text);

    if (typeof out !== 'string' || out.trim().length === 0) {
      return fallback;
    }

    return { koreanText: out, ok: true };
  } catch {
    return fallback;
  }
}
