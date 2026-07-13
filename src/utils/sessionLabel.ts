import { CurriculumSession } from '../types';

/**
 * 커리큘럼 회차 표시 라벨을 만든다 — "{order}회차{separator}{topic}".
 *
 * ★ 중복 방지: 이 프로젝트의 커리큘럼 관행상 topic이 이미 "{order}회차. 제목"처럼
 * 회차 번호를 품고 저장되는 경우가 많다. 그럴 때 접두사를 다시 붙이면
 * "4회차 · 4회차. …"처럼 회차가 두 번 보인다. 그래서 topic이 이미 "{order}회차"로
 * 시작하면 접두사를 붙이지 않고 topic을 그대로 쓴다.
 *
 * 회차 라벨을 만드는 모든 화면(대시보드 헤딩·캘린더 툴팁·상세 팝업·좋은 수업 목록 등)은
 * 반드시 이 함수를 거쳐서 만들어야 한다. 직접 `${order}회차 · ${topic}`로 이어 붙이면
 * topic에 회차가 박힌 데이터에서 중복이 되살아난다.
 *
 * @param separator 회차 접두사와 topic 사이 구분자. 기본 " · " (일부 화면은 공백 " "만 씀).
 */
export const formatSessionLabel = (
  session: Pick<CurriculumSession, 'order' | 'topic'>,
  separator = ' · '
): string => {
  const topic = (session.topic ?? '').trim();
  return topic.startsWith(`${session.order}회차`)
    ? topic
    : `${session.order}회차${separator}${topic}`;
};
