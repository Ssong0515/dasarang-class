import React, { useMemo, useState } from 'react';
import { Plus, Trash2, Calendar, StickyNote, Users, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ClassroomDateRecord, Memo, Classroom } from '../types';
import { normalizeClassroomDateRecordContentIds } from '../utils/classroomDateRecordContent';

interface MemoSectionProps {
  memos: Memo[];
  classrooms?: Classroom[];
  classroomDateRecords?: ClassroomDateRecord[];
  onAddMemo: (content: string) => void;
  onDeleteMemo: (id: string) => void;
}

type Tab = 'general' | 'date-records' | 'students';

export const MemoSection: React.FC<MemoSectionProps> = ({
  memos,
  classrooms = [],
  classroomDateRecords = [],
  onAddMemo,
  onDeleteMemo,
}) => {
  const [newMemo, setNewMemo] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('general');

  const classroomNamesById = useMemo(
    () => new Map(classrooms.map((classroom) => [classroom.id, classroom.name])),
    [classrooms]
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
    if (!newMemo.trim()) {
      return;
    }

    onAddMemo(newMemo);
    setNewMemo('');
  };

  return (
    <main className="flex-1 overflow-y-auto bg-[#FBFBFA] p-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-10">
          <h2 className="mb-2 text-3xl font-serif font-bold text-[#4A3728]">메모장</h2>
          <p className="text-[#8B7E74]">운영 메모와 날짜별 수업 메모, 학생별 메모를 한곳에서 봅니다.</p>
        </header>

        <section className="mb-10 rounded-[32px] border border-[#E5E3DD] bg-white p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <textarea
              value={newMemo}
              onChange={(event) => setNewMemo(event.target.value)}
              placeholder="새 메모를 입력하세요."
              className="min-h-[120px] w-full resize-none rounded-2xl border-none bg-[#F3F2EE] p-6 text-[#4A3728] outline-none transition-all placeholder:text-[#A89F94] focus:ring-2 focus:ring-[#8B5E3C]/20"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!newMemo.trim()}
                className="flex items-center gap-2 rounded-xl bg-[#8B5E3C] px-8 py-3 font-bold text-white shadow-lg shadow-[#8B5E3C]/20 transition-all hover:bg-[#724D31] disabled:opacity-50 disabled:shadow-none"
              >
                <Plus size={18} />
                메모 저장
              </button>
            </div>
          </form>
        </section>

        <div className="mb-8 flex gap-4 border-b border-[#E5E3DD]">
          {[
            { id: 'general', label: '기타 메모', icon: StickyNote, count: memos.length },
            {
              id: 'date-records',
              label: '수업별 메모',
              icon: BookOpen,
              count: dateRecordMemos.length,
            },
            { id: 'students', label: '학생별 메모', icon: Users, count: studentMemos.length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
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
                    <p>아직 작성된 기타 메모가 없습니다.</p>
                  </div>
                )}
              </motion.div>
            )}

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
                      ? `${recordedContentIds.length}개 수업 콘텐츠`
                      : '진행 콘텐츠 미선택';

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
                    <p>활성 날짜에 작성된 수업 메모가 없습니다.</p>
                  </div>
                )}
              </motion.div>
            )}

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
                    <p>학생별로 작성된 메모가 없습니다.</p>
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
