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

// 개별 언어 번역이 (첫 사용 모델 다운로드 등으로) 오래 걸려도 방송 저장 자체가 막히지 않도록 상한을 둔다.
// 시간을 넘기면 그 언어만 한국어 원문으로 폴백하고 문서는 즉시 저장된다.
const TRANSLATE_TIMEOUT_MS = 8000;

const withTimeout = <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> =>
  new Promise<T>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(fallback);
      }
    }, ms);
    promise
      .then((value) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(value);
        }
      })
      .catch(() => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(fallback);
        }
      });
  });

/**
 * 대상 언어들의 ko→언어 번역 모델을 미리 내려받도록 예열한다(방송 시작 시 호출).
 * 첫 발화가 모델 다운로드로 지연되지 않게 백그라운드에서 미리 준비만 하고, 실패는 조용히 무시한다.
 */
export async function warmUpTranslators(targetCodes: string[]): Promise<void> {
  const codes = Array.from(
    new Set(targetCodes.filter((code) => typeof code === 'string' && code && code !== 'ko'))
  );
  if (codes.length === 0) return;
  if (typeof self === 'undefined' || !('Translator' in self)) return;

  const Translator = (self as unknown as { Translator: TranslatorFactory }).Translator;
  await Promise.all(
    codes.map(async (code) => {
      try {
        const availability = await Translator.availability({
          sourceLanguage: 'ko',
          targetLanguage: code,
        });
        if (availability === 'unavailable') return;
        await Translator.create({ sourceLanguage: 'ko', targetLanguage: code }); // 모델 다운로드 트리거(캐시됨)
      } catch {
        /* 무시 */
      }
    })
  );
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
      // 언어별 번역을 시간 상한 안에서 시도하고, 넘기거나 실패하면 한국어 원문으로 폴백한다.
      result[code] = await withTimeout(
        (async () => {
          try {
            const availability = await Translator.availability({
              sourceLanguage: 'ko',
              targetLanguage: code,
            });
            if (availability === 'unavailable') return source;
            const translator = await Translator.create({
              sourceLanguage: 'ko',
              targetLanguage: code,
            });
            const out = await translator.translate(source);
            return typeof out === 'string' && out.trim().length > 0 ? out : source;
          } catch {
            return source;
          }
        })(),
        TRANSLATE_TIMEOUT_MS,
        source
      );
    })
  );

  return result;
}
