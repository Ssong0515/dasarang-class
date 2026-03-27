import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  BookOpen,
  ArrowRight,
  Languages,
  ChevronDown,
  FileText,
  ArrowLeft,
  GraduationCap,
  Code,
  Music,
  Brush,
  Globe,
  Cpu,
  Heart,
  Zap,
  Rocket,
  Star,
  Lightbulb,
} from 'lucide-react';
import { LessonFolder, Lesson, LessonCategory, LessonContent } from '../types';
import { resolveAppPath } from '../utils/appPaths';
import { StudentContentCard } from './StudentContentPreview';
import { getAssignedContentIdsForFolder } from '../utils/folderContentAssignments';

const studentIconMap: Record<
  string,
  React.FC<{ size?: number; className?: string; style?: React.CSSProperties }>
> = {
  BookOpen,
  GraduationCap,
  Code,
  Music,
  Brush,
  Globe,
  Cpu,
  Heart,
  Zap,
  Rocket,
  Star,
  Lightbulb,
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

const STUDENT_HOME_HISTORY_VIEW = 'student-home';
const STUDENT_FOLDER_HISTORY_VIEW = 'student-folder';

interface StudentPageProps {
  onBackToAdmin?: () => void;
  onLogin?: () => void;
  isAdmin?: boolean;
  embeddedInAdminShell?: boolean;
  lessons?: Lesson[];
  folders?: LessonFolder[];
  categories?: LessonCategory[];
  contents?: LessonContent[];
}

type Language = 'KO' | 'EN' | 'RU' | 'ZH';
type TranslationLanguage = Exclude<Language, 'KO'>;

type StudentHistoryState = {
  studentPageView?: typeof STUDENT_HOME_HISTORY_VIEW | typeof STUDENT_FOLDER_HISTORY_VIEW;
  studentFolderId?: string | null;
};

const translations = {
  KO: {
    title: '다사랑 학생 센터',
    subtitle: '오늘의 배움을 확인해보세요',
    backToAdmin: '관리자 페이지로 돌아가기',
    welcome: '환영합니다!',
    welcomeDesc:
      '선생님이 준비하신 소중한 수업 자료와 공지사항을 여기서 확인할 수 있습니다. 본인의 반을 선택하여 수업을 확인해보세요.',
    schedule: '수업 일정',
    resources: '학습 자료실',
    teacherNote: '선생님의 한마디',
    adminLogin: '관리자 로그인',
    rights: '모든 권리 보유.',
    translateBtn: 'AI 스마트 번역',
    translating: '번역 중...',
    original: '원문 보기',
    noLessons: '이 반에 등록된 수업이 아직 없습니다.',
    noVisibleContents: '표시 가능한 콘텐츠가 없습니다.',
    selectClass: '수업 반 선택하기',
    pm: '오후',
    am: '오전',
  },
  EN: {
    title: 'Dasarang Student Center',
    subtitle: "Check out today's learning",
    backToAdmin: 'Back to Admin Page',
    welcome: 'Welcome!',
    welcomeDesc:
      'You can find valuable lesson materials and announcements prepared by your teacher here. Select your class to check the lessons.',
    schedule: 'Lesson Schedule',
    resources: 'Learning Resources',
    teacherNote: "Teacher's Note",
    adminLogin: 'Admin Login',
    rights: 'All rights reserved.',
    translateBtn: 'AI Smart Translate',
    translating: 'Translating...',
    original: 'Show Original',
    noLessons: 'No lessons registered for this class yet.',
    noVisibleContents: 'No visible content is available.',
    selectClass: 'Select Your Class',
    pm: 'PM',
    am: 'AM',
  },
  RU: {
    title: 'Студенческий центр Дасаран',
    subtitle: 'Посмотрите, что нового сегодня',
    backToAdmin: 'Вернуться в админ-панель',
    welcome: 'Добро пожаловать!',
    welcomeDesc:
      'Здесь вы найдете ценные учебные материалы и объявления, подготовленные вашим учителем. Выберите свой класс, чтобы проверить уроки.',
    schedule: 'Расписание уроков',
    resources: 'Учебные ресурсы',
    teacherNote: 'Заметка учителя',
    adminLogin: 'Вход для администратора',
    rights: 'Все права защищены.',
    translateBtn: 'AI Смарт-перевод',
    translating: 'Перевод...',
    original: 'Показать оригинал',
    noLessons: 'Уроки для этого класса пока не зарегистрированы.',
    noVisibleContents: 'Нет доступного содержимого для показа.',
    selectClass: 'Выберите свой класс',
    pm: 'дня',
    am: 'утра',
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
    noVisibleContents: '当前没有可显示的内容。',
    selectClass: '选择您的班级',
    pm: '下午',
    am: '上午',
  },
};

const languageNames = {
  KO: '한국어',
  EN: 'English',
  RU: 'Русский',
  ZH: '中文',
};

const getStudentHistoryState = (value: unknown): StudentHistoryState => {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const state = value as Record<string, unknown>;
  const studentPageView =
    state.studentPageView === STUDENT_HOME_HISTORY_VIEW ||
    state.studentPageView === STUDENT_FOLDER_HISTORY_VIEW
      ? state.studentPageView
      : undefined;

  return {
    studentPageView,
    studentFolderId: typeof state.studentFolderId === 'string' ? state.studentFolderId : null,
  };
};

const getMergedStudentHistoryState = (
  nextView: StudentHistoryState['studentPageView'],
  nextFolderId: string | null = null
) => {
  if (typeof window === 'undefined') {
    return {
      studentPageView: nextView,
      studentFolderId: nextFolderId,
    };
  }

  const baseState =
    window.history.state && typeof window.history.state === 'object'
      ? (window.history.state as Record<string, unknown>)
      : {};

  return {
    ...baseState,
    studentPageView: nextView,
    studentFolderId: nextFolderId,
  };
};

const getInitialActiveFolderId = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  const historyState = getStudentHistoryState(window.history.state);
  if (historyState.studentPageView === STUDENT_FOLDER_HISTORY_VIEW && historyState.studentFolderId) {
    return historyState.studentFolderId;
  }

  return null;
};

const getFolderTranslationCacheKey = (
  folderId: string,
  folderName: string,
  language: TranslationLanguage
) => `${folderId}::${folderName}::${language}`;

const translateText = async (
  text: string,
  targetLanguage: TranslationLanguage,
  signal: AbortSignal
) => {
  const response = await fetch(resolveAppPath('api/translate'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      targetLanguage,
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error('Translation failed');
  }

  const payload = (await response.json()) as { translatedText?: string };
  return payload.translatedText?.trim() || null;
};

export const StudentPage: React.FC<StudentPageProps> = ({
  onBackToAdmin,
  onLogin,
  isAdmin,
  embeddedInAdminShell = false,
  lessons = [],
  folders = [],
  categories = [],
  contents = [],
}) => {
  const [lang, setLang] = useState<Language>('KO');
  const [isLangOpen, setIsLangOpen] = useState(false);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(getInitialActiveFolderId);
  const [selectedContent, setSelectedContent] = useState<LessonContent | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [translatedFolderNames, setTranslatedFolderNames] = useState<Record<string, string>>({});

  const homeTranslationCacheRef = useRef<Record<string, string>>({});
  const homeTranslationRequestIdRef = useRef(0);
  const hasManagedHistoryEntryRef = useRef(false);

  const homeT = translations[lang];
  const detailT = translations.KO;
  const currentT = activeFolderId ? detailT : homeT;
  const activeFolder = folders.find((folder) => folder.id === activeFolderId);

  const categorizedContents = contents.filter((content) => content.categoryId !== null);
  const categorizedContentIds = new Set(categorizedContents.map((content) => content.id));
  const assignedContentIds = activeFolder
    ? getAssignedContentIdsForFolder(activeFolder, lessons)
    : [];
  const visibleAssignedContentIds = new Set(
    assignedContentIds.filter((id) => categorizedContentIds.has(id))
  );
  const visibleContents = categorizedContents.filter((content) =>
    visibleAssignedContentIds.has(content.id)
  );
  const visibleContentIds = new Set(visibleContents.map((content) => content.id));

  const contentsByCategory = categories
    .map((category) => ({
      category,
      items: visibleContents.filter((content) => content.categoryId === category.id),
    }))
    .filter((group) => group.items.length > 0);

  const applyHomeViewState = () => {
    setActiveFolderId(null);
    setSelectedContent(null);
    setOpenDropdown(null);
    setIsLangOpen(false);
  };

  const applyFolderViewState = (folderId: string) => {
    setActiveFolderId(folderId);
    setSelectedContent(null);
    setOpenDropdown(null);
    setIsLangOpen(false);
  };

  const handleOpenFolder = (folderId: string) => {
    if (typeof window !== 'undefined') {
      window.history.pushState(
        getMergedStudentHistoryState(STUDENT_FOLDER_HISTORY_VIEW, folderId),
        ''
      );
      hasManagedHistoryEntryRef.current = true;
    }

    applyFolderViewState(folderId);
  };

  const handleGoHome = () => {
    if (typeof window !== 'undefined') {
      const historyState = getStudentHistoryState(window.history.state);
      if (
        historyState.studentPageView === STUDENT_FOLDER_HISTORY_VIEW &&
        hasManagedHistoryEntryRef.current
      ) {
        window.history.back();
        return;
      }

      window.history.replaceState(getMergedStudentHistoryState(STUDENT_HOME_HISTORY_VIEW), '');
    }

    applyHomeViewState();
  };

  const getFolderDisplayName = (folder: LessonFolder) => {
    if (lang === 'KO') {
      return folder.name;
    }

    return translatedFolderNames[folder.id] || folder.name;
  };

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const historyState = getStudentHistoryState(window.history.state);
    if (historyState.studentPageView === STUDENT_FOLDER_HISTORY_VIEW && historyState.studentFolderId) {
      hasManagedHistoryEntryRef.current = true;
      applyFolderViewState(historyState.studentFolderId);
    } else {
      window.history.replaceState(getMergedStudentHistoryState(STUDENT_HOME_HISTORY_VIEW), '');
      hasManagedHistoryEntryRef.current = true;
    }

    const handlePopState = (event: PopStateEvent) => {
      hasManagedHistoryEntryRef.current = true;
      const nextState = getStudentHistoryState(event.state);
      if (nextState.studentPageView === STUDENT_FOLDER_HISTORY_VIEW && nextState.studentFolderId) {
        applyFolderViewState(nextState.studentFolderId);
        return;
      }

      applyHomeViewState();
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (selectedContent && !visibleContentIds.has(selectedContent.id)) {
      setSelectedContent(null);
      setOpenDropdown(null);
    }
  }, [selectedContent, visibleContentIds]);

  useEffect(() => {
    if (lang === 'KO') {
      setTranslatedFolderNames({});
      return;
    }

    if (activeFolderId) {
      return;
    }

    const targetLanguage = lang as TranslationLanguage;
    const requestId = ++homeTranslationRequestIdRef.current;
    const controller = new AbortController();

    const cachedTranslations = folders.reduce<Record<string, string>>((accumulator, folder) => {
      const cacheKey = getFolderTranslationCacheKey(folder.id, folder.name, targetLanguage);
      const cachedValue = homeTranslationCacheRef.current[cacheKey];
      if (cachedValue) {
        accumulator[folder.id] = cachedValue;
      }
      return accumulator;
    }, {});

    setTranslatedFolderNames(cachedTranslations);

    const pendingFolders = folders.filter((folder) => {
      const cacheKey = getFolderTranslationCacheKey(folder.id, folder.name, targetLanguage);
      return Boolean(folder.name.trim()) && !homeTranslationCacheRef.current[cacheKey];
    });

    if (pendingFolders.length === 0) {
      return () => controller.abort();
    }

    void (async () => {
      const results = await Promise.allSettled(
        pendingFolders.map(async (folder) => ({
          folderId: folder.id,
          cacheKey: getFolderTranslationCacheKey(folder.id, folder.name, targetLanguage),
          translatedName: await translateText(folder.name, targetLanguage, controller.signal),
        }))
      );

      if (controller.signal.aborted || requestId !== homeTranslationRequestIdRef.current) {
        return;
      }

      const nextTranslations: Record<string, string> = {};
      results.forEach((result) => {
        if (result.status !== 'fulfilled') {
          const reason = result.reason;
          if (!(reason instanceof DOMException && reason.name === 'AbortError')) {
            console.error('Folder translation failed', reason);
          }
          return;
        }

        if (!result.value.translatedName) {
          return;
        }

        homeTranslationCacheRef.current[result.value.cacheKey] = result.value.translatedName;
        nextTranslations[result.value.folderId] = result.value.translatedName;
      });

      if (Object.keys(nextTranslations).length > 0) {
        setTranslatedFolderNames((current) => ({
          ...current,
          ...nextTranslations,
        }));
      }
    })().catch((error) => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        console.error('Folder translation batch failed', error);
      }
    });

    return () => controller.abort();
  }, [activeFolderId, folders, lang]);

  return (
    <div
      className={`bg-[#FBFBFA] font-sans text-[#4A3728] ${
        embeddedInAdminShell ? 'flex min-h-0 flex-1 flex-col overflow-y-auto' : 'min-h-screen'
      }`}
    >
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-[#E5E3DD] bg-white px-8 py-6">
        <div className="flex items-center gap-4">
          {activeFolderId && (
            <button
              onClick={handleGoHome}
              className="rounded-xl p-2 text-[#8B7E74] transition-all hover:bg-[#F3F2EE] hover:text-[#4A3728]"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <div className="flex flex-col">
            <h1 className="font-serif text-2xl font-bold text-[#141414]">
              {activeFolder ? activeFolder.name : currentT.title}
            </h1>
            <p className="text-xs font-medium text-[#8B7E74]">
              {activeFolder ? `${visibleAssignedContentIds.size}개의 학습 콘텐츠` : currentT.subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {!activeFolderId && (
            <div className="relative">
              <button
                onClick={() => setIsLangOpen((current) => !current)}
                className="flex items-center gap-2 rounded-xl bg-[#F3F2EE] px-4 py-2 text-sm font-bold text-[#4A3728] transition-all hover:bg-[#EAE8E2]"
              >
                <Languages size={18} className="text-[#8B5E3C]" />
                <span>{languageNames[lang]}</span>
                <ChevronDown
                  size={14}
                  className={`transition-transform ${isLangOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {isLangOpen && (
                <div className="absolute right-0 z-50 mt-2 w-40 overflow-hidden rounded-2xl border border-[#E5E3DD] bg-white shadow-xl">
                  {(Object.keys(languageNames) as Language[]).map((language) => (
                    <button
                      key={language}
                      onClick={() => {
                        setLang(language);
                        setIsLangOpen(false);
                      }}
                      className={`w-full px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-[#FBFBFA] ${
                        lang === language
                          ? 'bg-[#FFF5E9] text-[#8B5E3C]'
                          : 'text-[#4A3728]'
                      }`}
                    >
                      {languageNames[language]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {isAdmin && onBackToAdmin && (
            <button
              onClick={onBackToAdmin}
              className="whitespace-nowrap rounded-xl bg-[#8B5E3C] px-4 py-2 text-sm font-bold text-white transition-all hover:bg-[#724D31]"
            >
              {currentT.backToAdmin}
            </button>
          )}
        </div>
      </header>

      {!activeFolderId ? (
        <main className="mx-auto max-w-5xl p-8">
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-12 rounded-[40px] bg-[#FFF5E9] p-12 text-center"
          >
            <h2 className="mb-4 font-serif text-4xl font-bold text-[#4A3728]">{homeT.welcome}</h2>
            <p className="mx-auto mb-8 max-w-2xl text-lg text-[#8B7E74]">{homeT.welcomeDesc}</p>

            <div className="mb-6">
              <span className="rounded-full bg-[#EBD9C1]/30 px-3 py-1 text-xs font-bold uppercase tracking-widest text-[#8B5E3C]">
                {homeT.selectClass}
              </span>
            </div>
          </motion.section>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {folders.map((folder, index) => {
              const folderContentIds = new Set(
                getAssignedContentIdsForFolder(folder, lessons).filter((id) =>
                  categorizedContentIds.has(id)
                )
              );

              const folderColor = folder.color || '#8B5E3C';
              const folderBg = FOLDER_COLORS[folderColor] || '#FFF5E9';
              const IconComp = studentIconMap[folder.icon || 'BookOpen'] || BookOpen;

              return (
                <motion.button
                  key={folder.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  onClick={() => handleOpenFolder(folder.id)}
                  className="group rounded-[32px] border border-[#E5E3DD] bg-white p-8 text-left shadow-sm transition-all hover:shadow-lg"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-2xl transition-all"
                      style={{ backgroundColor: folderBg, color: folderColor }}
                    >
                      <IconComp size={24} />
                    </div>
                    <ArrowRight
                      size={20}
                      className="text-[#E5E3DD] transition-all group-hover:translate-x-1"
                    />
                  </div>
                  <h3 className="mb-1 text-xl font-bold" style={{ color: folderColor }}>
                    {getFolderDisplayName(folder)}
                  </h3>
                  <p className="text-sm text-[#A89F94]">
                    {folderContentIds.size}개 콘텐츠 · {folder.students?.length || 0}명 학생
                  </p>
                </motion.button>
              );
            })}
          </div>
        </main>
      ) : (
        <main className="w-full px-4 py-8 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
          {contentsByCategory.length > 0 ? (
            <>
              <div className="relative mb-8 flex w-full max-w-none flex-wrap gap-1 rounded-2xl border border-[#E5E3DD] bg-white p-2 shadow-sm">
                {contentsByCategory.map((group) => (
                  <div key={group.category.id} className="relative max-w-full">
                    <button
                      onClick={() =>
                        setOpenDropdown(
                          openDropdown === group.category.id ? null : group.category.id
                        )
                      }
                      className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-all ${
                        openDropdown === group.category.id ||
                        (selectedContent && group.items.some((item) => item.id === selectedContent.id))
                          ? 'bg-[#8B5E3C] text-white shadow-md'
                          : 'text-[#8B7E74] hover:bg-[#F3F2EE] hover:text-[#4A3728]'
                      }`}
                    >
                      {group.category.name}
                      <span
                        className={`text-xs ${
                          openDropdown === group.category.id ||
                          (selectedContent && group.items.some((item) => item.id === selectedContent.id))
                            ? 'text-white/60'
                            : 'text-[#A89F94]'
                        }`}
                      >
                        ({group.items.length})
                      </span>
                      <ChevronDown
                        size={14}
                        className={`transition-transform duration-200 ${
                          openDropdown === group.category.id ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    {openDropdown === group.category.id && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="absolute left-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-[#E5E3DD] bg-white shadow-xl"
                      >
                        {group.items.map((content) => {
                          const isActive = selectedContent?.id === content.id;
                          return (
                            <button
                              key={content.id}
                              onClick={() => {
                                setSelectedContent(content);
                                setOpenDropdown(null);
                              }}
                              className={`flex w-full items-center gap-3 px-5 py-3.5 text-left transition-all ${
                                isActive
                                  ? 'bg-[#FFF5E9] text-[#8B5E3C]'
                                  : 'text-[#4A3728] hover:bg-[#FBFBFA]'
                              }`}
                            >
                              <FileText
                                size={16}
                                className={isActive ? 'text-[#8B5E3C]' : 'text-[#A89F94]'}
                              />
                              <span className="truncate text-sm font-medium">{content.title}</span>
                            </button>
                          );
                        })}
                      </motion.div>
                    )}
                  </div>
                ))}
              </div>

              {selectedContent ? (
                <motion.div
                  key={selectedContent.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <StudentContentCard
                    content={selectedContent}
                    showDescriptionToggle={Boolean(isAdmin)}
                  />
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="w-full max-w-none rounded-[32px] border border-[#E5E3DD] bg-white p-10 text-center sm:p-16"
                >
                  <FileText size={48} className="mx-auto mb-4 text-[#E5E3DD]" />
                  <p className="mb-2 text-lg font-bold text-[#8B7E74]">
                    위의 카테고리를 클릭하여 콘텐츠를 선택하세요
                  </p>
                  <p className="text-sm text-[#A89F94]">학습 자료가 여기에 표시됩니다</p>
                </motion.div>
              )}
            </>
          ) : (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-12 w-full max-w-none rounded-[40px] border border-[#E5E3DD] bg-white p-12 text-center shadow-sm"
            >
              <BookOpen size={48} className="mx-auto mb-4 text-[#E5E3DD]" />
              <p className="text-lg font-bold text-[#8B7E74]">
                {detailT.noVisibleContents}
              </p>
            </motion.section>
          )}
        </main>
      )}

      <footer className="mt-20 border-t border-[#E5E3DD] py-12 text-center">
        <p className="mb-4 text-sm text-[#8B7E74]">© 2024 다사랑 교실. {currentT.rights}</p>
        {!isAdmin && onLogin && (
          <button
            onClick={onLogin}
            className="text-[10px] uppercase tracking-widest text-[#E5E3DD] transition-colors hover:text-[#8B7E74]"
          >
            {currentT.adminLogin}
          </button>
        )}
      </footer>
    </div>
  );
};
