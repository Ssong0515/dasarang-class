import React, { useState } from 'react';
import { motion } from 'motion/react';
import { BookOpen, Calendar, Star, ArrowRight, Languages, ChevronDown, Sparkles, Loader2, FileText, ArrowLeft, GraduationCap, Code, Music, Brush, Globe, Cpu, Heart, Zap, Rocket, Lightbulb } from 'lucide-react';
import { LessonFolder, Lesson, LessonCategory, LessonContent } from '../types';
import { resolveAppPath } from '../utils/appPaths';

const studentIconMap: Record<string, React.FC<{ size?: number; className?: string; style?: React.CSSProperties }>> = {
  BookOpen, GraduationCap, Code, Music, Brush, Globe, Cpu, Heart, Zap, Rocket, Star, Lightbulb
};

const FOLDER_COLORS: Record<string, string> = {
  '#8B5E3C': '#FFF5E9',
  '#3B82F6': '#EFF6FF',
  '#22C55E': '#F0FDF4',
  '#8B5CF6': '#F5F3FF',
  '#EC4899': '#FDF2F8',
  '#F97316': '#FFF7ED',
  '#14B8A6': '#F0FDFA',
  '#EF4444': '#FEF2F2',
};

interface StudentPageProps {
  onBackToAdmin?: () => void;
  onLogin?: () => void;
  isAdmin?: boolean;
  lessons?: Lesson[];
  folders?: LessonFolder[];
  categories?: LessonCategory[];
  contents?: LessonContent[];
}

type Language = 'KO' | 'EN' | 'RU' | 'ZH';
type TranslationLanguage = Exclude<Language, 'KO'>;

const translations = {
  KO: {
    title: '다사랑 학생 센터',
    subtitle: '오늘의 배움을 확인해보세요',
    backToAdmin: '관리자 페이지로 돌아가기',
    welcome: '환영합니다!',
    welcomeDesc: '선생님이 준비하신 소중한 수업 자료와 공지사항을 여기서 확인할 수 있습니다. 본인의 반을 선택하여 수업을 확인해보세요.',
    schedule: '수업 일정',
    resources: '학습 자료실',
    teacherNote: '선생님의 한마디',
    adminLogin: '관리자 로그인',
    rights: '모든 권리 보유.',
    translateBtn: 'AI 스마트 번역',
    translating: '번역 중...',
    original: '원문 보기',
    noLessons: '이 반에 등록된 수업이 아직 없습니다.',
    selectClass: '수업 반 선택하기',
    pm: '오후',
    am: '오전'
  },
  EN: {
    title: 'Dasarang Student Center',
    subtitle: 'Check out today\'s learning',
    backToAdmin: 'Back to Admin Page',
    welcome: 'Welcome!',
    welcomeDesc: 'You can find valuable lesson materials and announcements prepared by your teacher here. Select your class to check the lessons.',
    schedule: 'Lesson Schedule',
    resources: 'Learning Resources',
    teacherNote: 'Teacher\'s Note',
    adminLogin: 'Admin Login',
    rights: 'All rights reserved.',
    translateBtn: 'AI Smart Translate',
    translating: 'Translating...',
    original: 'Show Original',
    noLessons: 'No lessons registered for this class yet.',
    selectClass: 'Select Your Class',
    pm: 'PM',
    am: 'AM'
  },
  RU: {
    title: 'Студенческий центр Дасаран',
    subtitle: 'Посмотрите, что нового сегодня',
    backToAdmin: 'Вернуться в админ-панель',
    welcome: 'Добро пожаловать!',
    welcomeDesc: 'Здесь вы найдете ценные учебные материалы и объявления, подготовленные вашим учителем. Выберите свой класс, чтобы проверить уроки.',
    schedule: 'Расписание уроков',
    resources: 'Учебные ресурсы',
    teacherNote: 'Заметка учителя',
    adminLogin: 'Вход для администратора',
    rights: 'Все права защищены.',
    translateBtn: 'AI Смарт-перевод',
    translating: 'Перевод...',
    original: 'Показать оригинал',
    noLessons: 'Уроки для этого класса пока не зарегистрированы.',
    selectClass: 'Выберите свой класс',
    pm: 'дня',
    am: 'утра'
  },
  ZH: {
    title: '多爱学生中心',
    subtitle: '查看今天的学习内容',
    backToAdmin: '返回管理员页面',
    welcome: '欢迎！',
    welcomeDesc: '您可以在这里找到老师准备的宝贵课程资料和公告。请选择您的班级以查看课程。',
    schedule: '课程安排',
    resources: '学习资源库',
    teacherNote: '老师的话',
    adminLogin: '管理员登录',
    rights: '版权所有。',
    translateBtn: 'AI 智能翻译',
    translating: '翻译中...',
    original: '查看原文',
    noLessons: '该班级尚无登记的课程。',
    selectClass: '选择您的班级',
    pm: '下午',
    am: '上午'
  }
};

const languageNames = {
  KO: '한국어',
  EN: 'English',
  RU: 'Русский',
  ZH: '中文'
};

export const StudentPage: React.FC<StudentPageProps> = ({ onBackToAdmin, onLogin, isAdmin, lessons = [], folders = [], categories = [], contents = [] }) => {
  const [lang, setLang] = useState<Language>('KO');
  const [isLangOpen, setIsLangOpen] = useState(false);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [translatedContent, setTranslatedContent] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const [selectedContent, setSelectedContent] = useState<LessonContent | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const t = translations[lang];
  const activeFolder = folders.find(f => f.id === activeFolderId);

  // Lessons for active folder
  const filteredLessons = activeFolderId
    ? lessons.filter(l => l.folderId === activeFolderId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    : [];

  // Collect all unique content IDs assigned to this folder
  const allContentIds = new Set<string>();
  filteredLessons.forEach(lesson => {
    if (lesson.contentIds) lesson.contentIds.forEach(id => allContentIds.add(id));
    else if (lesson.contentId) allContentIds.add(lesson.contentId);
  });

  // Group contents by category
  const contentsByCategory = categories
    .map(cat => ({
      category: cat,
      items: contents.filter(c => c.categoryId === cat.id && allContentIds.has(c.id))
    }))
    .filter(group => group.items.length > 0);

  const handleOpenFolder = (folderId: string) => {
    setActiveFolderId(folderId);
    setSelectedContent(null);
    setTranslatedContent(null);
    setTranslateError(null);
    setOpenDropdown(null);
  };

  const handleGoHome = () => {
    setActiveFolderId(null);
    setSelectedContent(null);
    setTranslatedContent(null);
    setTranslateError(null);
    setOpenDropdown(null);
  };

  const extractTextFromHtml = (html: string) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return (doc.body.textContent || '')
      .replace(/\r/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+\n/g, '\n')
      .trim();
  };

  const handleSmartTranslate = async () => {
    if (lang === 'KO' || !selectedContent) {
      setTranslatedContent(null);
      setTranslateError(null);
      return;
    }

    const sourceText = extractTextFromHtml(selectedContent.html);
    if (!sourceText) {
      setTranslatedContent(null);
      setTranslateError('번역할 텍스트가 없습니다.');
      return;
    }

    setIsTranslating(true);
    setTranslateError(null);
    try {
      const response = await fetch(resolveAppPath('api/translate'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: sourceText,
          targetLanguage: lang as TranslationLanguage,
        }),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(errorPayload?.error || 'Translation failed');
      }

      const payload = await response.json() as { translatedText?: string };
      setTranslatedContent(payload.translatedText || null);
    } catch (error) {
      console.error("Translation failed", error);
      setTranslateError(error instanceof Error ? error.message : '번역에 실패했습니다.');
      setTranslatedContent(null);
    } finally {
      setIsTranslating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FBFBFA] font-sans text-[#4A3728]">
      {/* Header */}
      <header className="bg-white border-b border-[#E5E3DD] px-8 py-6 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-4">
          {activeFolderId && (
            <button
              onClick={handleGoHome}
              className="p-2 hover:bg-[#F3F2EE] rounded-xl transition-all text-[#8B7E74] hover:text-[#4A3728]"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <div className="flex flex-col">
            <h1 className="font-serif font-bold text-2xl text-[#141414]">
              {activeFolder ? activeFolder.name : t.title}
            </h1>
            <p className="text-xs text-[#8B7E74] font-medium">
              {activeFolder ? `${allContentIds.size}개의 학습 콘텐츠` : t.subtitle}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Language Selector */}
          <div className="relative">
            <button 
              onClick={() => setIsLangOpen(!isLangOpen)}
              className="flex items-center gap-2 px-4 py-2 bg-[#F3F2EE] rounded-xl text-sm font-bold text-[#4A3728] hover:bg-[#EAE8E2] transition-all"
            >
              <Languages size={18} className="text-[#8B5E3C]" />
              <span>{languageNames[lang]}</span>
              <ChevronDown size={14} className={`transition-transform ${isLangOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {isLangOpen && (
              <div className="absolute right-0 mt-2 w-40 bg-white border border-[#E5E3DD] rounded-2xl shadow-xl overflow-hidden z-50">
                {(Object.keys(languageNames) as Language[]).map((l) => (
                  <button
                    key={l}
                    onClick={() => {
                      setLang(l);
                      setIsLangOpen(false);
                      setTranslatedContent(null);
                      setTranslateError(null);
                    }}
                    className={`w-full text-left px-4 py-3 text-sm font-medium transition-colors hover:bg-[#FBFBFA] ${lang === l ? 'text-[#8B5E3C] bg-[#FFF5E9]' : 'text-[#4A3728]'}`}
                  >
                    {languageNames[l]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {isAdmin && onBackToAdmin && (
            <button 
              onClick={onBackToAdmin}
              className="px-4 py-2 bg-[#8B5E3C] text-white rounded-xl text-sm font-bold hover:bg-[#724D31] transition-all whitespace-nowrap"
            >
              {t.backToAdmin}
            </button>
          )}
        </div>
      </header>

      {!activeFolderId ? (
        /* =================== HOME VIEW =================== */
        <main className="max-w-5xl mx-auto p-8">
          <motion.section 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#FFF5E9] rounded-[40px] p-12 mb-12 text-center"
          >
            <h2 className="text-4xl font-serif font-bold text-[#4A3728] mb-4">{t.welcome}</h2>
            <p className="text-lg text-[#8B7E74] max-w-2xl mx-auto mb-8">
              {t.welcomeDesc}
            </p>

            <div className="mb-6">
              <span className="text-xs font-bold text-[#8B5E3C] uppercase tracking-widest bg-[#EBD9C1]/30 px-3 py-1 rounded-full">
                {t.selectClass}
              </span>
            </div>
          </motion.section>

          {/* Folder Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {folders.map((folder, idx) => {
              const folderLessons = lessons.filter(l => l.folderId === folder.id);
              const folderContentIds = new Set<string>();
              const existingContentIds = new Set(contents.map(c => c.id));
              
              folderLessons.forEach(l => {
                if (l.contentIds) {
                  l.contentIds.forEach(id => {
                    if (existingContentIds.has(id)) folderContentIds.add(id);
                  });
                } else if (l.contentId) {
                  if (existingContentIds.has(l.contentId)) folderContentIds.add(l.contentId);
                }
              });
              const folderColor = folder.color || '#8B5E3C';
              const folderBg = FOLDER_COLORS[folderColor] || '#FFF5E9';
              const IconComp = studentIconMap[folder.icon || 'BookOpen'] || BookOpen;
              return (
                <motion.button
                  key={folder.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  onClick={() => handleOpenFolder(folder.id)}
                  className="text-left bg-white p-8 rounded-[32px] border border-[#E5E3DD] shadow-sm hover:shadow-lg transition-all group"
                  style={{ ['--folder-color' as any]: folderColor }}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div 
                      className="w-12 h-12 rounded-2xl flex items-center justify-center transition-all"
                      style={{ backgroundColor: folderBg, color: folderColor }}
                    >
                      <IconComp size={24} />
                    </div>
                    <ArrowRight size={20} className="text-[#E5E3DD] group-hover:translate-x-1 transition-all" style={{ color: undefined }} />
                  </div>
                  <h3 className="text-xl font-bold mb-1" style={{ color: folderColor }}>{folder.name}</h3>
                  <p className="text-sm text-[#A89F94]">{folderContentIds.size}개 콘텐츠 · {folder.students?.length || 0}명 학생</p>
                </motion.button>
              );
            })}
          </div>
        </main>
      ) : (
        /* =================== FOLDER DETAIL VIEW =================== */
        <main className="max-w-5xl mx-auto p-8">
          {/* Category Dropdown Nav Bar */}
          {contentsByCategory.length > 0 ? (
            <>
              <div className="bg-white rounded-2xl border border-[#E5E3DD] shadow-sm p-2 mb-8 flex flex-wrap gap-1 relative">
                {contentsByCategory.map((group) => (
                  <div key={group.category.id} className="relative">
                    <button
                      onClick={() => setOpenDropdown(openDropdown === group.category.id ? null : group.category.id)}
                      className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                        openDropdown === group.category.id || (selectedContent && group.items.some(i => i.id === selectedContent.id))
                          ? 'bg-[#8B5E3C] text-white shadow-md'
                          : 'text-[#8B7E74] hover:bg-[#F3F2EE] hover:text-[#4A3728]'
                      }`}
                    >
                      {group.category.name}
                      <span className={`text-xs ${openDropdown === group.category.id || (selectedContent && group.items.some(i => i.id === selectedContent.id)) ? 'text-white/60' : 'text-[#A89F94]'}`}>({group.items.length})</span>
                      <ChevronDown size={14} className={`transition-transform duration-200 ${openDropdown === group.category.id ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Dropdown */}
                    {openDropdown === group.category.id && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="absolute top-full left-0 mt-2 w-72 bg-white border border-[#E5E3DD] rounded-2xl shadow-xl overflow-hidden z-50"
                      >
                        {group.items.map((content) => {
                          const isActive = selectedContent?.id === content.id;
                          return (
                            <button
                              key={content.id}
                              onClick={() => {
                                setSelectedContent(content);
                                setTranslatedContent(null);
                                setTranslateError(null);
                                setOpenDropdown(null);
                              }}
                              className={`w-full text-left px-5 py-3.5 flex items-center gap-3 transition-all ${
                                isActive
                                  ? 'bg-[#FFF5E9] text-[#8B5E3C]'
                                  : 'text-[#4A3728] hover:bg-[#FBFBFA]'
                              }`}
                            >
                              <FileText size={16} className={isActive ? 'text-[#8B5E3C]' : 'text-[#A89F94]'} />
                              <span className="font-medium text-sm truncate">{content.title}</span>
                            </button>
                          );
                        })}
                      </motion.div>
                    )}
                  </div>
                ))}
              </div>

              {/* Content Viewer */}
              {selectedContent ? (
                <motion.section
                  key={selectedContent.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-[32px] border border-[#E5E3DD] shadow-sm overflow-hidden"
                >
                  <div className="flex items-center justify-between px-8 py-5 border-b border-[#F3F2EE]">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-[#FFF5E9] rounded-xl flex items-center justify-center">
                        <FileText size={16} className="text-[#8B5E3C]" />
                      </div>
                      <h3 className="text-lg font-bold text-[#4A3728]">{selectedContent.title}</h3>
                    </div>
                    {lang !== 'KO' && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => void handleSmartTranslate()}
                          disabled={isTranslating}
                          className="inline-flex items-center gap-2 rounded-xl bg-[#8B5E3C] px-4 py-2 text-sm font-bold text-white transition-all hover:bg-[#724D31] disabled:cursor-wait disabled:opacity-70"
                        >
                          {isTranslating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                          <span>{isTranslating ? t.translating : t.translateBtn}</span>
                        </button>
                        {translatedContent && (
                          <button
                            onClick={() => {
                              setTranslatedContent(null);
                              setTranslateError(null);
                            }}
                            className="rounded-xl border border-[#E5E3DD] px-4 py-2 text-sm font-bold text-[#8B7E74] transition-all hover:bg-[#FBFBFA] hover:text-[#4A3728]"
                          >
                            {t.original}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {(translatedContent || translateError) && (
                    <div className="border-b border-[#F3F2EE] bg-[#FBFBFA] px-8 py-6">
                      <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#A89F94]">
                        {languageNames[lang]}
                      </p>
                      {translatedContent ? (
                        <p className="whitespace-pre-wrap text-sm leading-7 text-[#4A3728]">{translatedContent}</p>
                      ) : (
                        <p className="text-sm font-medium text-[#C84B31]">{translateError}</p>
                      )}
                    </div>
                  )}
                  <iframe
                    srcDoc={selectedContent.html + `<script>
                      function sendHeight() {
                        var h = document.documentElement.scrollHeight;
                        window.parent.postMessage({type:'iframe-height', height: h}, '*');
                      }
                      window.addEventListener('load', function() { setTimeout(sendHeight, 100); });
                      new MutationObserver(sendHeight).observe(document.body, {childList:true, subtree:true, attributes:true});
                      window.addEventListener('resize', sendHeight);
                      setTimeout(sendHeight, 300);
                      setTimeout(sendHeight, 1000);
                    <\/script>`}
                    className="w-full rounded-b-[32px]"
                    style={{ border: 'none', overflow: 'hidden' }}
                    scrolling="no"
                    sandbox="allow-scripts allow-same-origin"
                    title={selectedContent.title}
                    onLoad={(e) => {
                      const iframe = e.target as HTMLIFrameElement;
                      try {
                        const h = iframe.contentDocument?.documentElement.scrollHeight;
                        if (h) iframe.style.height = h + 'px';
                      } catch(_) {}
                    }}
                    ref={(el) => {
                      if (!el) return;
                      const handler = (e: MessageEvent) => {
                        if (e.data?.type === 'iframe-height' && e.data.height) {
                          el.style.height = e.data.height + 'px';
                        }
                      };
                      window.addEventListener('message', handler);
                      (el as any)._cleanupHandler = handler;
                    }}
                  />
                </motion.section>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-white rounded-[32px] border border-[#E5E3DD] p-16 text-center"
                >
                  <FileText size={48} className="text-[#E5E3DD] mx-auto mb-4" />
                  <p className="text-lg font-bold text-[#8B7E74] mb-2">위의 카테고리를 클릭하여 콘텐츠를 선택하세요</p>
                  <p className="text-sm text-[#A89F94]">학습 자료가 여기에 표시됩니다</p>
                </motion.div>
              )}
            </>
          ) : (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-[40px] p-12 mb-12 border border-[#E5E3DD] shadow-sm text-center"
            >
              <BookOpen size={48} className="text-[#E5E3DD] mx-auto mb-4" />
              <p className="text-lg font-bold text-[#8B7E74]">{t.noLessons}</p>
            </motion.section>
          )}
        </main>
      )}

      <footer className="mt-20 py-12 border-t border-[#E5E3DD] text-center">
        <p className="text-sm text-[#8B7E74] mb-4">© 2024 다사랑 교실. {t.rights}</p>
        {!isAdmin && onLogin && (
          <button 
            onClick={onLogin}
            className="text-[#E5E3DD] hover:text-[#8B7E74] text-[10px] uppercase tracking-widest transition-colors"
          >
            {t.adminLogin}
          </button>
        )}
      </footer>
    </div>
  );
};
