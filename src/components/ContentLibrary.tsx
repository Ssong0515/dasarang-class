import React, { useState } from 'react';
import { 
  Plus, 
  FolderPlus, 
  ChevronRight, 
  ChevronDown, 
  FileText, 
  Edit3, 
  Save, 
  X,
  LayoutGrid,
  Type,
  Code
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LessonCategory, LessonContent } from '../types';

interface ContentLibraryProps {
  categories: LessonCategory[];
  contents: LessonContent[];
  onSaveCategory: (category: Partial<LessonCategory>) => Promise<void>;
  onSaveContent: (content: Partial<LessonContent>) => Promise<void>;
}

export const ContentLibrary: React.FC<ContentLibraryProps> = ({
  categories,
  contents,
  onSaveCategory,
  onSaveContent
}) => {
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingContent, setEditingContent] = useState<Partial<LessonContent> | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const toggleCategory = (id: string) => {
    const next = new Set(expandedCategories);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedCategories(next);
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    await onSaveCategory({ name: newCategoryName });
    setNewCategoryName('');
    setIsAddingCategory(false);
  };

  const handleStartNewContent = (categoryId: string) => {
    setEditingContent({
      categoryId,
      title: '',
      html: ''
    });
  };

  const handleSaveContent = async () => {
    if (!editingContent?.title || !editingContent?.categoryId) return;
    await onSaveContent(editingContent);
    setEditingContent(null);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#FBFBFA] p-8">
      <div className="max-w-5xl mx-auto">
        <header className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-4xl font-serif font-bold text-[#4A3728] mb-2">수업 콘텐츠 라이브러리</h1>
            <p className="text-[#8B7E74]">수업에 사용할 콘텐츠를 미리 만들고 분류하여 관리하세요.</p>
          </div>
          <button 
            onClick={() => setIsAddingCategory(true)}
            className="flex items-center gap-2 px-6 py-3 bg-[#8B5E3C] text-white rounded-2xl font-bold shadow-lg shadow-[#8B5E3C]/10 hover:bg-[#724D31] transition-all"
          >
            <FolderPlus size={20} />
            새 카테고리
          </button>
        </header>

        {isAddingCategory && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white p-6 rounded-3xl border border-[#E5E3DD] mb-8 flex items-center gap-4"
          >
            <input 
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="카테고리 이름을 입력하세요"
              className="flex-1 bg-[#F3F2EE] border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#8B5E3C] outline-none"
            />
            <button 
              onClick={handleCreateCategory}
              className="px-6 py-3 bg-[#8B5E3C] text-white rounded-xl font-bold"
            >
              생성
            </button>
            <button 
              onClick={() => setIsAddingCategory(false)}
              className="p-3 text-[#8B7E74] hover:bg-[#F3F2EE] rounded-xl"
            >
              <X size={20} />
            </button>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Categories List */}
          <div className="lg:col-span-1 space-y-4">
            <h2 className="text-lg font-bold text-[#4A3728] px-2">카테고리</h2>
            {categories.map(category => (
              <div key={category.id} className="space-y-2">
                <button 
                  onClick={() => toggleCategory(category.id)}
                  className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${
                    selectedCategoryId === category.id 
                      ? 'bg-[#FFF5E9] border-[#8B5E3C] text-[#8B5E3C]' 
                      : 'bg-white border-[#E5E3DD] text-[#4A3728] hover:border-[#8B5E3C]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <LayoutGrid size={18} />
                    <span className="font-bold">{category.name}</span>
                  </div>
                  {expandedCategories.has(category.id) ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </button>
                
                <AnimatePresence>
                  {expandedCategories.has(category.id) && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden pl-4 space-y-2"
                    >
                      {contents.filter(c => c.categoryId === category.id).map(content => (
                        <button 
                          key={content.id}
                          onClick={() => setEditingContent(content)}
                          className="w-full flex items-center gap-3 p-3 text-sm text-[#8B7E74] hover:text-[#8B5E3C] hover:bg-[#FFF5E9] rounded-xl transition-all text-left"
                        >
                          <FileText size={16} />
                          <span className="truncate">{content.title}</span>
                        </button>
                      ))}
                      <button 
                        onClick={() => handleStartNewContent(category.id)}
                        className="w-full flex items-center gap-3 p-3 text-sm text-[#8B5E3C] font-bold hover:bg-[#FFF5E9] rounded-xl transition-all"
                      >
                        <Plus size={16} />
                        새 콘텐츠 추가
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>

          {/* Editor Area */}
          <div className="lg:col-span-2">
            {editingContent ? (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-white rounded-[40px] border border-[#E5E3DD] p-10 shadow-sm"
              >
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-serif font-bold text-[#4A3728]">
                    {editingContent.id ? '콘텐츠 수정' : '새 콘텐츠 작성'}
                  </h2>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setEditingContent(null)}
                      className="px-6 py-2.5 text-[#8B7E74] font-bold hover:bg-[#F3F2EE] rounded-xl transition-all"
                    >
                      취소
                    </button>
                    <button 
                      onClick={handleSaveContent}
                      className="flex items-center gap-2 px-8 py-2.5 bg-[#8B5E3C] text-white rounded-xl font-bold shadow-lg shadow-[#8B5E3C]/10 hover:bg-[#724D31] transition-all"
                    >
                      <Save size={18} />
                      저장하기
                    </button>
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="block text-xs font-bold text-[#8B5E3C] uppercase tracking-widest mb-2 flex items-center gap-2">
                      <Type size={14} /> 제목
                    </label>
                    <input 
                      type="text"
                      value={editingContent.title}
                      onChange={(e) => setEditingContent({ ...editingContent, title: e.target.value })}
                      placeholder="콘텐츠 제목을 입력하세요"
                      className="w-full bg-[#F3F2EE] border-none rounded-2xl px-6 py-4 text-lg font-bold text-[#4A3728] focus:ring-2 focus:ring-[#8B5E3C] outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#8B5E3C] uppercase tracking-widest mb-2 flex items-center gap-2">
                      <Code size={14} /> HTML 내용
                    </label>
                    <textarea 
                      value={editingContent.html}
                      onChange={(e) => setEditingContent({ ...editingContent, html: e.target.value })}
                      placeholder="HTML 코드를 입력하세요"
                      className="w-full h-[400px] bg-[#F3F2EE] border-none rounded-2xl px-6 py-4 font-mono text-sm text-[#4A3728] focus:ring-2 focus:ring-[#8B5E3C] outline-none resize-none"
                    />
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-12 bg-white rounded-[40px] border border-dashed border-[#E5E3DD] text-center">
                <div className="w-20 h-20 bg-[#F3F2EE] rounded-full flex items-center justify-center text-[#8B7E74] mb-6">
                  <Edit3 size={32} />
                </div>
                <h3 className="text-xl font-bold text-[#4A3728] mb-2">콘텐츠를 선택하거나 새로 만드세요</h3>
                <p className="text-[#8B7E74] max-w-xs">
                  왼쪽 카테고리에서 콘텐츠를 선택하여 수정하거나, 새 콘텐츠를 추가할 수 있습니다.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
