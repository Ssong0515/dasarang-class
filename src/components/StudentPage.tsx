import React, { useState } from 'react';
import { motion } from 'motion/react';
import { BookOpen, Calendar, Star, ArrowRight, Languages, ChevronDown, Sparkles, Loader2 } from 'lucide-react';
import { LessonFolder, Lesson } from '../types';
import { GoogleGenAI } from "@google/genai";

interface StudentPageProps {
  onBackToAdmin?: () => void;
  onLogin?: () => void;
  isAdmin?: boolean;
  lessons?: Lesson[];
  folders?: LessonFolder[];
}

type Language = 'KO' | 'EN' | 'RU' | 'ZH';

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

export const StudentPage: React.FC<StudentPageProps> = ({ onBackToAdmin, onLogin, isAdmin, lessons = [], folders = [] }) => {
  const [lang, setLang] = useState<Language>('KO');
  const [isLangOpen, setIsLangOpen] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(folders[0]?.id || null);
  const [translatedContent, setTranslatedContent] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);

  const t = translations[lang];

  // Filter lessons by selected folder
  const filteredLessons = (selectedFolderId 
    ? lessons.filter(l => l.folderId === selectedFolderId)
    : lessons).sort((a, b) => {
      if (a.order !== b.order) return (a.order || 0) - (b.order || 0);
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

  const latestLesson = filteredLessons.length > 0 ? filteredLessons[0] : null;

  // Ensure selectedFolderId is set if folders load later
  React.useEffect(() => {
    if (!selectedFolderId && folders.length > 0) {
      setSelectedFolderId(folders[0].id);
    }
  }, [folders]);

  const handleSmartTranslate = async (text: string) => {
    if (lang === 'KO') {
      setTranslatedContent(null);
      return;
    }
    
    setIsTranslating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Translate the following Korean text into ${languageNames[lang]}. 
        IMPORTANT: This is for a Korean language learning app. 
        - DO NOT translate specific Korean vocabulary words or examples written in Hangul. 
        - Keep them in their original Hangul form so students can learn them. 
        - Only translate the surrounding explanation, context, and instructions. 
        - If a word is in quotes like '사과', definitely keep it as '사과'.
        Text to translate: ${text}`,
      });
      setTranslatedContent(response.text || null);
    } catch (error) {
      console.error("Translation failed", error);
    } finally {
      setIsTranslating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FBFBFA] font-sans text-[#4A3728]">
      {/* Header */}
      <header className="bg-white border-b border-[#E5E3DD] px-8 py-6 flex justify-between items-center sticky top-0 z-50">
        <div className="flex flex-col">
          <h1 className="font-serif font-bold text-2xl text-[#141414]">{t.title}</h1>
          <p className="text-xs text-[#8B7E74] font-medium">{t.subtitle}</p>
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
                      setTranslatedContent(null); // Reset translation on lang change
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

      <main className="max-w-5xl mx-auto p-8">
        {/* Welcome Section */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#FFF5E9] rounded-[40px] p-12 mb-12 text-center"
        >
          <h2 className="text-4xl font-serif font-bold text-[#4A3728] mb-4">{t.welcome}</h2>
          <p className="text-lg text-[#8B7E74] max-w-2xl mx-auto mb-8">
            {t.welcomeDesc}
          </p>

          <div className="mb-4">
            <span className="text-xs font-bold text-[#8B5E3C] uppercase tracking-widest bg-[#EBD9C1]/30 px-3 py-1 rounded-full">
              {t.selectClass}
            </span>
          </div>

          <div className="flex flex-wrap justify-center gap-4">
            {folders.map(folder => (
              <button
                key={folder.id}
                onClick={() => {
                  setSelectedFolderId(folder.id);
                  setTranslatedContent(null);
                }}
                className={`px-6 py-3 rounded-2xl text-sm font-bold transition-all ${
                  selectedFolderId === folder.id 
                    ? 'bg-[#8B5E3C] text-white shadow-lg scale-105' 
                    : 'bg-white text-[#8B7E74] border border-[#E5E3DD] hover:border-[#8B5E3C] hover:text-[#8B5E3C]'
                }`}
              >
                {folder.name}
              </button>
            ))}
          </div>
        </motion.section>

        {/* Lesson Content Section */}
        {latestLesson?.content && (
          <motion.section 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-[40px] p-12 mb-12 border border-[#E5E3DD] shadow-sm"
          >
            <div className="prose max-w-none prose-slate prose-headings:font-serif prose-headings:text-[#4A3728] prose-p:text-[#8B7E74] prose-strong:text-[#4A3728]">
              <div dangerouslySetInnerHTML={{ __html: latestLesson.content }} />
            </div>
          </motion.section>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Recent Lessons */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white p-8 rounded-[32px] border border-[#E5E3DD] shadow-sm"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-[#F3F2EE] rounded-xl flex items-center justify-center text-[#8B5E3C]">
                <Calendar size={20} />
              </div>
              <h3 className="text-xl font-bold">{t.schedule}</h3>
            </div>
            <div className="space-y-4">
              {filteredLessons.length > 0 ? filteredLessons.slice(0, 5).map(lesson => (
                <div key={lesson.id} className="p-4 bg-[#FBFBFA] rounded-2xl border border-[#F3F2EE] flex justify-between items-center">
                  <div>
                    <p className="font-bold text-[#4A3728]">{lesson.title}</p>
                    <p className="text-xs text-[#8B7E74]">{lesson.date}</p>
                  </div>
                  <ArrowRight size={18} className="text-[#EBD9C1]" />
                </div>
              )) : (
                <p className="text-sm text-[#8B7E74] italic">{t.noLessons}</p>
              )}
            </div>
          </motion.div>

          {/* Resources */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white p-8 rounded-[32px] border border-[#E5E3DD] shadow-sm"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-[#F3F2EE] rounded-xl flex items-center justify-center text-[#8B5E3C]">
                <BookOpen size={20} />
              </div>
              <h3 className="text-xl font-bold">{t.resources}</h3>
            </div>
            <div className="space-y-4">
              {latestLesson?.resources?.map((res, idx) => (
                <div key={idx} className="p-4 bg-[#FBFBFA] rounded-2xl border border-[#F3F2EE] flex items-center gap-4">
                  <div className={`w-10 h-10 ${res.type === 'pdf' ? 'bg-[#EBD9C1]' : 'bg-[#D1E4F3]'} rounded-lg flex items-center justify-center text-white text-[10px] font-bold uppercase`}>
                    {res.type}
                  </div>
                  <div>
                    <p className="font-bold text-[#4A3728]">{res.name}</p>
                    <p className="text-xs text-[#8B7E74]">{res.info}</p>
                  </div>
                </div>
              ))}
              {(!latestLesson || !latestLesson.resources?.length) && (
                <p className="text-sm text-[#8B7E74] italic">등록된 자료가 없습니다.</p>
              )}
            </div>
          </motion.div>
        </div>

        {/* Notice Section (Teacher's Note) */}
        {latestLesson?.summary?.text && (
          <motion.section 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-12 bg-[#8B5E3C] rounded-[40px] p-10 text-white relative overflow-hidden"
          >
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Star size={20} className="fill-white" />
                  <h3 className="text-2xl font-bold">{t.teacherNote}</h3>
                </div>
                
                {lang !== 'KO' && (
                  <button 
                    onClick={() => translatedContent ? setTranslatedContent(null) : handleSmartTranslate(latestLesson.summary!.text)}
                    disabled={isTranslating}
                    className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold transition-all backdrop-blur-sm"
                  >
                    {isTranslating ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Sparkles size={14} />
                    )}
                    {translatedContent ? t.original : (isTranslating ? t.translating : t.translateBtn)}
                  </button>
                )}
              </div>
              
              <div className="space-y-4">
                <p className="text-white/90 leading-relaxed text-lg italic">
                  "{latestLesson.summary.text}"
                </p>
                
                {translatedContent && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="pt-6 border-t border-white/10"
                  >
                    <p className="text-white/70 leading-relaxed text-base italic">
                      {translatedContent}
                    </p>
                  </motion.div>
                )}
              </div>
            </div>
            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/5 rounded-full blur-3xl"></div>
          </motion.section>
        )}
      </main>

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
