import React, { useMemo } from 'react';
import { Star, ChevronRight, Presentation, ListChecks, StickyNote } from 'lucide-react';
import { Classroom, ClassroomDateRecord, Curriculum, CurriculumSession } from '../types';
import {
  DEFAULT_CLASSROOM_COLOR,
  DEFAULT_CLASSROOM_ICON,
  getClassroomColorMeta,
  getClassroomIconComponent,
} from '../utils/classroomAppearance';

interface GoodLessonsManagerProps {
  classrooms: Classroom[];
  dateRecords: ClassroomDateRecord[];
  curriculums: Curriculum[];
  /** 수업 클릭 시 그 반·날짜 대시보드로 이동 (App.handleManageClassroom) */
  onOpenLesson: (classroom: Classroom, date: string) => void;
  /** '표시 해제' — 이 기록의 모범 표시를 끈다 */
  onUnmark: (record: ClassroomDateRecord) => void;
}

// "2026-06-22" → "6/22". ISO가 아니면 원본 그대로.
const toDateLabel = (date: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return match ? `${Number(match[2])}/${Number(match[3])}` : date;
};

// topic에 이미 "N회차"가 들어 있으면 접두사 중복을 막는다.
const formatSessionLabel = (session: CurriculumSession): string =>
  session.topic.trim().startsWith(`${session.order}회차`)
    ? session.topic.trim()
    : `${session.order}회차 · ${session.topic}`;

export const GoodLessonsManager: React.FC<GoodLessonsManagerProps> = ({
  classrooms,
  dateRecords,
  curriculums,
  onOpenLesson,
  onUnmark,
}) => {
  const classroomById = useMemo(
    () => new Map(classrooms.map((entry) => [entry.id, entry])),
    [classrooms]
  );
  const curriculumById = useMemo(
    () => new Map(curriculums.map((entry) => [entry.id, entry])),
    [curriculums]
  );

  // 모범 수업 기록 → 표시용 항목. 날짜·회차·주제는 그 반의 커리큘럼+회차 배정으로 해석. 최근 날짜 순.
  const lessons = useMemo(() => {
    return dateRecords
      .filter((record) => record.exemplary === true)
      .map((record) => {
        const classroom = classroomById.get(record.classroomId);
        const curriculum = curriculumById.get(record.curriculumId || classroom?.curriculumId || '');
        // 이 반의 '날짜 → 회차' 배정으로 회차·주제 라벨을 만든다.
        const sessions: CurriculumSession[] = [];
        for (const session of curriculum?.sessions || []) {
          if (classroom?.sessionStates?.[session.id]?.date === record.date) sessions.push(session);
        }
        const sessionLabel =
          sessions.length > 0 ? sessions.map(formatSessionLabel).join(' / ') : null;
        return {
          record,
          classroom,
          dateLabel: toDateLabel(record.date),
          sessionLabel,
          curriculumTitle: curriculum?.title || '커리큘럼 없음',
          theoryCount: record.theoryPrompts?.length ?? 0,
          practiceCount: record.contentIds?.length ?? 0,
          note: record.exemplaryNote?.trim() || '',
        };
      })
      .sort((left, right) =>
        left.record.date < right.record.date ? 1 : left.record.date > right.record.date ? -1 : 0
      );
  }, [dateRecords, classroomById, curriculumById]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FFF8E1]">
          <Star size={22} className="text-[#E7C200]" fill="#F4C430" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[#4A3728]">좋은 수업</h2>
          <p className="mt-1 text-sm text-[#8B7E74]">
            대시보드에서 <span className="font-bold text-[#8A6D00]">'좋은 수업으로 표시'</span>한
            수업들이 모입니다. 새벽 루틴이 새 수업을 만들 때 이 수업들을 참고자료로 읽어요.
          </p>
        </div>
      </div>

      {lessons.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[#E5E3DD] bg-[#FBFBFA] px-6 py-16 text-center">
          <Star size={32} className="mx-auto mb-3 text-[#DAD5CC]" />
          <p className="text-sm font-bold text-[#8B7E74]">아직 표시한 좋은 수업이 없어요.</p>
          <p className="mt-1 text-xs text-[#B7AFA4]">
            반 대시보드에서 잘 만든 수업의 '수업 진행' 카드에 있는 ⭐ '좋은 수업으로 표시'를 눌러보세요.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {lessons.map(
            ({
              record,
              classroom,
              dateLabel,
              sessionLabel,
              curriculumTitle,
              theoryCount,
              practiceCount,
              note,
            }) => {
              const meta = getClassroomColorMeta(classroom?.color || DEFAULT_CLASSROOM_COLOR);
              const RowIcon = getClassroomIconComponent(classroom?.icon || DEFAULT_CLASSROOM_ICON);
              return (
                <div
                  key={record.id}
                  className="group rounded-2xl border border-[#E5E3DD] bg-white p-4 transition-all hover:border-[#E7C200] hover:shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                      style={{ backgroundColor: meta.bg }}
                    >
                      {RowIcon && <RowIcon size={18} style={{ color: meta.value }} />}
                    </span>
                    <button
                      type="button"
                      onClick={() => classroom && onOpenLesson(classroom, record.date)}
                      disabled={!classroom}
                      className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left disabled:cursor-not-allowed"
                    >
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-bold text-[#4A3728]">
                        <span className="shrink-0">{dateLabel}</span>
                        <span className="text-[#B7AFA4]">·</span>
                        <span className="shrink-0">{classroom?.name || '(삭제된 반)'}</span>
                        <span className="text-[#B7AFA4]">·</span>
                        <span>{sessionLabel || curriculumTitle}</span>
                      </span>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#8B7E74]">
                        {sessionLabel && <span className="truncate">{curriculumTitle}</span>}
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#F3F2EE] px-2 py-0.5 font-bold">
                          <Presentation size={11} />이론 {theoryCount}
                          <span className="text-[#DAD5CC]">·</span>
                          <ListChecks size={11} />실습 {practiceCount}
                        </span>
                      </span>
                      {note && (
                        <span className="mt-0.5 inline-flex items-start gap-1.5 rounded-xl bg-[#FFF8E1] px-2.5 py-1.5 text-xs text-[#8A6D00]">
                          <StickyNote size={12} className="mt-0.5 shrink-0" />
                          <span>{note}</span>
                        </span>
                      )}
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onUnmark(record)}
                        title="좋은 수업 표시 해제"
                        aria-label="좋은 수업 표시 해제"
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold text-[#B7AFA4] transition-all hover:bg-[#FDECEC] hover:text-[#B42318]"
                      >
                        표시 해제
                      </button>
                      {classroom && (
                        <ChevronRight
                          size={18}
                          className="shrink-0 text-[#C4B6A4] transition-colors group-hover:text-[#E7C200]"
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            }
          )}
        </div>
      )}
    </div>
  );
};
