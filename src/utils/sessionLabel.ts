import { CurriculumSession } from '../types';

/**
 * 커리큘럼 회차 표시 라벨을 만든다 — **제목(topic)에서 맨 앞 "N회차"를 떼어 낸 문자열**.
 *
 * ★ 2026-07-20 변경(사용자 요청): 이론 pptx를 회차와 무관하게 **한 폴더에 모아 재사용**하려면
 *   제목에 회차가 들어가면 안 된다(같은 주제여도 회차가 다르면 다른 제목이 돼 ppt를 못 찾음).
 *   그래서 이 함수는 이제 회차를 **붙이지 않고, 이미 박혀 있으면 떼어 낸다**. 회차 번호는
 *   커리큘럼의 `order`로만 갖고, 화면 제목·ppt 매칭 문자열에는 넣지 않는다.
 *   (이전엔 "{order}회차 · {topic}"으로 회차를 붙였다 — 관행상 topic에 "N회차."가 박혀 오는 경우가 많아서.)
 *
 * 회차 라벨을 만드는 모든 화면(대시보드 헤딩·캘린더 툴팁·상세 팝업·좋은 수업 목록 등)과
 * 이론 동기화(ppt 제목 매칭)는 반드시 이 함수를 거쳐 회차 없는 제목을 쓴다.
 *
 * @param _separator (미사용, 호환용) 예전에 회차 접두사와 topic 사이에 넣던 구분자.
 */
export const formatSessionLabel = (
  session: Pick<CurriculumSession, 'order' | 'topic'>,
  _separator = ' · '
): string => {
  const topic = (session.topic ?? '').trim();
  // 맨 앞 "N회차"(+ 뒤따르는 . · : 구분자·공백)를 떼어 낸다. 예) "4회차. Google Maps …" → "Google Maps …".
  const withoutSession = topic.replace(/^\s*\d+\s*회차\s*[.·:]?\s*/, '').trim();
  return withoutSession || topic;
};
