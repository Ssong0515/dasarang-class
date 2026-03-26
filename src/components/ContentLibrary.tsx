import React, { useEffect, useState } from 'react';
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
  Code,
  Trash2,
  Eye,
  Maximize2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LessonCategory, LessonContent } from '../types';
import { StudentContentCard, StudentContentPreviewFrame } from './StudentContentPreview';

interface ContentLibraryProps {
  categories: LessonCategory[];
  contents: LessonContent[];
  onSaveCategory: (category: Partial<LessonCategory>) => Promise<void>;
  onSaveContent: (content: Partial<LessonContent>) => Promise<LessonContent>;
  onDeleteCategory: (id: string) => Promise<void>;
  onDeleteContent: (id: string) => Promise<void>;
}

type EditorTab = 'edit' | 'preview';
type ContentMode = 'create' | 'preview' | 'edit';

export const ContentLibrary: React.FC<ContentLibraryProps> = ({
  categories,
  contents,
  onSaveCategory,
  onSaveContent,
  onDeleteCategory,
  onDeleteContent,
}) => {
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingContent, setEditingContent] = useState<Partial<LessonContent> | null>(null);
  const [savedContentSnapshot, setSavedContentSnapshot] = useState<LessonContent | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [editorTab, setEditorTab] = useState<EditorTab>('edit');
  const [contentMode, setContentMode] = useState<ContentMode>('create');
  const [isFullscreenPreviewOpen, setIsFullscreenPreviewOpen] = useState(false);

  const previewContent = editingContent?.categoryId
    ? ({
        id: editingContent.id ?? '__preview__',
        categoryId: editingContent.categoryId,
        ownerUid: editingContent.ownerUid ?? '',
        title: editingContent.title?.trim() || '미리보기 콘텐츠',
        html: editingContent.html ?? '',
        createdAt: editingContent.createdAt ?? new Date().toISOString(),
      } satisfies LessonContent)
    : null;

  const hasPreviewHtml = Boolean(previewContent?.html.trim());
  const isPreviewMode = contentMode === 'preview';
  const isExistingContent = Boolean(editingContent?.id);
  const editorTitle =
    contentMode === 'create'
      ? '새 콘텐츠 작성'
      : isPreviewMode
        ? '콘텐츠 미리보기'
        : '콘텐츠 수정';

  useEffect(() => {
    if (!editingContent?.html?.trim()) {
      setIsFullscreenPreviewOpen(false);
    }
  }, [editingContent]);

  const toggleCategory = (id: string) => {
    const next = new Set(expandedCategories);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      setSelectedCategoryId(id);
    }
    setExpandedCategories(next);
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) {
      return;
    }

    await onSaveCategory({ name: newCategoryName });
    setNewCategoryName('');
    setIsAddingCategory(false);
  };

  const handleStartNewContent = (categoryId: string) => {
    setEditingContent({
      categoryId,
      title: '',
      html: '',
    });
    setSavedContentSnapshot(null);
    setSelectedCategoryId(categoryId);
    setContentMode('create');
    setEditorTab('edit');
  };

  const handleOpenSavedContent = (content: LessonContent) => {
    setEditingContent(content);
    setSavedContentSnapshot(content);
    setSelectedCategoryId(content.categoryId);
    setContentMode('preview');
    setEditorTab('preview');
  };

  const handleCloseEditor = () => {
    setEditingContent(null);
    setSavedContentSnapshot(null);
    setContentMode('create');
    setEditorTab('edit');
    setIsFullscreenPreviewOpen(false);
  };

  const handleCancel = () => {
    if (contentMode === 'create') {
      handleCloseEditor();
      return;
    }

    if (contentMode === 'edit' && savedContentSnapshot) {
      setEditingContent(savedContentSnapshot);
      setContentMode('preview');
      setEditorTab('preview');
      return;
    }

    handleCloseEditor();
  };

  const handleEnterEditMode = () => {
    setContentMode('edit');
    setEditorTab('edit');
  };

  const handleSaveContent = async () => {
    if (!editingContent?.title?.trim() || !editingContent?.categoryId) {
      return;
    }

    const savedContent = await onSaveContent({
      ...editingContent,
      title: editingContent.title.trim(),
    });

    setEditingContent(savedContent);
    setSavedContentSnapshot(savedContent);
    setSelectedCategoryId(savedContent.categoryId);
    setContentMode('preview');
    setEditorTab('preview');
  };

  const handleDeleteCurrentContent = () => {
    if (!editingContent?.id) {
      return;
    }

    void onDeleteContent(editingContent.id);
    handleCloseEditor();
  };

  const handleDeleteCategory = (categoryId: string) => {
    void onDeleteCategory(categoryId);
  };

  const handleDeleteListContent = (contentId: string) => {
    void onDeleteContent(contentId);
    if (editingContent?.id === contentId) {
      handleCloseEditor();
    }
  };

  const inputBaseClassName =
    'w-full border-none rounded-2xl px-6 py-4 outline-none transition-all';
  const readOnlyInputClassName = `${inputBaseClassName} bg-[#F8F6F2] text-[#8B7E74] cursor-default`;
  const editableInputClassName = `${inputBaseClassName} bg-[#F3F2EE] text-[#4A3728] focus:ring-2 focus:ring-[#8B5E3C]`;

  return (
    <div className="flex-1 overflow-y-auto bg-[#FBFBFA] p-8">
      <div className="max-w-5xl mx-auto">
        <header className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-4xl font-serif font-bold text-[#4A3728] mb-2">수업 콘텐츠 라이브러리</h1>
            <p className="text-[#8B7E74]">수업에 사용할 콘텐츠를 미리 만들고 분류해서 관리하세요.</p>
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
              onClick={() => void handleCreateCategory()}
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
          <div className="lg:col-span-1 space-y-4">
            <h2 className="text-lg font-bold text-[#4A3728] px-2">카테고리</h2>
            {categories.map((category) => (
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
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCategory(category.id);
                      }}
                      className="p-2 text-[#A89F94] hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                      title="카테고리 삭제"
                    >
                      <Trash2 size={16} />
                    </button>
                    {expandedCategories.has(category.id) ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  </div>
                </button>

                <AnimatePresence>
                  {expandedCategories.has(category.id) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden pl-4 space-y-2"
                    >
                      {contents
                        .filter((content) => content.categoryId === category.id)
                        .map((content) => (
                          <button
                            key={content.id}
                            onClick={() => handleOpenSavedContent(content)}
                            className="group w-full flex items-center gap-3 p-3 text-sm text-[#8B7E74] hover:text-[#8B5E3C] hover:bg-[#FFF5E9] rounded-xl transition-all text-left"
                          >
                            <FileText size={16} />
                            <span className="truncate flex-1">{content.title}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteListContent(content.id);
                              }}
                              className="p-1.5 opacity-0 group-hover:opacity-100 text-[#A89F94] hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                              title="콘텐츠 삭제"
                            >
                              <Trash2 size={14} />
                            </button>
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

          <div className="lg:col-span-2">
            {editingContent ? (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-white rounded-[40px] border border-[#E5E3DD] p-10 shadow-sm"
              >
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-serif font-bold text-[#4A3728]">{editorTitle}</h2>
                  <div className="flex gap-2">
                    {!isPreviewMode && (
                      <button
                        onClick={handleCancel}
                        className="px-6 py-2.5 text-[#8B7E74] font-bold hover:bg-[#F3F2EE] rounded-xl transition-all"
                      >
                        취소
                      </button>
                    )}
                    {isExistingContent && (
                      <button
                        onClick={handleDeleteCurrentContent}
                        className="flex items-center gap-2 px-6 py-2.5 text-red-500 font-bold hover:bg-red-50 rounded-xl transition-all"
                      >
                        <Trash2 size={18} />
                        삭제
                      </button>
                    )}
                    {isPreviewMode ? (
                      <button
                        onClick={handleEnterEditMode}
                        className="flex items-center gap-2 px-8 py-2.5 bg-[#8B5E3C] text-white rounded-xl font-bold shadow-lg shadow-[#8B5E3C]/10 hover:bg-[#724D31] transition-all"
                      >
                        <Edit3 size={18} />
                        수정
                      </button>
                    ) : (
                      <button
                        onClick={() => void handleSaveContent()}
                        className="flex items-center gap-2 px-8 py-2.5 bg-[#8B5E3C] text-white rounded-xl font-bold shadow-lg shadow-[#8B5E3C]/10 hover:bg-[#724D31] transition-all"
                      >
                        <Save size={18} />
                        저장
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="block text-xs font-bold text-[#8B5E3C] uppercase tracking-widest mb-2 flex items-center gap-2">
                      <Type size={14} /> 제목
                    </label>
                    <input
                      type="text"
                      value={editingContent.title ?? ''}
                      readOnly={isPreviewMode}
                      onChange={(e) => setEditingContent({ ...editingContent, title: e.target.value })}
                      placeholder="콘텐츠 제목을 입력하세요"
                      className={`${isPreviewMode ? readOnlyInputClassName : editableInputClassName} text-lg font-bold`}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-bold text-[#8B5E3C] uppercase tracking-widest flex items-center gap-2">
                        <Code size={14} /> HTML 내용
                      </label>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center bg-[#F3F2EE] rounded-xl p-1 gap-1">
                          <button
                            onClick={() => setEditorTab('edit')}
                            disabled={isPreviewMode}
                            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all disabled:cursor-not-allowed disabled:opacity-45 ${
                              editorTab === 'edit'
                                ? 'bg-white text-[#8B5E3C] shadow-sm'
                                : 'text-[#8B7E74] hover:text-[#4A3728]'
                            }`}
                          >
                            <Code size={13} />
                            편집
                          </button>
                          <button
                            onClick={() => setEditorTab('preview')}
                            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                              editorTab === 'preview'
                                ? 'bg-white text-[#8B5E3C] shadow-sm'
                                : 'text-[#8B7E74] hover:text-[#4A3728]'
                            }`}
                          >
                            <Eye size={13} />
                            미리보기
                          </button>
                        </div>
                        <button
                          onClick={() => setIsFullscreenPreviewOpen(true)}
                          disabled={!hasPreviewHtml}
                          title="전체화면 미리보기"
                          aria-label="전체화면 미리보기"
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#E5E3DD] bg-white text-[#8B5E3C] transition-all hover:border-[#8B5E3C] hover:bg-[#FFF5E9] disabled:cursor-not-allowed disabled:border-[#ECE9E2] disabled:bg-[#F8F6F2] disabled:text-[#C8BEB2]"
                        >
                          <Maximize2 size={15} />
                        </button>
                      </div>
                    </div>

                    {editorTab === 'edit' ? (
                      <textarea
                        value={editingContent.html ?? ''}
                        readOnly={isPreviewMode}
                        onChange={(e) => setEditingContent({ ...editingContent, html: e.target.value })}
                        placeholder="HTML 코드를 입력하세요"
                        className={`w-full h-[400px] border-none rounded-2xl px-6 py-4 font-mono text-sm outline-none resize-none transition-all ${
                          isPreviewMode
                            ? 'bg-[#F8F6F2] text-[#8B7E74] cursor-default'
                            : 'bg-[#F3F2EE] text-[#4A3728] focus:ring-2 focus:ring-[#8B5E3C]'
                        }`}
                      />
                    ) : (
                      <div className="w-full h-[400px] bg-white border border-[#E5E3DD] rounded-2xl overflow-hidden">
                        {editingContent.html?.trim() ? (
                          <StudentContentPreviewFrame
                            html={editingContent.html}
                            title={editingContent.title?.trim() || '콘텐츠 미리보기'}
                            autoHeight={false}
                            className="w-full h-full"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center h-full text-[#8B7E74]">
                            <Eye size={32} className="mb-3 opacity-30" />
                            <p className="text-sm">HTML을 입력하면 여기에 미리보기가 표시됩니다.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-12 bg-white rounded-[40px] border border-dashed border-[#E5E3DD] text-center">
                <div className="w-20 h-20 bg-[#F3F2EE] rounded-full flex items-center justify-center text-[#8B7E74] mb-6">
                  <Edit3 size={32} />
                </div>
                <h3 className="text-xl font-bold text-[#4A3728] mb-2">콘텐츠를 선택하거나 새로 만들어보세요</h3>
                <p className="text-[#8B7E74] max-w-xs">
                  왼쪽 카테고리에서 콘텐츠를 선택해 확인하거나 새 콘텐츠를 추가해 수업 자료를 준비할 수 있습니다.
                </p>
              </div>
            )}
          </div>
        </div>

        <AnimatePresence>
          {isFullscreenPreviewOpen && previewContent && hasPreviewHtml && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[120] overflow-y-auto bg-[#FBFBFA]/95 backdrop-blur-sm"
            >
              <div className="min-h-full px-4 py-6 sm:px-6 lg:px-8">
                <div className="sticky top-0 z-10 mx-auto flex max-w-6xl justify-end pb-4">
                  <button
                    onClick={() => setIsFullscreenPreviewOpen(false)}
                    title="전체화면 미리보기 닫기"
                    aria-label="전체화면 미리보기 닫기"
                    className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#E5E3DD] bg-white text-[#8B7E74] shadow-sm transition-all hover:border-[#8B5E3C] hover:text-[#4A3728]"
                  >
                    <X size={20} />
                  </button>
                </div>

                <motion.div
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 24 }}
                  className="mx-auto max-w-6xl pb-10"
                >
                  <StudentContentCard content={previewContent} />
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
