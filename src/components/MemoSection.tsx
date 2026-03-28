import React, { useState } from 'react';
import { Plus, Trash2, Calendar, StickyNote, Users, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Memo, LessonFolder, Lesson } from '../types';
import { normalizeLessonContentIds } from '../utils/lessonRecordContent';

interface MemoSectionProps {
  memos: Memo[];
  folders?: LessonFolder[];
  lessons?: Lesson[];
  onAddMemo: (content: string) => void;
  onDeleteMemo: (id: string) => void;
}

type Tab = 'general' | 'lessons' | 'students';

export const MemoSection: React.FC<MemoSectionProps> = ({ memos, folders = [], lessons = [], onAddMemo, onDeleteMemo }) => {
  const [newMemo, setNewMemo] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('general');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMemo.trim()) {
      onAddMemo(newMemo);
      setNewMemo('');
    }
  };

  return (
    <main className="flex-1 overflow-y-auto bg-[#FBFBFA] p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-10">
          <h2 className="text-3xl font-serif font-bold text-[#4A3728] mb-2">메모장</h2>
          <p className="text-[#8B7E74]">수업이나 학생들에 관한 중요한 내용을 기록하세요.</p>
        </header>

        {/* New Memo Input */}
        <section className="bg-white rounded-[32px] border border-[#E5E3DD] p-8 mb-10 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <textarea
                value={newMemo}
                onChange={(e) => setNewMemo(e.target.value)}
                placeholder="새로운 메모를 입력하세요..."
                className="w-full bg-[#F3F2EE] border-none rounded-2xl p-6 text-[#4A3728] placeholder:text-[#A89F94] focus:ring-2 focus:ring-[#8B5E3C]/20 outline-none transition-all min-h-[120px] resize-none"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!newMemo.trim()}
                className="flex items-center gap-2 px-8 py-3 bg-[#8B5E3C] text-white rounded-xl font-bold shadow-lg shadow-[#8B5E3C]/20 hover:bg-[#724D31] disabled:opacity-50 disabled:shadow-none transition-all"
              >
                <Plus size={18} />
                <span>메모 저장</span>
              </button>
            </div>
          </form>
        </section>

        {/* Tabs */}
        <div className="flex gap-4 border-b border-[#E5E3DD] mb-8">
          {[
            { id: 'general', label: '기타 메모', icon: StickyNote, count: memos.length },
            { id: 'lessons', label: '수업별 메모', icon: BookOpen, count: lessons.filter(l => l.memo?.trim()).length },
            { id: 'students', label: '학생별 메모', icon: Users, count: folders.reduce((acc, f) => acc + (f.students?.filter(s => s.memo?.trim()).length || 0), 0) },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={`flex items-center gap-2 pb-4 font-bold text-sm transition-all relative ${
                activeTab === tab.id ? 'text-[#8B5E3C]' : 'text-[#8B7E74] hover:text-[#4A3728]'
              }`}
            >
              <tab.icon size={18} />
              {tab.label}
              <span className="ml-1 px-2 py-0.5 rounded-full bg-[#F3F2EE] text-[#A89F94] text-[10px]">&nbsp;{tab.count}&nbsp;</span>
              {activeTab === tab.id && (
                <motion.div 
                  layoutId="activeMemoTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#8B5E3C]" 
                />
              )}
            </button>
          ))}
        </div>

        {/* Memo List */}
        <section className="space-y-6">
          <AnimatePresence mode="wait">
            {activeTab === 'general' && (
              <motion.div
                key="general"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-6"
              >
            <AnimatePresence mode="popLayout">
              {memos.map((memo) => (
                <motion.div
                  key={memo.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="bg-white p-6 rounded-[24px] border border-[#E5E3DD] hover:shadow-md transition-all group relative"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-2 text-[11px] font-bold text-[#8B5E3C] uppercase tracking-wider">
                      <Calendar size={14} />
                      <span>{memo.date}</span>
                    </div>
                    <button
                      onClick={() => onDeleteMemo(memo.id)}
                      className="text-[#A89F94] hover:text-red-500 transition-colors p-1"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  
                  <div className="flex gap-4">
                    <div className="mt-1 text-[#EBD9C1]">
                      <StickyNote size={20} />
                    </div>
                    <p className="text-[#4A3728] leading-relaxed whitespace-pre-wrap">
                      {memo.content}
                    </p>
                  </div>
              </motion.div>
                ))}
              </AnimatePresence>

              {memos.length === 0 && (
                <div className="col-span-1 md:col-span-2 py-20 flex flex-col items-center justify-center text-[#A89F94] bg-[#F3F2EE]/50 rounded-[32px] border-2 border-dashed border-[#E5E3DD]">
                  <StickyNote size={48} className="mb-4 opacity-20" />
                  <p>아직 작성된 기타 메모가 없습니다.</p>
                </div>
              )}
            </motion.div>
            )}

            {activeTab === 'lessons' && (
              <motion.div
                key="lessons"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-6"
              >
                {lessons.filter(l => l.memo?.trim()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((lesson) => {
                  const recordedContentIds = normalizeLessonContentIds(lesson);
                  const lessonTitle = recordedContentIds.length > 0
                    ? lesson.title?.trim() || `${recordedContentIds.length}개 수업 콘텐츠`
                    : '진행 콘텐츠 미선택';

                  return (
                    <div key={lesson.id} className="bg-white p-6 rounded-[24px] border border-[#E5E3DD] shadow-sm relative">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="px-2 py-0.5 bg-[#FFF5E9] text-[#8B5E3C] text-[10px] font-bold rounded-full">{lesson.folderName}</span>
                            <span className="text-[11px] font-bold text-[#A89F94] flex items-center gap-1"><Calendar size={12}/> {lesson.date}</span>
                          </div>
                          <h4 className="font-bold text-[#4A3728] text-sm">{lessonTitle}</h4>
                        </div>
                      </div>
                      <div className="flex gap-4">
                        <div className="mt-1 text-[#EBD9C1]"><BookOpen size={20} /></div>
                        <p className="text-[#4A3728] leading-relaxed whitespace-pre-wrap text-sm">{lesson.memo}</p>
                      </div>
                    </div>
                  );
                })}
                {lessons.filter(l => l.memo?.trim()).length === 0 && (
                  <div className="col-span-full py-20 flex flex-col items-center justify-center text-[#A89F94] bg-[#F3F2EE]/50 rounded-[32px] border-2 border-dashed border-[#E5E3DD]">
                    <BookOpen size={48} className="mb-4 opacity-20" />
                    <p>수업에 작성된 메모가 없습니다. (수업 대시보드에서 작성 가능)</p>
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
                className="grid grid-cols-1 md:grid-cols-2 gap-6"
              >
                {folders.flatMap(f => (f.students || []).filter(s => s.memo?.trim()).map(s => ({ ...s, folderName: f.name }))).map((student) => (
                  <div key={student.id + student.folderName} className="bg-white p-6 rounded-[24px] border border-[#E5E3DD] shadow-sm relative">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-2 py-0.5 bg-[#EFF6FF] text-[#3B82F6] text-[10px] font-bold rounded-full">{student.folderName}</span>
                        </div>
                        <h4 className="font-bold text-[#4A3728] text-sm">{student.name} {student.age && `(${student.age}세)`}</h4>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="mt-1 text-[#BFDBFE]"><Users size={20} /></div>
                      <p className="text-[#4A3728] leading-relaxed whitespace-pre-wrap text-sm">{student.memo}</p>
                    </div>
                  </div>
                ))}
                {folders.flatMap(f => (f.students || []).filter(s => s.memo?.trim())).length === 0 && (
                  <div className="col-span-full py-20 flex flex-col items-center justify-center text-[#A89F94] bg-[#F3F2EE]/50 rounded-[32px] border-2 border-dashed border-[#E5E3DD]">
                    <Users size={48} className="mb-4 opacity-20" />
                    <p>학생별로 작성된 메모가 없습니다. (학생 명단 관리에서 작성 가능)</p>
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
