import { getCalendarDb } from '../firebaseAdmin';

const CALENDAR_EVENTS_COLLECTION = 'calendar-events';

/**
 * calendar.damuna.org 데이터는 이 앱에서 읽기 전용이다.
 * (일정 추가·수정은 calendar.damuna.org에서 직접 한다. 과거의 수업 기록 →
 * 달력 자동 동기화(clsrec_ 이벤트)는 달력에 중복 표시를 만들어 제거했다.)
 */
export const listCalendarEvents = async (filters: { dateFrom?: string; dateTo?: string } = {}) => {
  const snap = await getCalendarDb().collection(CALENDAR_EVENTS_COLLECTION).get();
  let events = snap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as { date?: string; title?: string; time?: string }),
  }));

  if (filters.dateFrom) {
    events = events.filter((event) => (event.date || '') >= filters.dateFrom!);
  }
  if (filters.dateTo) {
    events = events.filter((event) => (event.date || '') <= filters.dateTo!);
  }

  events.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  return events;
};
