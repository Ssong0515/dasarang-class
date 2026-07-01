import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Calendar,
  Check,
  ClipboardList,
  Loader2,
  type LucideIcon,
  Pencil,
  Plus,
  StickyNote,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { InfoTooltip } from './InfoTooltip';
import { AnimatePresence, motion } from 'motion/react';
import { Classroom, ClassroomDateRecord, ClassroomSessionState, DailyReview, Memo } from '../types';
import { normalizeClassroomDateRecordContentIds } from '../utils/classroomDateRecordContent';
import { getClassroomDateRecordId } from '../utils/classroomDomain';

interface MemoSectionProps {
  memos: Memo[];
  dailyReviews?: DailyReview[];
  classrooms?: Classroom[];
  classroomDateRecords?: ClassroomDateRecord[];
  onAddMemo: (content: string) => void;
  onDeleteMemo: (id: string) => void;
  onUpdateDailyReview?: (id: string, summary: string) => Promise<void>;
  onCreateDailyReview?: (
    date: string,
    summary: string,
    sourceRecordIds: string[]
  ) => Promise<void>;
}

type Tab = 'general' | 'date-records' | 'students';

// 날짜별 수업 탭에서 한 줄로 그릴 표시용 레코드.
// 실제 기록 문서가 없는 완료 회차도 최소 필드만으로 합성해 넣기 위해 별도 타입을 쓴다.
type MemoDisplayRecord = Pick<
  ClassroomDateRecord,
  'id' | 'classroomId' | 'date' | 'classroomName' | 'memo' | 'contentIds'
>;

const TEXT = {
  title: '메모장',
  subtitle: '날짜별 수업 메모 및 하루 전체 평, 학생별 메모를 한곳에서 봅니다.',
  newMemoPlaceholder: '새 메모를 입력하세요.',
  saveMemo: '메모 저장',
  dateRecordTab: '날짜별 수업',
  studentTab: '학생별 메모',
  generalTab: '기타 메모',
  dailyReviewBadge: '하루 전체 평',
  dailyReviewSuffix: '개 수업 기록 기준',
  noDateRecord: '표시할 수업이 있는 날짜가 없습니다.',
  noMemoForClass: '메모 없음',
  noGeneralMemo: '아직 작성된 기타 메모가 없습니다.',
  noStudentMemo: '학생별로 작성된 메모가 없습니다.',
  recordedContentCountSuffix: '개 수업 콘텐츠',
  noRecordedContent: '진행 콘텐츠 미선택',
  noDailyReview: '아직 하루 전체 평이 없습니다',
  dailyReviewPlaceholder: '이 날 수업 전체를 아우르는 한 줄 평을 입력하세요.',
  addReview: '하루 전체 평 작성',
  editReview: '수정',
  saveReview: '저장',
  cancelEdit: '취소',
  saving: '저장 중...',
};

export const MemoSection: React.FC<MemoSectionProps> = ({
  memos,
  dailyReviews = [],
  classrooms = [],
  classroomDateRecords = [],
  onAddMemo,
  onDeleteMemo,
  onUpdateDailyReview,
  onCreateDailyReview,
}) => {
  const [newMemo, setNewMemo] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('date-records');
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [savingReviewId, setSavingReviewId] = useState<string | null>(null);
  const [creatingText, setCreatingText] = useState<Record<string, string>>({});
  const [savingCreateDate, setSavingCreateDate] = useState<string | null>(null);

  const classroomNamesById = useMemo(
    () => new Map(classrooms.map((c) => [c.id, c.name])),
    [classrooms]
  );

  const classroomOrderById = useMemo(
    () => new Map(classrooms.map((c) => [c.id, c.order ?? 999])),
    [classrooms]
  );

  // 날짜별로 "그날 수업한 반"을 그룹핑 (날짜 내림차순, 날짜 안에서는 클래스 순서 오름차순).
  // 표시 대상 = 메모가 있는 기록 ∪ 완료(done)로 표시된 회차.
  //   - 메모 있는 기록: 숨긴/비커리큘럼 반(sessionStates 없음)도 여기서 노출된다.
  //   - done 회차: 완료했지만 메모를 안 쓴 반을 "메모 없음"으로 드러낸다. planned(미래 예약)는 제외.
  const dateGroups = useMemo(() => {
    const recordByKey = new Map<string, ClassroomDateRecord>();
    classroomDateRecords.forEach((record) => {
      recordByKey.set(getClassroomDateRecordId(record.classroomId, record.date), record);
    });

    // 표시할 (반, 날짜) 조합 수집
    const targets = new Map<string, { classroomId: string; date: string }>();
    const addTarget = (classroomId: string, date: string) => {
      targets.set(getClassroomDateRecordId(classroomId, date), { classroomId, date });
    };
    classroomDateRecords.forEach((record) => {
      if (record.memo.trim()) addTarget(record.classroomId, record.date);
    });
    classrooms.forEach((classroom) => {
      const states: Record<string, ClassroomSessionState> = classroom.sessionStates ?? {};
      Object.values(states).forEach((state) => {
        if (state?.status === 'done' && state.date) addTarget(classroom.id, state.date);
      });
    });

    // 실제 기록이 없는 완료 회차는 표시용 최소 필드로 합성한다.
    const displayRecords: MemoDisplayRecord[] = Array.from(targets.entries()).map(
      ([key, { classroomId, date }]) => {
        const existing = recordByKey.get(key);
        if (existing) return existing;
        return {
          id: key,
          classroomId,
          date,
          classroomName: classroomNamesById.get(classroomId) ?? '',
          memo: '',
          contentIds: [],
        };
      }
    );

    const groups = new Map<string, MemoDisplayRecord[]>();
    displayRecords.forEach((record) => {
      const existing = groups.get(record.date) ?? [];
      groups.set(record.date, [...existing, record]);
    });
    return Array.from(groups.entries())
      .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
      .map(([date, records]) => ({
        date,
        records: records.sort((a, b) => {
          const orderA = classroomOrderById.get(a.classroomId) ?? 999;
          const orderB = classroomOrderById.get(b.classroomId) ?? 999;
          return orderA - orderB;
        }),
      }));
  }, [classroomDateRecords, classrooms, classroomOrderById, classroomNamesById]);

  const dailyReviewsByDate = useMemo(
    () => new Map(dailyReviews.map((r) => [r.date, r])),
    [dailyReviews]
  );

  const studentMemos = useMemo(
    () =>
      classrooms.flatMap((classroom) =>
        (classroom.students || [])
          .filter((student) => student.memo?.trim())
          .map((student) => ({ ...student, classroomName: classroom.name }))
      ),
    [classrooms]
  );

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (activeTab !== 'general' || !newMemo.trim()) return;
    onAddMemo(newMemo);
    setNewMemo('');
  };

  const handleEditStart = (review: DailyReview) => {
    setEditingReviewId(review.id);
    setEditingText(review.summary);
  };

  const handleEditCancel = () => {
    setEditingReviewId(null);
    setEditingText('');
  };

  const handleEditSave = async (id: string) => {
    if (!onUpdateDailyReview || !editingText.trim()) return;
    setSavingReviewId(id);
    try {
      await onUpdateDailyReview(id, editingText.trim());
      setEditingReviewId(null);
      setEditingText('');
    } catch {
      // 저장 실패 시 편집 내용을 유지 (오류는 상위 핸들러에서 로깅됨)
    } finally {
      setSavingReviewId(null);
    }
  };

  const handleCreateSave = async (date: string, sourceRecordIds: string[]) => {
    const text = (creatingText[date] ?? '').trim();
    if (!onCreateDailyReview || !text) return;
    setSavingCreateDate(date);
    try {
      await onCreateDailyReview(date, text, sourceRecordIds);
      setCreatingText((prev) => {
        const next = { ...prev };
        delete next[date];
        return next;
      });
    } catch {
      // 저장 실패 시 입력 내용을 유지 (오류는 상위 핸들러에서 로깅됨)
    } finally {
      setSavingCreateDate(null);
    }
  };

  const isGeneralTab = activeTab === 'general';

  const tabs: Array<{ id: Tab; label: string; icon: LucideIcon; count: number }> = [
    {
      id: 'date-records',
      label: TEXT.dateRecordTab,
      icon: BookOpen,
      count: dateGroups.length,
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
    <main className="flex-1 overflow-y-auto bg-[#FBFBFA] p-4 sm:p-6">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6">
          <h2 className="mb-2 flex items-center gap-2 font-serif text-2xl font-bold text-[#4A3728]">
            {TEXT.title}
            <InfoTooltip content={TEXT.subtitle} label="메모 설명 보기" />
          </h2>
        </header>

        {isGeneralTab && (
          <section className="mb-10 rounded-[32px] border border-[#E5E3DD] bg-white p-8 shadow-sm">
            <form onSubmit={handleSubmit} className="space-y-4">
              <textarea
                value={newMemo}
                onChange={(e) => setNewMemo(e.target.value)}
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

        <div className="mb-6 flex gap-4 border-b border-[#E5E3DD]">
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

            {/* ── 날짜별 수업 탭 (수업 메모 + 하루 전체 평 통합) ── */}
            {activeTab === 'date-records' && (
              <motion.div
                key="date-records"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {dateGroups.map(({ date, records }) => {
                  const existingReview = dailyReviewsByDate.get(date);
                  const isEditing = editingReviewId === existingReview?.id;
                  const isSaving = savingReviewId === existingReview?.id;

                  return (
                    <div
                      key={date}
                      className="overflow-hidden rounded-[28px] border border-[#E5E3DD] bg-white shadow-sm"
                    >
                      {/* 날짜 헤더 */}
                      <div className="flex items-center gap-2 border-b border-[#F3F2EE] bg-[#FBFBFA] px-6 py-4">
                        <Calendar size={14} className="text-[#8B5E3C]" />
                        <span className="text-sm font-bold text-[#4A3728]">{date}</span>
                        <span className="ml-1 rounded-full bg-[#EBD9C1]/50 px-2 py-0.5 text-[10px] font-bold text-[#8B5E3C]">
                          {records.length}개 클래스
                        </span>
                      </div>

                      <div className="divide-y divide-[#F3F2EE]">
                        {/* 각 클래스 수업 메모 */}
                        {records.map((record) => {
                          const contentIds = normalizeClassroomDateRecordContentIds(record);
                          return (
                            <div key={record.id} className="flex gap-3 px-6 py-4">
                              <div className="shrink-0 pt-0.5">
                                <span className="inline-block rounded-full bg-[#FFF5E9] px-2.5 py-1 text-[11px] font-bold text-[#8B5E3C]">
                                  {classroomNamesById.get(record.classroomId) || record.classroomName}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0">
                                {record.memo.trim() ? (
                                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#4A3728]">
                                    {record.memo}
                                  </p>
                                ) : (
                                  <p className="text-sm italic text-[#C4BCB1]">
                                    {TEXT.noMemoForClass}
                                  </p>
                                )}
                                {contentIds.length > 0 && (
                                  <p className="mt-1 text-[11px] text-[#A89F94]">
                                    콘텐츠 {contentIds.length}개
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}

                        {/* 하루 전체 평 영역 */}
                        <div className="px-6 py-4">
                          {existingReview ? (
                            <div className="rounded-2xl border border-[#C8E6D4] bg-[#EEF7F0] p-4">
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <ClipboardList size={13} className="text-[#2D7A4D]" />
                                  <span className="text-[11px] font-bold text-[#2D7A4D]">
                                    {TEXT.dailyReviewBadge}
                                  </span>
                                  <span className="text-[10px] text-[#6BAF85]">
                                    {existingReview.sourceRecordIds.length}{TEXT.dailyReviewSuffix}
                                  </span>
                                </div>

                                {/* 편집 버튼 */}
                                {!isEditing && onUpdateDailyReview && (
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => handleEditStart(existingReview)}
                                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-[#2D7A4D] transition-colors hover:bg-[#C8E6D4]"
                                    >
                                      <Pencil size={11} />
                                      {TEXT.editReview}
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* 편집 모드 */}
                              {isEditing ? (
                                <div className="space-y-2">
                                  <textarea
                                    value={editingText}
                                    onChange={(e) => setEditingText(e.target.value)}
                                    rows={3}
                                    className="w-full resize-none rounded-xl border border-[#A8D5B8] bg-white px-3 py-2 text-sm leading-relaxed text-[#2D5A3D] outline-none focus:ring-2 focus:ring-[#2D7A4D]/20"
                                  />
                                  <div className="flex items-center justify-between">
                                    <span className={`text-[11px] font-bold ${editingText.length > 60 ? 'text-amber-500' : 'text-[#6BAF85]'}`}>
                                      {editingText.length}자
                                    </span>
                                    <div className="flex gap-2">
                                      <button
                                        onClick={handleEditCancel}
                                        className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-bold text-[#6BAF85] transition-colors hover:bg-[#C8E6D4]"
                                      >
                                        <X size={11} />
                                        {TEXT.cancelEdit}
                                      </button>
                                      <button
                                        onClick={() => handleEditSave(existingReview.id)}
                                        disabled={isSaving || !editingText.trim()}
                                        className="flex items-center gap-1 rounded-lg bg-[#2D7A4D] px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-[#245F3C] disabled:opacity-50"
                                      >
                                        {isSaving ? (
                                          <Loader2 size={11} className="animate-spin" />
                                        ) : (
                                          <Check size={11} />
                                        )}
                                        {isSaving ? TEXT.saving : TEXT.saveReview}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-sm leading-relaxed text-[#2D5A3D]">
                                  {existingReview.summary}
                                </p>
                              )}
                            </div>
                          ) : onCreateDailyReview ? (
                            /* 아직 하루 전체 평 없음 — 직접 작성 */
                            <div className="rounded-2xl border border-dashed border-[#C8E6D4] bg-[#F6FBF7] p-4">
                              <div className="mb-2 flex items-center gap-2">
                                <ClipboardList size={13} className="text-[#2D7A4D]" />
                                <span className="text-[11px] font-bold text-[#2D7A4D]">
                                  {TEXT.addReview}
                                </span>
                                <span className="text-[10px] text-[#6BAF85]">
                                  {records.length}{TEXT.dailyReviewSuffix}
                                </span>
                              </div>
                              <div className="space-y-2">
                                <textarea
                                  value={creatingText[date] ?? ''}
                                  onChange={(e) =>
                                    setCreatingText((prev) => ({ ...prev, [date]: e.target.value }))
                                  }
                                  rows={3}
                                  placeholder={TEXT.dailyReviewPlaceholder}
                                  className="w-full resize-none rounded-xl border border-[#A8D5B8] bg-white px-3 py-2 text-sm leading-relaxed text-[#2D5A3D] outline-none placeholder:text-[#9DC7AC] focus:ring-2 focus:ring-[#2D7A4D]/20"
                                />
                                <div className="flex items-center justify-between">
                                  <span
                                    className={`text-[11px] font-bold ${
                                      (creatingText[date]?.length ?? 0) > 60
                                        ? 'text-amber-500'
                                        : 'text-[#6BAF85]'
                                    }`}
                                  >
                                    {creatingText[date]?.length ?? 0}자
                                  </span>
                                  <button
                                    onClick={() =>
                                      handleCreateSave(
                                        date,
                                        records.map((r) => r.id)
                                      )
                                    }
                                    disabled={
                                      savingCreateDate === date ||
                                      !(creatingText[date] ?? '').trim()
                                    }
                                    className="flex items-center gap-1 rounded-lg bg-[#2D7A4D] px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-[#245F3C] disabled:opacity-50"
                                  >
                                    {savingCreateDate === date ? (
                                      <Loader2 size={11} className="animate-spin" />
                                    ) : (
                                      <Check size={11} />
                                    )}
                                    {savingCreateDate === date ? TEXT.saving : TEXT.saveReview}
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            /* 커넥터 미연결 등으로 작성 불가할 때 안내만 표시 */
                            <div className="flex items-center gap-2 rounded-2xl border border-dashed border-[#C8E6D4] bg-[#F6FBF7] px-4 py-3 text-[12px] text-[#6BAF85]">
                              <ClipboardList size={14} />
                              <span>{TEXT.noDailyReview}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {dateGroups.length === 0 && (
                  <div className="flex flex-col items-center justify-center rounded-[32px] border-2 border-dashed border-[#E5E3DD] bg-[#F3F2EE]/50 py-20 text-[#A89F94]">
                    <BookOpen size={48} className="mb-4 opacity-20" />
                    <p>{TEXT.noDateRecord}</p>
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
                    <div className="mb-4">
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

          </AnimatePresence>
        </section>
      </div>
    </main>
  );
};
