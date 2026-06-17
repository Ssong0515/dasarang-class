import type { CurriculumSession } from '../../src/types';
import { getAdminDb, getCalendarDb } from '../firebaseAdmin';
import { AdminApiError } from './resources';
import { mutateCurriculumSessions, type CurriculumSessionOp } from './services';

const CLASSES_COLLECTION = 'classes';

/** calendar.damuna.org `classes` 문서 1건의 시간표 규칙 */
interface CalendarSchedule {
  days?: number[];
  start?: string;
  end?: string;
}

interface CalendarException {
  type?: string;
  sourceDate?: string;
  targetDate?: string;
  scheduleKey?: string;
}

interface CalendarClassDoc {
  name?: string;
  instructor?: string;
  schedules?: CalendarSchedule[];
  exceptions?: CalendarException[];
  startDate?: string;
  endDate?: string;
}

export interface CalendarClassSummary {
  id: string;
  name: string;
  instructor: string;
  schedules: { days: number[]; start: string; end: string }[];
  startDate: string;
  endDate: string;
}

const pad2 = (value: number) => String(value).padStart(2, '0');
const makeDateStr = (year: number, month: number, day: number) =>
  `${year}-${pad2(month)}-${pad2(day)}`;

/** calendar 앱과 동일한 schedule 식별자 (cancel 예외 매칭용) */
const getScheduleKey = (sched: CalendarSchedule, index: number) =>
  `${index}:${(sched.days || []).join(',')}:${sched.start || ''}-${sched.end || ''}`;

const toSummary = (id: string, data: CalendarClassDoc): CalendarClassSummary => ({
  id,
  name: data.name || '',
  instructor: data.instructor || '',
  schedules: (data.schedules || []).map((sched) => ({
    days: sched.days || [],
    start: sched.start || '',
    end: sched.end || '',
  })),
  startDate: data.startDate || '',
  endDate: data.endDate || '',
});

/** calendar의 참고 시간표 목록 (프론트 선택용) */
export const listCalendarClasses = async (): Promise<CalendarClassSummary[]> => {
  const snap = await getCalendarDb().collection(CLASSES_COLLECTION).get();
  return snap.docs
    .map((doc) => toSummary(doc.id, doc.data() as CalendarClassDoc))
    .sort((a, b) => a.name.localeCompare(b.name));
};

const MAX_LOOKAHEAD_DAYS = 730; // endDate가 없을 때 안전 상한 (약 2년)

/**
 * calendar 시간표를 실제 수업 날짜 배열로 펼친다.
 * - 월=0…토=5 (일요일 제외), startDate~endDate 범위 내
 * - cancel 예외 제외, makeup 예외 추가
 * - limit개를 채우면 조기 종료 (endDate가 없는 시간표 대응)
 */
export const computeOccurrenceDates = (
  data: CalendarClassDoc,
  options: { limit?: number; from?: string } = {}
): string[] => {
  const schedules = data.schedules || [];
  const exceptions = data.exceptions || [];
  const startBound = data.startDate || options.from || '';
  const endBound = data.endDate || '';

  const canceled = new Set(
    exceptions
      .filter((ex) => ex.type === 'cancel' && ex.sourceDate && ex.scheduleKey)
      .map((ex) => `${ex.sourceDate}|${ex.scheduleKey}`)
  );

  const dates = new Set<string>();

  // 정규 반복 일정 펼치기
  const cursor = startBound ? new Date(`${startBound}T00:00:00`) : new Date();
  cursor.setHours(0, 0, 0, 0);
  for (let step = 0; step < MAX_LOOKAHEAD_DAYS; step += 1) {
    const dateStr = makeDateStr(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate());
    if (endBound && dateStr > endBound) break;
    if (options.limit && dates.size >= options.limit) break;

    const dow = cursor.getDay();
    if (dow !== 0) {
      const dayIdx = dow - 1; // 월=0 … 토=5
      schedules.forEach((sched, index) => {
        if (!(sched.days || []).includes(dayIdx)) return;
        if (canceled.has(`${dateStr}|${getScheduleKey(sched, index)}`)) return;
        dates.add(dateStr);
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  // 보강(makeup) 예외 추가
  for (const ex of exceptions) {
    if (ex.type !== 'makeup' || !ex.targetDate) continue;
    if (startBound && ex.targetDate < startBound) continue;
    if (endBound && ex.targetDate > endBound) continue;
    const target = new Date(`${ex.targetDate}T00:00:00`);
    if (target.getDay() === 0) continue;
    dates.add(ex.targetDate);
  }

  return [...dates].sort((a, b) => a.localeCompare(b));
};

/** 특정 calendar 수업의 실제 수업 날짜 목록 */
export const getCalendarClassOccurrences = async (
  classId: string,
  options: { limit?: number } = {}
): Promise<string[]> => {
  const doc = await getCalendarDb().collection(CLASSES_COLLECTION).doc(classId).get();
  if (!doc.exists) {
    throw new AdminApiError(404, `calendar 수업 '${classId}'을(를) 찾을 수 없습니다.`);
  }
  return computeOccurrenceDates(doc.data() as CalendarClassDoc, options);
};

export interface AssignCurriculumDatesInput {
  classroomId: string;
  /** 미지정 시 교실에 연결된 calendarClassId 사용 */
  calendarClassId?: string;
  /** 이미 plannedDate가 있는 회차도 덮어쓸지 (기본 true) */
  overwrite?: boolean;
}

/**
 * 교실에 연결된 calendar 시간표의 수업 날짜들을, 교실 커리큘럼 회차에 순서대로 배정.
 * - 회차 order 순으로 정렬, done/skipped 회차는 건너뜀
 * - overwrite=false면 plannedDate가 비어 있는 회차에만 채움
 * - 날짜가 회차보다 적으면 남는 회차는 그대로 둠
 */
export const assignCurriculumDatesFromCalendar = async (
  input: AssignCurriculumDatesInput
) => {
  const classroomId = input.classroomId?.trim();
  if (!classroomId) {
    throw new AdminApiError(400, 'classroomId가 필요합니다.');
  }

  const db = getAdminDb();
  const classroomDoc = await db.collection('classrooms').doc(classroomId).get();
  if (!classroomDoc.exists) {
    throw new AdminApiError(404, `교실 '${classroomId}'을(를) 찾을 수 없습니다.`);
  }
  const classroom = classroomDoc.data() as { curriculumId?: string; calendarClassId?: string };

  const calendarClassId = input.calendarClassId?.trim() || classroom.calendarClassId || '';
  if (!calendarClassId) {
    throw new AdminApiError(
      400,
      '연결된 참고 시간표가 없습니다. calendarClassId를 지정하거나 교실에 시간표를 먼저 연결하세요.'
    );
  }

  const curriculumId = classroom.curriculumId || '';
  if (!curriculumId) {
    throw new AdminApiError(400, '교실에 연결된 커리큘럼이 없습니다. 먼저 커리큘럼을 연결하세요.');
  }

  const curriculumDoc = await db.collection('curriculums').doc(curriculumId).get();
  if (!curriculumDoc.exists) {
    throw new AdminApiError(404, `커리큘럼 '${curriculumId}'을(를) 찾을 수 없습니다.`);
  }
  const sessions = ((curriculumDoc.data() as { sessions?: CurriculumSession[] }).sessions || [])
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const overwrite = input.overwrite !== false;
  const eligible = sessions.filter((session) => {
    if (session.status === 'done' || session.status === 'skipped') return false;
    if (!overwrite && session.plannedDate) return false;
    return true;
  });

  // 필요한 만큼만 날짜 계산
  const dates = await getCalendarClassOccurrences(calendarClassId, { limit: eligible.length });

  const ops: CurriculumSessionOp[] = [];
  const assignments: { sessionId: string; order: number; plannedDate: string }[] = [];
  for (let i = 0; i < eligible.length && i < dates.length; i += 1) {
    const session = eligible[i];
    if (session.plannedDate === dates[i]) continue;
    ops.push({ type: 'update', sessionId: session.id, session: { plannedDate: dates[i] } });
    assignments.push({ sessionId: session.id, order: session.order, plannedDate: dates[i] });
  }

  if (ops.length > 0) {
    await mutateCurriculumSessions(curriculumId, ops);
  }

  return {
    classroomId,
    calendarClassId,
    curriculumId,
    availableDates: dates.length,
    eligibleSessions: eligible.length,
    assigned: assignments.length,
    assignments,
  };
};
