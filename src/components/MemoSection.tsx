import React, { useState } from 'react';
import { Plus, Trash2, Calendar, StickyNote } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Memo } from '../types';

interface MemoSectionProps {
  memos: Memo[];
  onAddMemo: (content: string) => void;
  onDeleteMemo: (id: string) => void;
}

export const MemoSection: React.FC<MemoSectionProps> = ({ memos, onAddMemo, onDeleteMemo }) => {
  const [newMemo, setNewMemo] = useState('');

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

        {/* Memo List */}
        <section className="space-y-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-serif font-bold text-[#4A3728]">저장된 메모 ({memos.length})</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
              <div className="col-span-full py-20 flex flex-col items-center justify-center text-[#A89F94] bg-[#F3F2EE]/50 rounded-[32px] border-2 border-dashed border-[#E5E3DD]">
                <StickyNote size={48} className="mb-4 opacity-20" />
                <p>아직 저장된 메모가 없습니다.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
};
