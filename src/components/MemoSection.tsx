import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Calendar,
  ClipboardList,
  Loader2,
  type LucideIcon,
  Plus,
  RefreshCw,
  StickyNote,
  Trash2,
  Users,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Classroom, ClassroomDateRecord, DailyReview, Memo } from '../types';
import { normalizeClassroomDateRecordContentIds } from '../utils/classroomDateRecordContent';

interface MemoSectionProps {
  memos: Memo[];
  dailyReviews?: DailyReview[];
  classrooms?: Classroom[];
  classroomDateRecords?: ClassroomDateRecord[];
  onAddMemo: (content: string) => void;
  onDeleteMemo: (id: string) => void;
  onGenerateDailyReview?: (date: string) => Promise<void>;
}

type Tab = 'general' | 'date-records' | 'students' | 'daily-reviews';

const TEXT = {
  title: '메모장',
  subtitle: '운영 메모와 날짜별 수업 메모, 학생별 메모를 한곳에서 봅니다.',
  newMemoPlaceholder: '새 메모를 입력하세요.',
  saveMemo: '메모 저장',
  dailyReviewTab: '하루 전체 평',
  dateRecordTab: '수업별 메모',
  studentTab: '학생별 메모',
  generalTab: '기타 메모',
  dailyReviewBadge: '하루 전체 수업 평',
  dailyReviewSuffix: '개 수업 기록 기준',
  noDailyReview: '수업 메모가 있는 날짜가 없습니다.',
  noGeneralMemo: '아직 작성된 기타 메모가 없습니다.',
  noDateRecordMemo: '활성 날짜에 작성된 수업 메모가 없습니다.',
  noStudentMemo: '학생별로 작성된 메모가 없습니다.',
  recordedContentCountSuffix: '개 수업 콘텐츠',
  noRecordedContent: '진행 콘텐츠 미선택',
  generateDailyReview: '하루 전체 평 생성',
  regenerateDailyReview: '다시 생성',
  generating: '생성 중...',
};

export const MemoSection: React.FC<MemoSectionProps> = ({
  memos,
  dailyReviews = [],
  classrooms = [],
  classroomDateRecords = [],
  onAddMemo,
  onDeleteMemo,
  onGenerateDailyReview,
}) => {
  const [newMemo, setNewMemo] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('daily-reviews');
  const [generatingDate, setGeneratingDate] = useState<string | null>(null);

  const classroomNamesById = useMemo(
    () => new Map(classrooms.map((classroom) => [classroom.id, classroom.name])),
    [classrooms]
  );

  // 날짜별로 메모가 있는 수업 기록 그룹핑 (날짜 내림차순)
  const dateGroups = useMemo(() => {
    const recordsWithMemo = classroomDateRecords.filter((r) => r.memo.trim());
    const groups = new Map<string, ClassroomDateRecord[]>();

    recordsWithMemo.forEach((record) => {
      const existing = groups.get(record.date) ?? [];
      groups.set(record.date, [...existing, record]);
    });

    return Array.from(groups.entries())
      .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
      .map(([date, records]) => ({ date, records }));
  }, [classroomDateRecords]);

  // date → DailyReview 조회용 맵
  const dailyReviewsByDate = useMemo(
    () => new Map(dailyReviews.map((r) => [r.date, r])),
    [dailyReviews]
  );

  const dateRecordMemos = useMemo(
    () =>
      classroomDateRecords
        .filter((record) => record.memo.trim())
        .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime()),
    [classroomDateRecords]
  );

  const studentMemos = useMemo(
    () =>
      classrooms.flatMap((classroom) =>
        (classroom.students || [])
          .filter((student) => student.memo?.trim())
          .map((student) => ({
            ...student,
            classroomName: classroom.name,
          }))
      ),
    [classrooms]
  );

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (activeTab !== 'general' || !newMemo.trim()) return;
    onAddMemo(newMemo);
    setNewMemo('');
  };

  const handleGenerateClick = async (date: string) => {
    if (!onGenerateDailyReview || generatingDate) return;
    setGeneratingDate(date);
    try {
      await onGenerateDailyReview(date);
    } finally {
      setGeneratingDate(null);
    }
  };

  const isGeneralTab = activeTab === 'general';

  const tabs: Array<{ id: Tab; label: string; icon: LucideIcon; count: number }> = [
    {
      id: 'daily-reviews',
      label: TEXT.dailyReviewTab,
      icon: ClipboardList,
      count: dateGroups.length,
    },
    {
      id: 'date-records',
      label: TEXT.dateRecordTab,
      icon: BookOpen,
      count: dateRecordMemos.length,
    },
    {
      id: 'students',
      label: TEXT.studentTab,
      icon: Users,
      count: studentMemos.length,
    },
    {
      id: 'general',
      label: TEXT.generalTab,
      icon: StickyNote,
      count: memos.length,
    },
  ];

  return (
    <main className="flex-1 overflow-y-auto bg-[#FBFBFA] p-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-10">
          <h2 className="mb-2 font-serif text-3xl font-bold text-[#4A3728]">{TEXT.title}</h2>
          <p className="text-[#8B7E74]">{TEXT.subtitle}</p>
        </header>

        {isGeneralTab && (
          <section className="mb-10 rounded-[32px] border border-[#E5E3DD] bg-white p-8 shadow-sm">
            <form onSubmit={handleSubmit} className="space-y-4">
              <textarea
                value={newMemo}
                onChange={(event) => setNewMemo(event.target.value)}
                placeholder={TEXT.newMemoPlaceholder}
                className="min-h-[120px] w-full resize-none rounded-2xl border-none bg-[#F3F2EE] p-6 text-[#4A3728] outline-none transition-all placeholder:text-[#A89F94] focus:ring-2 focus:ring-[#8B5E3C]/20"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={!newMemo.trim()}
                  className="flex items-center gap-2 rounded-xl bg-[#8B5E3C] px-8 py-3 font-bold text-white shadow-lg shadow-[#8B5E3C]/20 transition-all hover:bg-[#724D31] disabled:opacity-50 disabled:shadow-none"
                >
                  <Plus size={18} />
                  {TEXT.saveMemo}
                </button>
              </div>
            </form>
          </section>
        )}

        <div className="mb-8 flex gap-4 border-b border-[#E5E3DD]">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2 pb-4 text-sm font-bold transition-all ${
                activeTab === tab.id ? 'text-[#8B5E3C]' : 'text-[#8B7E74] hover:text-[#4A3728]'
              }`}
            >
              <tab.icon size={18} />
              {tab.label}
              <span className="ml-1 rounded-full bg-[#F3F2EE] px-2 py-0.5 text-[10px] text-[#A89F94]">
                {tab.count}
              </span>
              {activeTab === tab.id && (
                <motion.div
                  layoutId="activeMemoTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#8B5E3C]"
                />
              )}
            </button>
          ))}
        </div>

        <section className="space-y-6">
          <AnimatePresence mode="wait">
            {/* ── 하루 전체 평 탭 ── */}
            {activeTab === 'daily-reviews' && (
              <motion.div
                key="daily-reviews"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                {dateGroups.map(({ date, records }) => {
                  const existingReview = dailyReviewsByDate.get(date);
                  const isGenerating = generatingDate === date;

                  return (
                    <div
                      key={date}
                      className="overflow-hidden rounded-[28px] border border-[#E5E3DD] bg-white shadow-sm"
                    >
                      {/* 날짜 헤더 */}
                      <div className="flex items-center gap-2 border-b border-[#F3F2EE] bg-[#FBFBFA] px-6 py-4">
                        <Calendar size={15} className="text-[#8B5E3C]" />
                        <span className="text-sm font-bold text-[#4A3728]">{date}</span>
                        <span className="ml-1 rounded-full bg-[#EBD9C1]/50 px-2 py-0.5 text-[10px] font-bold text-[#8B5E3C]">
                          {records.length}개 클래스
                        </span>
                      </div>

                      <div className="p-6 space-y-4">
                        {/* 각 클래스 메모 */}
                        {records.map((record) => (
                          <div key={record.id} className="flex gap-3">
                            <div className="mt-0.5 shrink-0">
                              <span className="inline-block rounded-full bg-[#FFF5E9] px-2.5 py-1 text-[11px] font-bold text-[#8B5E3C]">
                                {classroomNamesById.get(record.classroomId) || record.classroomName}
                              </span>
                            </div>
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#4A3728]">
                              {record.memo}
                            </p>
                          </div>
                        ))}

                        {/* 기존 하루 전체 평 */}
                        {existingReview && (
                          <div className="mt-4 rounded-2xl border border-[#C8E6D4] bg-[#EEF7F0] p-4">
                            <div className="mb-2 flex items-center gap-2">
                              <ClipboardList size={14} className="text-[#2D7A4D]" />
                              <span className="text-[11px] font-bold text-[#2D7A4D]">
                                {TEXT.dailyReviewBadge}
                              </span>
                              <span className="text-[10px] text-[#6BAF85]">
                                {existingReview.sourceRecordIds.length}{TEXT.dailyReviewSuffix}
                              </span>
                            </div>
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#2D5A3D]">
                              {existingReview.summary}
                            </p>
                          </div>
                        )}

                        {/* 생성 버튼 */}
                        {onGenerateDailyReview && (
                          <div className="flex justify-end pt-2">
                            <button
                              onClick={() => handleGenerateClick(date)}
                              disabled={!!generatingDate}
                              className="flex items-center gap-2 rounded-xl border border-[#8B5E3C]/20 bg-[#FFF5E9] px-5 py-2.5 text-sm font-bold text-[#8B5E3C] transition-all hover:bg-[#F3E8DB] disabled:opacity-50"
                            >
                              {isGenerating ? (
                                <>
                                  <Loader2 size={15} className="animate-spin" />
                                  {TEXT.generating}
                                </>
                              ) : existingReview ? (
                                <>
                                  <RefreshCw size={15} />
                                  {TEXT.regenerateDailyReview}
                                </>
                              ) : (
                                <>
                                  <ClipboardList size={15} />
                                  {TEXT.generateDailyReview}
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {dateGroups.length === 0 && (
                  <div className="flex flex-col items-center justify-center rounded-[32px] border-2 border-dashed border-[#E5E3DD] bg-[#F3F2EE]/50 py-20 text-[#A89F94]">
                    <ClipboardList size={48} className="mb-4 opacity-20" />
                    <p>{TEXT.noDailyReview}</p>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── 기타 메모 탭 ── */}
            {activeTab === 'general' && (
              <motion.div
                key="general"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid grid-cols-1 gap-6 md:grid-cols-2"
              >
                {memos.map((memo) => (
                  <motion.div
                    key={memo.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="group relative rounded-[24px] border border-[#E5E3DD] bg-white p-6 transition-all hover:shadow-md"
                  >
                    <div className="mb-4 flex items-start justify-between">
                      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#8B5E3C]">
                        <Calendar size={14} />
                        <span>{memo.date}</span>
                      </div>
                      <button
                        onClick={() => onDeleteMemo(memo.id)}
                        className="p-1 text-[#A89F94] transition-colors hover:text-red-500"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="flex gap-4">
                      <div className="mt-1 text-[#EBD9C1]">
                        <StickyNote size={20} />
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed text-[#4A3728]">
                        {memo.content}
                      </p>
                    </div>
                  </motion.div>
                ))}

                {memos.length === 0 && (
                  <div className="col-span-1 flex flex-col items-center justify-center rounded-[32px] border-2 border-dashed border-[#E5E3DD] bg-[#F3F2EE]/50 py-20 text-[#A89F94] md:col-span-2">
                    <StickyNote size={48} className="mb-4 opacity-20" />
                    <p>{TEXT.noGeneralMemo}</p>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── 수업별 메모 탭 ── */}
            {activeTab === 'date-records' && (
              <motion.div
                key="date-records"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid grid-cols-1 gap-6 md:grid-cols-2"
              >
                {dateRecordMemos.map((record) => {
                  const recordedContentIds = normalizeClassroomDateRecordContentIds(record);
                  const recordTitle =
                    recordedContentIds.length > 0
                      ? `${recordedContentIds.length}${TEXT.recordedContentCountSuffix}`
                      : TEXT.noRecordedContent;

                  return (
                    <div
                      key={record.id}
                      className="relative rounded-[24px] border border-[#E5E3DD] bg-white p-6 shadow-sm"
                    >
                      <div className="mb-4 flex items-start justify-between">
                        <div>
                          <div className="mb-1 flex items-center gap-2">
                            <span className="rounded-full bg-[#FFF5E9] px-2 py-0.5 text-[10px] font-bold text-[#8B5E3C]">
                              {classroomNamesById.get(record.classroomId) || record.classroomName}
                            </span>
                            <span className="flex items-center gap-1 text-[11px] font-bold text-[#A89F94]">
                              <Calendar size={12} />
                              {record.date}
                            </span>
                          </div>
                          <h4 className="text-sm font-bold text-[#4A3728]">{recordTitle}</h4>
                        </div>
                      </div>
                      <div className="flex gap-4">
                        <div className="mt-1 text-[#EBD9C1]">
                          <BookOpen size={20} />
                        </div>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#4A3728]">
                          {record.memo}
                        </p>
                      </div>
                    </div>
                  );
                })}

                {dateRecordMemos.length === 0 && (
                  <div className="col-span-full flex flex-col items-center justify-center rounded-[32px] border-2 border-dashed border-[#E5E3DD] bg-[#F3F2EE]/50 py-20 text-[#A89F94]">
                    <BookOpen size={48} className="mb-4 opacity-20" />
                    <p>{TEXT.noDateRecordMemo}</p>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── 학생별 메모 탭 ── */}
            {activeTab === 'students' && (
              <motion.div
                key="students"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid grid-cols-1 gap-6 md:grid-cols-2"
              >
                {studentMemos.map((student) => (
                  <div
                    key={`${student.id}-${student.classroomName}`}
                    className="relative rounded-[24px] border border-[#E5E3DD] bg-white p-6 shadow-sm"
                  >
                    <div className="mb-4 flex items-start justify-between">
                      <div>
                        <div className="mb-1 flex items-center gap-2">
                          <span className="rounded-full bg-[#EFF6FF] px-2 py-0.5 text-[10px] font-bold text-[#3B82F6]">
                            {student.classroomName}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-[#4A3728]">
                          {student.name}
                          {student.age ? ` (${student.age})` : ''}
                        </h4>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="mt-1 text-[#BFDBFE]">
                        <Users size={20} />
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#4A3728]">
                        {student.memo}
                      </p>
                    </div>
                  </div>
                ))}

                {studentMemos.length === 0 && (
                  <div className="col-span-full flex flex-col items-center justify-center rounded-[32px] border-2 border-dashed border-[#E5E3DD] bg-[#F3F2EE]/50 py-20 text-[#A89F94]">
                    <Users size={48} className="mb-4 opacity-20" />
                    <p>{TEXT.noStudentMemo}</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>
    </main>
  );
};
