import React, { useMemo, useState } from 'react';
import {
  LayoutGrid,
  BookOpen,
  Calendar,
  StickyNote,
  ArrowRight,
  Star,
  Edit3,
  Users,
  Library,
  GraduationCap,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { motion } from 'motion/react';
import { ClassroomDiagnosticsBanner } from './ClassroomDiagnosticsBanner';
import { Classroom, ClassroomDateRecord, ClassroomLoadDiagnostics, LessonContent } from '../types';
import {
  getClassroomCardColors,
  getClassroomIconComponent,
} from '../utils/classroomAppearance';
import { getStudentCounts } from '../utils/students';
import {
  buildMonthEarnings,
  formatFeeShort,
  formatMan,
  formatWon,
  getMonthDateCells,
} from '../utils/fee';

const EARNINGS_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const getTodayDateStr = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
};

/**
 * 홈 대시보드의 전체 클래스 통합 수업 달력.
 * 각 반 달력처럼 월별 그리드를 보여주되, 모든 반을 한 판에 모아 날짜마다 색점(반)을 띄워
 * 전체 수업 일정을 한눈에 보게 한다. 강사비(시수 단가)를 설정한 반이 있으면 적립액을 보조로 곁들인다.
 */
type CalendarMode = 'class' | 'income';

const MonthlyEarningsCalendar: React.FC<{
  classrooms: Classroom[];
  dateRecords: ClassroomDateRecord[];
  contents: LessonContent[];
  onManageClassroom: (classroom: Classroom, date?: string) => void;
}> = ({ classrooms, dateRecords, contents, onManageClassroom }) => {
  const [view, setView] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [mode, setMode] = useState<CalendarMode>('class');

  const earnings = useMemo(
    () => buildMonthEarnings(classrooms, view.year, view.month),
    [classrooms, view]
  );
  const cells = useMemo(() => getMonthDateCells(view.year, view.month), [view]);

  const classroomById = useMemo(
    () => new Map(classrooms.map((classroom) => [classroom.id, classroom])),
    [classrooms]
  );
  const contentsById = useMemo(
    () => new Map(contents.map((content) => [content.id, content])),
    [contents]
  );
  // 회차(클래스+날짜)별 운영 기록 인덱스. key=`${classroomId}_${date}`.
  const recordByKey = useMemo(() => {
    const map = new Map<string, ClassroomDateRecord>();
    for (const record of dateRecords) {
      map.set(`${record.classroomId}_${record.date}`, record);
    }
    return map;
  }, [dateRecords]);

  // 이론 준비 = 그날 기록에 이론 슬라이드 URL이 1개 이상.
  // 실습 준비 = 그날 기록한 콘텐츠 중 실습(html 있고 slideUrl 없음)이 1개 이상.
  const getReadiness = (classroomId: string, dateStr: string) => {
    const record = recordByKey.get(`${classroomId}_${dateStr}`);
    if (!record) return { theoryReady: false, practiceReady: false };
    const theoryReady =
      // 이론은 실습 콘텐츠에 묶인다 — 그날 배정된 콘텐츠 중 하나라도 theorySlideUrl이 있으면 '이론 준비됨'.
      (record.contentIds || []).some((id) =>
        Boolean(contentsById.get(id)?.theorySlideUrl?.trim())
      ) ||
      // 구버전 폴백: 날짜기록에 직접 붙어 있던 이론 슬라이드/프롬프트 링크.
      (record.theorySlides?.some((slide) => slide.url && slide.url.trim()) ?? false) ||
      (record.theoryPrompts?.some((prompt) => prompt.slideUrl && prompt.slideUrl.trim()) ?? false) ||
      Boolean(record.theorySlideUrl && record.theorySlideUrl.trim());
    const practiceReady = (record.contentIds || []).some((id) => {
      const content = contentsById.get(id);
      return Boolean(
        content && content.html && content.html.trim() && !(content.slideUrl && content.slideUrl.trim())
      );
    });
    return { theoryReady, practiceReady };
  };

  const todayStr = getTodayDateStr();
  const remainingCount = Math.max(earnings.scheduledCount - earnings.doneCount, 0);
  const remainingEarnings = Math.max(earnings.totalExpected - earnings.totalEarned, 0);
  const progress =
    earnings.scheduledCount > 0
      ? Math.round((earnings.doneCount / earnings.scheduledCount) * 100)
      : 0;
  const activeClasses = earnings.perClass.filter((classEarning) => classEarning.scheduledCount > 0);

  const handleEntryClick = (classroomId: string, date: string) => {
    const classroom = classroomById.get(classroomId);
    if (classroom) onManageClassroom(classroom, date);
  };

  const goToMonth = (delta: number) =>
    setView((current) => {
      const next = new Date(current.year, current.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  const goToday = () => {
    const now = new Date();
    setView({ year: now.getFullYear(), month: now.getMonth() });
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-12 overflow-hidden rounded-[40px] border border-[#E5E3DD] bg-white p-4 sm:p-8"
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFF5E9] text-[#8B5E3C]">
            <Calendar size={22} />
          </div>
          <div>
            <h2 className="text-2xl font-serif font-bold text-[#4A3728]">
              {mode === 'income' ? '강사비 달력' : '수업 달력'}
            </h2>
            <p className="text-sm text-[#8B7E74]">
              {mode === 'income'
                ? '완료한 수업으로 번 강사비와 예정 수입을 날짜별로 봅니다.'
                : '모든 클래스의 수업과 이론·실습 준비 상태를 한눈에 봅니다.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={goToday}
              className="rounded-xl border border-[#E5E3DD] px-3 py-1.5 text-xs font-bold text-[#8B7E74] transition-all hover:bg-[#F3F2EE]"
            >
              오늘
            </button>
            <span className="min-w-[110px] text-center text-base font-bold text-[#4A3728]">
              {view.year}년 {view.month + 1}월
            </span>
            <button
              onClick={() => goToMonth(-1)}
              aria-label="이전 달"
              className="rounded-lg p-1.5 text-[#8B7E74] transition-all hover:bg-[#F3F2EE]"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => goToMonth(1)}
              aria-label="다음 달"
              className="rounded-lg p-1.5 text-[#8B7E74] transition-all hover:bg-[#F3F2EE]"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* 요약 카드 — 수입 달력: 번 돈 / 남은 예정 / 한 달 예정 */}
      {mode === 'income' ? (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-[#E0EFE4] bg-[#F4FAF6] p-4">
            <p className="text-[11px] font-bold text-[#6B8E7A]">번 강사비 (완료한 수업)</p>
            <p className="mt-1 text-2xl font-extrabold text-[#2D7A4D]">{formatWon(earnings.totalEarned)}</p>
            <p className="mt-0.5 text-[11px] text-[#8FAE9C]">완료 {earnings.doneCount}회</p>
          </div>
          <div className="rounded-2xl border border-[#EBD9C1] bg-[#FFF9F1] p-4">
            <p className="text-[11px] font-bold text-[#A2906F]">남은 예정 수입</p>
            <p className="mt-1 text-2xl font-extrabold text-[#8B5E3C]">{formatWon(remainingEarnings)}</p>
            <p className="mt-0.5 text-[11px] text-[#B6A488]">남은 수업 {remainingCount}회</p>
          </div>
          <div className="rounded-2xl border border-[#E5E3DD] bg-[#FBFBFA] p-4">
            <p className="text-[11px] font-bold text-[#8B7E74]">이번 달 예정 합계</p>
            <p className="mt-1 text-2xl font-extrabold text-[#4A3728]">{formatWon(earnings.totalExpected)}</p>
            <p className="mt-0.5 text-[11px] text-[#A89F94]">예정 {earnings.scheduledCount}회 기준</p>
          </div>
        </div>
      ) : (
      /* 요약 카드 — 수업(일정) 중심. 강사비는 '강사비' 탭에서만 표시 */
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-[#E5E3DD] bg-[#FBFBFA] p-4">
          <p className="text-[11px] font-bold text-[#8B7E74]">이번 달 수업</p>
          <p className="mt-1 text-2xl font-extrabold text-[#4A3728]">
            {earnings.scheduledCount}
            <span className="text-base">회</span>
          </p>
          <p className="mt-0.5 text-[11px] text-[#A89F94]">
            완료 {earnings.doneCount} · 남음 {remainingCount}
          </p>
        </div>
        <div className="rounded-2xl border border-[#E0EFE4] bg-[#F4FAF6] p-4">
          <p className="text-[11px] font-bold text-[#6B8E7A]">완료한 수업</p>
          <p className="mt-1 text-2xl font-extrabold text-[#2D7A4D]">
            {earnings.doneCount}
            <span className="text-base">회</span>
          </p>
          <p className="mt-0.5 text-[11px] text-[#8FAE9C]">이번 달</p>
        </div>
        <div className="rounded-2xl border border-[#E5E3DD] bg-[#FBFBFA] p-4">
          <p className="text-[11px] font-bold text-[#8B7E74]">진행률</p>
          <p className="mt-1 text-2xl font-extrabold text-[#4A3728]">
            {progress}
            <span className="text-base">%</span>
          </p>
          <p className="mt-0.5 text-[11px] text-[#A89F94]">
            {earnings.doneCount}/{earnings.scheduledCount}회 완료
          </p>
        </div>
        <div className="rounded-2xl border border-[#E5E3DD] bg-[#FBFBFA] p-4">
          <p className="text-[11px] font-bold text-[#8B7E74]">남은 수업</p>
          <p className="mt-1 text-2xl font-extrabold text-[#4A3728]">
            {remainingCount}
            <span className="text-base">회</span>
          </p>
          <p className="mt-0.5 text-[11px] text-[#A89F94]">아직 안 한 수업</p>
        </div>
      </div>
      )}

      {/* 달력 — 더블클릭하면 강사비 달력 ↔ 수업 달력 전환 (평소엔 강사비를 숨겨 둔다) */}
      <div
        onDoubleClick={() => setMode((current) => (current === 'income' ? 'class' : 'income'))}
        title="달력을 더블클릭하면 강사비 달력으로 전환됩니다"
        className="select-none"
      >
      <div className="mb-2 grid grid-cols-7 gap-1">
        {EARNINGS_WEEKDAYS.map((weekday) => (
          <div key={weekday} className="py-1.5 text-center text-[13px] font-bold text-[#6C6258] sm:text-sm">
            {weekday}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, index) => {
          if (!cell) {
            return <div key={`empty-${index}`} className="min-h-[72px]" />;
          }
          const dayNum = Number(cell.slice(8, 10));
          const day = earnings.byDate.get(cell);
          const isToday = cell === todayStr;
          return (
            <div
              key={cell}
              className={`flex min-h-[72px] min-w-0 flex-col overflow-hidden rounded-xl border p-1 transition-colors sm:p-1.5 ${
                isToday
                  ? 'border-[#2F5EA8] bg-[#EAF1FB]'
                  : day
                    ? 'border-[#ECEAE4] bg-white'
                    : 'border-transparent'
              }`}
            >
              <span
                className={`text-sm font-bold leading-none sm:text-base ${
                  isToday ? 'text-[#2F5EA8]' : 'text-[#4A3728]'
                }`}
              >
                {dayNum}
              </span>

              {/* 수업 달력: 클래스별 칩(이론·실습 준비 배지) — 클릭하면 해당 클래스로 이동 */}
              {day && mode === 'class' && (
                <div className="mt-1 flex flex-col gap-0.5">
                  {day.entries.slice(0, 3).map((entry, entryIndex) => {
                    const readiness = getReadiness(entry.classroomId, cell);
                    const statusLabel =
                      entry.status === 'done' ? '완료' : entry.status === 'skipped' ? '건너뜀' : '예정';
                    return (
                      <button
                        key={entryIndex}
                        type="button"
                        onClick={() => handleEntryClick(entry.classroomId, cell)}
                        title={`${entry.classroomName} · ${statusLabel} / 이론 ${
                          readiness.theoryReady ? '준비됨' : '준비안됨'
                        } · 실습 ${readiness.practiceReady ? '준비됨' : '준비안됨'} (클릭하면 클래스로 이동)`}
                        className={`flex w-full min-w-0 items-center gap-1 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-[#F3F2EE] ${
                          entry.status === 'skipped' ? 'opacity-50' : ''
                        }`}
                      >
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{
                            backgroundColor: entry.color || '#A2906F',
                            opacity: entry.status === 'planned' ? 0.6 : 1,
                          }}
                        />
                        <span className="min-w-0 flex-1 truncate text-[10px] font-bold text-[#4A3728]">
                          {entry.classroomName}
                        </span>
                        <span className="hidden shrink-0 items-center gap-0.5 sm:flex">
                          <span
                            className={`rounded px-1 text-[8px] font-bold ${
                              readiness.theoryReady
                                ? 'bg-[#E0EFE4] text-[#2D7A4D]'
                                : 'bg-[#F3F2EE] text-[#C2BAAE]'
                            }`}
                          >
                            이
                          </span>
                          <span
                            className={`rounded px-1 text-[8px] font-bold ${
                              readiness.practiceReady
                                ? 'bg-[#E0EFE4] text-[#2D7A4D]'
                                : 'bg-[#F3F2EE] text-[#C2BAAE]'
                            }`}
                          >
                            실
                          </span>
                        </span>
                      </button>
                    );
                  })}
                  {day.entries.length > 3 && (
                    <span className="pl-1 text-[9px] font-bold text-[#A89F94]">
                      +{day.entries.length - 3}개 더
                    </span>
                  )}
                </div>
              )}

              {/* 수입 달력: 색점 + 그날 강사비 */}
              {day && mode === 'income' && (
                <>
                  <div className="mt-1 flex flex-wrap gap-0.5">
                    {day.entries.slice(0, 5).map((entry, entryIndex) => (
                      <span
                        key={entryIndex}
                        title={`${entry.classroomName}${entry.fee > 0 ? ` · ${formatMan(entry.fee)}` : ''}`}
                        className="h-1.5 w-1.5 rounded-full"
                        style={{
                          backgroundColor:
                            entry.status === 'skipped' ? '#D6D0C6' : entry.color || '#A2906F',
                          opacity: entry.status === 'planned' ? 0.5 : 1,
                        }}
                      />
                    ))}
                  </div>
                  <div className="mt-auto pt-0.5">
                    {day.earned > 0 ? (
                      <span className="text-[11px] font-extrabold text-[#2D7A4D]">
                        +{formatFeeShort(day.earned)}만
                      </span>
                    ) : day.expected > 0 ? (
                      <span className="text-[11px] font-bold text-[#C2BAAE]">
                        +{formatFeeShort(day.expected)}만
                      </span>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      </div>

      {/* 클래스별 범례 — 색점이 어느 반인지 안내 (강사비는 단가 설정 시 곁들임) */}
      {activeClasses.length > 0 ? (
        <div className="mt-5 flex flex-wrap gap-2 border-t border-[#F3F2EE] pt-5">
          {activeClasses.map((classEarning) => (
            <span
              key={classEarning.classroomId}
              className="flex items-center gap-2 rounded-full border border-[#E5E3DD] bg-[#FBFBFA] py-1.5 pl-2.5 pr-3 text-xs"
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: classEarning.color || '#A2906F' }}
              />
              <span className="font-bold text-[#4A3728]">{classEarning.classroomName}</span>
              <span className="text-[#A89F94]">
                완료 {classEarning.doneCount}/{classEarning.scheduledCount}회
              </span>
              {mode === 'income' && classEarning.earned > 0 && (
                <span className="font-extrabold text-[#8B5E3C]">{formatMan(classEarning.earned)}</span>
              )}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-5 border-t border-[#F3F2EE] pt-5 text-center text-sm text-[#A89F94]">
          이번 달에 잡힌 수업이 없어요. 커리큘럼·시간표로 수업일을 배정하면 여기에 모여서 한눈에 보입니다.
        </p>
      )}
    </motion.section>
  );
};

const QuickNavCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  delay?: number;
  onClick?: () => void;
}> = ({ icon, title, description, delay = 0, onClick }) => (
  <motion.button
    type="button"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    onClick={onClick}
    className="group w-full cursor-pointer rounded-[32px] border border-[#E5E3DD] bg-white p-8 text-left transition-all hover:shadow-xl hover:shadow-[#8B5E3C]/5"
  >
    <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-[#F3F2EE] text-[#8B5E3C] transition-colors group-hover:bg-[#8B5E3C] group-hover:text-white">
      {icon}
    </div>
    <h3 className="mb-2 text-lg font-bold text-[#4A3728]">{title}</h3>
    <p className="text-sm leading-relaxed text-[#8B7E74]">{description}</p>
  </motion.button>
);

interface DashboardProps {
  classrooms?: Classroom[];
  classroomDateRecords?: ClassroomDateRecord[];
  contents?: LessonContent[];
  classroomLoadDiagnostics?: ClassroomLoadDiagnostics;
  onManageClassroom: (classroom: Classroom, date?: string) => void;
  onGoToLibrary: () => void;
  onGoToMemo: () => void;
  onSwitchToStudent: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  classrooms: allClassrooms = [],
  classroomDateRecords = [],
  contents = [],
  classroomLoadDiagnostics,
  onManageClassroom,
  onGoToLibrary,
  onGoToMemo,
  onSwitchToStudent,
}) => {
  const isDev = import.meta.env.DEV;
  // 숨긴 클래스는 홈 목록에서 제외
  const classrooms = allClassrooms.filter((classroom) => !classroom.hidden);

  return (
    <main className="flex-1 overflow-y-auto bg-[#FBFBFA] p-4 sm:p-8">
      <ClassroomDiagnosticsBanner
        diagnostics={classroomLoadDiagnostics}
        isDev={isDev}
        className="mb-6"
      />

      <MonthlyEarningsCalendar
        classrooms={classrooms}
        dateRecords={classroomDateRecords}
        contents={contents}
        onManageClassroom={onManageClassroom}
      />
    </main>
  );
};
