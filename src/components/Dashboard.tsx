import React, { useEffect, useMemo, useState } from 'react';
import { useEscToClose } from '../utils/useEscToClose';
import { getPublishedLessonLiveState } from '../utils/classroomDomain';
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
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { ClassroomDiagnosticsBanner } from './ClassroomDiagnosticsBanner';
import {
  Classroom,
  ClassroomDateRecord,
  ClassroomLoadDiagnostics,
  LessonContent,
  PublishedLesson,
} from '../types';
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
  DayEarningEntry,
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
  publishedLessons: PublishedLesson[];
  onManageClassroom: (classroom: Classroom, date?: string) => void;
}> = ({ classrooms, dateRecords, contents, publishedLessons, onManageClassroom }) => {
  const [view, setView] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [mode, setMode] = useState<CalendarMode>('class');
  // '+N개 더'를 눌러 그날 수업 전체를 팝업으로 펼친 날짜 (null이면 닫힘).
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  useEscToClose(Boolean(expandedDate), () => setExpandedDate(null));

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

  // 공개(LIVE) 판정에 쓰는 현재 시각. 공개 문서가 있으면 1분마다 갱신해,
  // 자동 만료(발행 후 3시간)가 지나면 LIVE 배지가 별도 조작 없이 저절로 사라진다.
  const [nowTs, setNowTs] = useState(() => Date.now());
  const hasPublishedContent = useMemo(
    () =>
      publishedLessons.some(
        (lesson) =>
          (lesson.publishedContentIds?.length ?? 0) > 0 || Boolean(lesson.publishedTheory?.url)
      ),
    [publishedLessons]
  );
  useEffect(() => {
    if (!hasPublishedContent) return;
    const id = setInterval(() => setNowTs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [hasPublishedContent]);

  // 지금 학생 화면에 이론/실습이 실제로 켜져 있는 회차 인덱스. key=`${classroomId}_${date}`.
  // 내용이 있어도 자동 만료됐으면 제외된다(getPublishedLessonLiveState가 TTL을 함께 판정).
  const liveByKey = useMemo(() => {
    const map = new Map<string, { theory: boolean; practice: boolean }>();
    for (const lesson of publishedLessons) {
      const state = getPublishedLessonLiveState(lesson, nowTs);
      if (state.any) {
        map.set(`${lesson.classroomId}_${lesson.date}`, {
          theory: state.theory,
          practice: state.practice,
        });
      }
    }
    return map;
  }, [publishedLessons, nowTs]);

  const getLive = (classroomId: string, dateStr: string) =>
    liveByKey.get(`${classroomId}_${dateStr}`);

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

  // 완료한 수업은 준비 배지 대신 메모 입력 여부를 표시한다.
  const hasMemo = (classroomId: string, dateStr: string) => {
    const record = recordByKey.get(`${classroomId}_${dateStr}`);
    return Boolean(record?.memo && record.memo.trim());
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

  // 하루치 클래스 칩 — 달력 셀과 '+N개 더' 팝업이 같은 모양을 공유한다.
  const renderEntryChip = (
    entry: DayEarningEntry,
    cell: string,
    key: React.Key,
    variant: 'cell' | 'popup' = 'cell'
  ) => {
    const readiness = getReadiness(entry.classroomId, cell);
    const isDone = entry.status === 'done';
    const memoPresent = hasMemo(entry.classroomId, cell);
    const live = getLive(entry.classroomId, cell);
    const isLive = Boolean(live);
    const liveLabel = live
      ? [live.theory ? '이론' : null, live.practice ? '실습' : null].filter(Boolean).join('·')
      : '';
    const statusLabel =
      entry.status === 'done' ? '완료' : entry.status === 'skipped' ? '건너뜀' : '예정';
    const inPopup = variant === 'popup';
    return (
      <button
        key={key}
        type="button"
        onClick={() => {
          setExpandedDate(null);
          handleEntryClick(entry.classroomId, cell);
        }}
        title={
          isLive
            ? `${entry.classroomName} · 🔴 지금 LIVE — ${liveLabel} 학생에게 공개 중 (클릭하면 클래스로 이동해 끌 수 있어요)`
            : isDone
              ? `${entry.classroomName} · 완료 / 메모 ${
                  memoPresent ? '있음' : '없음'
                } (클릭하면 클래스로 이동)`
              : `${entry.classroomName} · ${statusLabel} / 이론 ${
                  readiness.theoryReady ? '준비됨' : '준비안됨'
                } · 실습 ${readiness.practiceReady ? '준비됨' : '준비안됨'} (클릭하면 클래스로 이동)`
        }
        className={`flex w-full min-w-0 items-center text-left transition-colors hover:bg-[#F3F2EE] ${
          inPopup
            ? 'gap-2 rounded-xl border border-[#F3F2EE] px-2.5 py-2'
            : 'gap-1 rounded-md px-1 py-0.5'
        } ${entry.status === 'skipped' ? 'opacity-50' : ''}`}
      >
        <span
          className={`shrink-0 rounded-full ${inPopup ? 'h-2.5 w-2.5' : 'h-1.5 w-1.5'}`}
          style={{
            backgroundColor: entry.color || '#A2906F',
            opacity: entry.status === 'planned' ? 0.6 : 1,
          }}
        />
        <span
          className={`min-w-0 flex-1 truncate font-bold text-[#4A3728] ${
            inPopup ? 'text-sm' : 'text-[10px]'
          }`}
        >
          {entry.classroomName}
        </span>
        {inPopup && (
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
              isDone
                ? 'bg-[#E0EFE4] text-[#2D7A4D]'
                : entry.status === 'skipped'
                  ? 'bg-[#F3F2EE] text-[#B7AFA4]'
                  : 'bg-[#EAF1FB] text-[#2F5EA8]'
            }`}
          >
            {statusLabel}
          </span>
        )}
        {isLive ? (
          // 자동 만료(발행 후 3시간) 전까지 학생 화면에 켜져 있는 회차 — 끄는 걸 놓쳐도 여기서 바로 보인다.
          // 준비/메모 배지보다 우선하며, 모바일에서도 항상 보이게 한다.
          <span
            className={`shrink-0 flex items-center font-extrabold text-[#D12E2E] ${
              inPopup ? 'gap-1 rounded-md bg-[#FCE4E4] px-2 py-0.5 text-[10px]' : 'gap-0.5 rounded bg-[#FCE4E4] px-1 py-0.5 text-[8px]'
            }`}
          >
            <span
              className={`rounded-full bg-[#E23B3B] animate-pulse ${
                inPopup ? 'h-2 w-2' : 'h-1.5 w-1.5'
              }`}
            />
            LIVE
          </span>
        ) : isDone ? (
          <span
            className={`shrink-0 items-center gap-0.5 rounded px-1 font-bold ${
              inPopup ? 'flex text-[10px]' : 'hidden text-[8px] sm:flex'
            } ${memoPresent ? 'bg-[#E0EFE4] text-[#2D7A4D]' : 'bg-[#F3F2EE] text-[#C2BAAE]'}`}
          >
            <StickyNote size={inPopup ? 11 : 9} strokeWidth={2.5} />
            {memoPresent ? '메모' : '없음'}
          </span>
        ) : (
          <span
            className={`shrink-0 items-center gap-0.5 ${
              inPopup ? 'flex' : 'hidden sm:flex'
            }`}
          >
            <span
              className={`rounded px-1 font-bold ${inPopup ? 'text-[10px]' : 'text-[8px]'} ${
                readiness.theoryReady
                  ? 'bg-[#E0EFE4] text-[#2D7A4D]'
                  : 'bg-[#F3F2EE] text-[#C2BAAE]'
              }`}
            >
              이
            </span>
            <span
              className={`rounded px-1 font-bold ${inPopup ? 'text-[10px]' : 'text-[8px]'} ${
                readiness.practiceReady
                  ? 'bg-[#E0EFE4] text-[#2D7A4D]'
                  : 'bg-[#F3F2EE] text-[#C2BAAE]'
              }`}
            >
              실
            </span>
          </span>
        )}
      </button>
    );
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
          // LIVE(공개 중) 회차가 있는 날은 셀 자체를 빨갛게 강조하고, 그 회차를 맨 앞으로 올려
          // '+N개 더'에 가려 놓치는 일이 없게 한다.
          const dayEntries = day?.entries ?? [];
          const orderedEntries =
            dayEntries.length > 1
              ? [...dayEntries].sort(
                  (a, b) =>
                    (liveByKey.has(`${b.classroomId}_${cell}`) ? 1 : 0) -
                    (liveByKey.has(`${a.classroomId}_${cell}`) ? 1 : 0)
                )
              : dayEntries;
          const dayHasLive = dayEntries.some((entry) =>
            liveByKey.has(`${entry.classroomId}_${cell}`)
          );
          return (
            <div
              key={cell}
              className={`flex min-h-[72px] min-w-0 flex-col overflow-hidden rounded-xl border p-1 transition-colors sm:p-1.5 ${
                dayHasLive
                  ? 'border-[#E23B3B] bg-[#FDECEC]'
                  : isToday
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
                  {orderedEntries.slice(0, 3).map((entry, entryIndex) =>
                    renderEntryChip(entry, cell, entryIndex)
                  )}
                  {orderedEntries.length > 3 && (
                    <button
                      type="button"
                      onClick={() => setExpandedDate(cell)}
                      className="rounded-md py-0.5 pl-1 text-left text-[9px] font-bold text-[#8B5E3C] transition-colors hover:bg-[#F3F2EE]"
                    >
                      +{orderedEntries.length - 3}개 더
                    </button>
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

      {/* '+N개 더' 팝업 — 셀에 다 못 보여준 그날 수업 전체 목록 */}
      <AnimatePresence>
        {expandedDate &&
          (() => {
            const day = earnings.byDate.get(expandedDate);
            if (!day) return null;
            const dateObj = new Date(`${expandedDate}T00:00:00`);
            return (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4"
              >
                <div
                  className="absolute inset-0 bg-black/30"
                  onClick={() => setExpandedDate(null)}
                />
                <motion.div
                  initial={{ scale: 0.95, y: 8 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.95, y: 8 }}
                  className="relative w-full max-w-sm rounded-3xl border border-[#E5E3DD] bg-white p-5 shadow-xl"
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-[#4A3728]">
                      {dateObj.getMonth() + 1}월 {dateObj.getDate()}일 (
                      {EARNINGS_WEEKDAYS[dateObj.getDay()]}) · 수업 {day.entries.length}개
                    </h3>
                    <button
                      type="button"
                      onClick={() => setExpandedDate(null)}
                      aria-label="닫기"
                      className="rounded-lg p-1.5 text-[#8B7E74] transition-all hover:bg-[#F3F2EE]"
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <div className="flex max-h-[60vh] flex-col gap-1.5 overflow-y-auto">
                    {[...day.entries]
                      .sort(
                        (a, b) =>
                          (liveByKey.has(`${b.classroomId}_${expandedDate}`) ? 1 : 0) -
                          (liveByKey.has(`${a.classroomId}_${expandedDate}`) ? 1 : 0)
                      )
                      .map((entry, entryIndex) =>
                        renderEntryChip(entry, expandedDate, entryIndex, 'popup')
                      )}
                  </div>
                </motion.div>
              </motion.div>
            );
          })()}
      </AnimatePresence>
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
  publishedLessons?: PublishedLesson[];
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
  publishedLessons = [],
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
        publishedLessons={publishedLessons}
        onManageClassroom={onManageClassroom}
      />
    </main>
  );
};
