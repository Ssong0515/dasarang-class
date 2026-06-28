import { Classroom, CurriculumSessionStatus } from '../types';

/**
 * 강사비(수업료) 집계 유틸.
 *
 * 핵심 모델: 강사비는 한 반의 회차(수업일)를 '완료(done)'로 표시할 때 적립된 것으로 본다.
 * 회차의 날짜·진행상태는 전부 반별 `Classroom.sessionStates[sessionId] = { date, status }`에 저장되므로,
 * 커리큘럼 원본 없이 sessionStates만으로 "언제 얼마를 벌었는지/벌 예정인지"를 계산할 수 있다.
 */

/** 한 회차(수업일)당 강사비(원) = 시수 단가 × 회차당 시수. 단가가 없으면 0. */
export const getPerSessionFee = (
  classroom: Pick<Classroom, 'feePerHour' | 'hoursPerSession'>
): number => {
  const rate = Number(classroom.feePerHour);
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  const hoursRaw = Number(classroom.hoursPerSession);
  const hours = Number.isFinite(hoursRaw) && hoursRaw > 0 ? hoursRaw : 1;
  return Math.round(rate * hours);
};

/**
 * 달력 셀처럼 좁은 자리에 쓰는 짧은 금액 표기(단위: 만원).
 * 80000 → "8", 85000 → "8.5", 0 이하 → "".  (앞에 "+", 뒤에 "만"은 호출부에서 붙인다)
 */
export const formatFeeShort = (won: number): string => {
  if (!won || won <= 0) return '';
  // 0.1만(1,000원) 단위로 반올림해서 표기한다. 반올림 후 정수면 소수점을 떼서 "10.0" 같은 표기를 막는다.
  const rounded = Math.round(won / 1000) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : `${rounded.toFixed(1)}`;
};

/** "320,000원"처럼 전체 금액을 원 단위로 표기. */
export const formatWon = (won: number): string =>
  `${Math.round(won || 0).toLocaleString('ko-KR')}원`;

/** "32만원"처럼 만원 단위로 표기(요약·라벨용). 만원 미만이면 원 단위로 폴백. */
export const formatMan = (won: number): string => {
  if (!won || won <= 0) return '0원';
  if (won < 10000) return formatWon(won);
  // 0.1만(1,000원) 단위로 반올림. 반올림 후 정수면 소수점을 떼서 "10.0만원" 같은 표기를 막는다.
  const rounded = Math.round(won / 1000) / 10;
  return Number.isInteger(rounded)
    ? `${rounded.toLocaleString('ko-KR')}만원`
    : `${rounded.toFixed(1)}만원`;
};

/** 한 날짜에 잡힌 한 반의 회차 한 건. */
export interface DayEarningEntry {
  classroomId: string;
  classroomName: string;
  color?: string;
  status: CurriculumSessionStatus;
  /** 이 회차의 강사비(원). 단가 미설정 반은 0. */
  fee: number;
}

/** 하루치 강사비 집계. */
export interface DayEarning {
  dateStr: string;
  /** 완료(done)한 회차 강사비 합. */
  earned: number;
  /** 건너뜀(skipped)을 제외한(예정+완료) 회차 강사비 합. */
  expected: number;
  entries: DayEarningEntry[];
}

/** 한 반의 한 달치 강사비 집계. */
export interface ClassEarning {
  classroomId: string;
  classroomName: string;
  color?: string;
  earned: number;
  expected: number;
  doneCount: number;
  scheduledCount: number;
}

/** 여러 반을 합친 한 달치 강사비 집계 결과. */
export interface MonthEarnings {
  /** 날짜(YYYY-MM-DD) → 그날의 집계. 회차가 잡힌 날만 들어 있다. */
  byDate: Map<string, DayEarning>;
  totalEarned: number;
  totalExpected: number;
  /** 완료한 회차 수. */
  doneCount: number;
  /** 건너뜀을 제외한 잡힌 회차 수. */
  scheduledCount: number;
  perClass: ClassEarning[];
}

const monthPrefix = (year: number, month0: number): string =>
  `${year}-${String(month0 + 1).padStart(2, '0')}`;

const pad2 = (value: number): string => String(value).padStart(2, '0');

type FeeClassroom = Pick<
  Classroom,
  'id' | 'name' | 'color' | 'feePerHour' | 'hoursPerSession' | 'sessionStates'
>;

/**
 * 여러 반의 sessionStates를 모아 특정 달(month0: 0=1월)의 강사비를 집계한다.
 * 단가가 없는 반도 일정 점(dot)은 보여줄 수 있도록 entries에는 포함하되 금액은 0으로 둔다.
 */
export const buildMonthEarnings = (
  classrooms: FeeClassroom[],
  year: number,
  month0: number
): MonthEarnings => {
  const prefix = `${monthPrefix(year, month0)}-`;
  const byDate = new Map<string, DayEarning>();
  const perClass: ClassEarning[] = [];
  let totalEarned = 0;
  let totalExpected = 0;
  let doneCount = 0;
  let scheduledCount = 0;

  for (const classroom of classrooms) {
    const fee = getPerSessionFee(classroom);
    const states = classroom.sessionStates || {};
    let cEarned = 0;
    let cExpected = 0;
    let cDone = 0;
    let cScheduled = 0;

    for (const state of Object.values(states)) {
      const date = state?.date;
      if (!date || !date.startsWith(prefix)) continue;
      const status: CurriculumSessionStatus = state?.status || 'planned';

      let day = byDate.get(date);
      if (!day) {
        day = { dateStr: date, earned: 0, expected: 0, entries: [] };
        byDate.set(date, day);
      }
      day.entries.push({
        classroomId: classroom.id,
        classroomName: classroom.name,
        color: classroom.color,
        status,
        fee,
      });

      if (status === 'skipped') continue;

      day.expected += fee;
      cExpected += fee;
      cScheduled += 1;
      if (status === 'done') {
        day.earned += fee;
        cEarned += fee;
        cDone += 1;
      }
    }

    perClass.push({
      classroomId: classroom.id,
      classroomName: classroom.name,
      color: classroom.color,
      earned: cEarned,
      expected: cExpected,
      doneCount: cDone,
      scheduledCount: cScheduled,
    });
    totalEarned += cEarned;
    totalExpected += cExpected;
    doneCount += cDone;
    scheduledCount += cScheduled;
  }

  return { byDate, totalEarned, totalExpected, doneCount, scheduledCount, perClass };
};

/**
 * 한 달 달력 칸 목록. 첫 주 빈칸은 null, 날짜 칸은 "YYYY-MM-DD" 문자열.
 * (일요일 시작 7열 그리드 기준)
 */
export const getMonthDateCells = (year: number, month0: number): Array<string | null> => {
  const firstDow = new Date(year, month0, 1).getDay();
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const cells: Array<string | null> = [];
  for (let i = 0; i < firstDow; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(`${monthPrefix(year, month0)}-${pad2(day)}`);
  }
  return cells;
};
