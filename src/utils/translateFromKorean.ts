// translateToKorean.ts의 반대 방향 — 한국어 원문을 여러 대상 언어로 한 번에 번역한다(교사 방송용).
// translateToKorean.ts와 마찬가지로 Chrome 내장 Translator API(온디바이스, 무료, 서버·API키 불필요)만 쓰고,
// 이 파일만 바꾸면 구현을 교체할 수 있게 자기완결형으로 둔다. 폴백 컨벤션도 translateToKorean.ts와 동일하다.

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
 * 한국어 텍스트를 targetCodes의 각 언어(예 'ru','zh','vi','ur','tl','en')로 번역해 `{ [code]: 번역텍스트 }`로 모아 돌려준다.
 * - targetCodes가 비어 있으면(출석 언어 0개) Translator API를 호출하지 않고 즉시 빈 객체를 돌려준다.
 * - 개별 언어 번역이 실패하거나(오류·unavailable) Translator API가 없으면, 그 언어만 한국어 원문으로 폴백하고 나머지는 계속 진행한다.
 *   (translateToKorean.ts가 실패 시 원문을 그대로 돌려주는 것과 같은 컨벤션)
 */
export async function translateFromKorean(
  text: string,
  targetCodes: string[]
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const source = text.trim();

  // 중복 제거 + 빈 코드 제거.
  const codes = Array.from(new Set(targetCodes.filter((code) => typeof code === 'string' && code)));
  if (!source || codes.length === 0) {
    return result;
  }

  const hasTranslator = typeof self !== 'undefined' && 'Translator' in self;
  if (!hasTranslator) {
    // 번역기 자체가 없으면 각 언어에 원문(한국어)으로 폴백 — 학생이 최소한 원문은 볼 수 있게.
    for (const code of codes) {
      result[code] = source;
    }
    return result;
  }

  const Translator = (self as unknown as { Translator: TranslatorFactory }).Translator;

  await Promise.all(
    codes.map(async (code) => {
      // 이미 한국어면 번역할 필요 없음.
      if (code === 'ko') {
        result[code] = source;
        return;
      }
      try {
        const availability = await Translator.availability({
          sourceLanguage: 'ko',
          targetLanguage: code,
        });
        if (availability === 'unavailable') {
          result[code] = source;
          return;
        }
        const translator = await Translator.create({
          sourceLanguage: 'ko',
          targetLanguage: code,
        });
        const out = await translator.translate(source);
        result[code] = typeof out === 'string' && out.trim().length > 0 ? out : source;
      } catch {
        result[code] = source;
      }
    })
  );

  return result;
}
