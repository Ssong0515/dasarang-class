import type { ClassroomSessionState, CurriculumSession } from '../../src/types';
import { getAdminDb, getCalendarDb } from '../firebaseAdmin';
import { AdminApiError } from './resources';

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

interface CalendarOrg {
  org?: string;
  project?: string;
}

interface CalendarClassDoc {
  name?: string;
  instructor?: string;
  schedules?: CalendarSchedule[];
  exceptions?: CalendarException[];
  startDate?: string;
  endDate?: string;
  /** 기관/단체 목록 (calendar 앱 UI의 "기관/단체명") */
  orgs?: CalendarOrg[];
  /** calendar 앱에서 '숨기기'한 수업 (가져오기 목록에서 제외) */
  hidden?: boolean;
}

export interface CalendarClassSummary {
  id: string;
  name: string;
  instructor: string;
  /** calendar 앱이 강사명으로 산출하는 대표 색(hex) */
  color: string;
  schedules: { days: number[]; start: string; end: string }[];
  startDate: string;
  endDate: string;
  orgs: { org: string; project: string }[];
}

/**
 * calendar 앱(app.js)의 강사 색 팔레트/해시를 그대로 포팅.
 * 캘린더는 수업 색을 강사명으로 결정하므로(없으면 수업명), 동일 로직으로 재현해야 색이 맞는다.
 * (강사별 커스텀 색은 calendar 기기의 localStorage에만 있어 서버에서는 알 수 없다.)
 */
const TAG_PALETTE = [
  '#d32f2f', '#1976d2', '#388e3c', '#f57c00',
  '#7b1fa2', '#00838f', '#c62828', '#283593',
  '#2e7d32', '#ad1457', '#00695c', '#5e35b1',
  '#6d4c41', '#558b2f', '#0277bd', '#e65100',
];

const strToColorIdx = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return hash % TAG_PALETTE.length;
};

const getCalendarClassColor = (instructor: string, name: string) =>
  TAG_PALETTE[strToColorIdx(instructor || name || '')];

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
  color: getCalendarClassColor(data.instructor || '', data.name || ''),
  schedules: (data.schedules || []).map((sched) => ({
    days: sched.days || [],
    start: sched.start || '',
    end: sched.end || '',
  })),
  startDate: data.startDate || '',
  endDate: data.endDate || '',
  orgs: (data.orgs || [])
    .map((org) => ({ org: org.org || '', project: org.project || '' }))
    .filter((org) => org.org || org.project),
});

/** calendar의 참고 시간표 목록 (프론트 선택용) */
export const listCalendarClasses = async (): Promise<CalendarClassSummary[]> => {
  const snap = await getCalendarDb().collection(CLASSES_COLLECTION).get();
  return snap.docs
    .map((doc) => ({ id: doc.id, data: doc.data() as CalendarClassDoc }))
    .filter(({ data }) => !data.hidden)
    .map(({ id, data }) => toSummary(id, data))
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
 * - overwrite=false면 날짜가 비어 있는 회차에만 채움
 * - 날짜가 회차보다 적으면 남는 회차는 그대로 둠
 *
 * 배정된 날짜는 커리큘럼(공유 템플릿)이 아니라 **교실(반)** 문서의 `sessionStates`에 쓴다.
 * 같은 커리큘럼을 여러 반이 공유해도, 반마다 자기 시간표에 맞는 날짜를 따로 갖는다.
 */
export const assignCurriculumDatesFromCalendar = async (
  input: AssignCurriculumDatesInput
) => {
  const classroomId = input.classroomId?.trim();
  if (!classroomId) {
    throw new AdminApiError(400, 'classroomId가 필요합니다.');
  }

  const db = getAdminDb();
  const classroomRef = db.collection('classrooms').doc(classroomId);
  const classroomDoc = await classroomRef.get();
  if (!classroomDoc.exists) {
    throw new AdminApiError(404, `교실 '${classroomId}'을(를) 찾을 수 없습니다.`);
  }
  const classroom = classroomDoc.data() as {
    curriculumId?: string;
    calendarClassId?: string;
    sessionStates?: Record<string, ClassroomSessionState>;
  };

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

  // 이 반의 회차 날짜·상태는 전부 반별(sessionStates)에만 있다. 커리큘럼은 날짜·상태를 갖지 않음.
  const states = classroom.sessionStates || {};
  const resolveDate = (session: CurriculumSession) => states[session.id]?.date || '';
  const resolveStatus = (session: CurriculumSession) => states[session.id]?.status || 'planned';

  const overwrite = input.overwrite !== false;
  const eligible = sessions.filter((session) => {
    const status = resolveStatus(session);
    if (status === 'done' || status === 'skipped') return false;
    if (!overwrite && resolveDate(session)) return false;
    return true;
  });

  // 필요한 만큼만 날짜 계산
  const dates = await getCalendarClassOccurrences(calendarClassId, { limit: eligible.length });

  // 회차 날짜만 반별로 기록 (status 등 다른 반별 상태는 merge:true로 보존)
  const assignedStates: Record<string, { date: string }> = {};
  const assignments: { sessionId: string; order: number; plannedDate: string }[] = [];
  for (let i = 0; i < eligible.length && i < dates.length; i += 1) {
    const session = eligible[i];
    if (resolveDate(session) === dates[i]) continue;
    assignedStates[session.id] = { date: dates[i] };
    assignments.push({ sessionId: session.id, order: session.order, plannedDate: dates[i] });
  }

  if (Object.keys(assignedStates).length > 0) {
    // merge:true 라 다른 회차/다른 필드(status)의 기존 반별 값은 보존된다.
    await classroomRef.set({ sessionStates: assignedStates }, { merge: true });
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
