// 강사가 자유 입력한 학생 언어 텍스트(예: "러시아어", "베트남")를 음성 기능이 쓰는 VOICE_LANG_OPTIONS의 iso 코드로
// 매핑한다. VOICE_LANG_OPTIONS가 언어의 단일 출처이므로 코드 목록은 거기서 가져온다.
// 매핑되지 않는 언어면 에러를 던지지 않고 null을 돌려준다 — 호출 쪽에서 조용히 스킵하도록.
import { VOICE_LANG_OPTIONS } from '../components/StudentVoiceButton';

// 각 iso별 한국어 표기 변형 + 자기 문자/영문 표기. 정규화(소문자·공백제거)한 학생 언어 문자열에
// 아래 키워드가 하나라도 포함되면 그 iso로 본다. (자유 입력이라 표기 흔들림을 넉넉히 커버)
const LANGUAGE_ALIASES: { iso: string; keywords: string[] }[] = [
  { iso: 'ru', keywords: ['러시아', 'russian', 'русск'] },
  { iso: 'zh', keywords: ['중국', '중문', 'chinese', 'mandarin', '中文', '汉语', '漢語'] },
  { iso: 'vi', keywords: ['베트남', 'vietnam', 'việt', 'tiếngviệt'] },
  { iso: 'ur', keywords: ['우르두', 'urdu', 'اردو', '파키스탄'] },
  { iso: 'tl', keywords: ['타갈로그', '따갈로그', '필리핀', 'tagalog', 'filipino'] },
  { iso: 'en', keywords: ['영어', 'english', '잉글리시'] },
];

/**
 * Student.language(자유 텍스트) → VOICE_LANG_OPTIONS의 iso 코드. 매핑 실패 시 null.
 * 대소문자·공백을 무시하고, iso 코드 자체("ru" 등)로 적혀 있어도 인식한다.
 */
export function mapStudentLanguageToIso(language: string | null | undefined): string | null {
  if (typeof language !== 'string') return null;
  const normalized = language.trim().toLowerCase().replace(/\s+/g, '');
  if (!normalized) return null;

  // iso 코드를 그대로 적은 경우("ru", "zh" 등)를 먼저 받는다.
  const direct = VOICE_LANG_OPTIONS.find((option) => option.iso === normalized);
  if (direct) return direct.iso;

  for (const { iso, keywords } of LANGUAGE_ALIASES) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return iso;
    }
  }

  return null;
}
