import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Languages,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  ArrowLeft,
  BookOpen,
  Upload,
  CheckCircle2,
  X,
  Lock,
} from 'lucide-react';
import { Classroom, LessonCategory, LessonContent, PublishedLesson } from '../types';
import { resolveAppPath } from '../utils/appPaths';
import { StudentContentCard, StudentContentPreviewFrame } from './StudentContentPreview';
import { StudentVoiceButton, VOICE_LANG_CHANGED_EVENT } from './StudentVoiceButton';
import { StudentSubtitleOverlay } from './StudentSubtitleOverlay';
import { StudentChatPanel } from './StudentChatPanel';
import {
  getClassroomCardColors,
  getClassroomIconComponent,
} from '../utils/classroomAppearance';

const STUDENT_HOME_HISTORY_VIEW = 'student-home';
const STUDENT_CLASSROOM_HISTORY_VIEW = 'student-classroom';
const CONTENT_MENU_WIDTH = 288;
const CONTENT_MENU_MARGIN = 16;
const CONTENT_MENU_GAP = 12;
const CONTENT_MENU_MAX_HEIGHT = 360;
const CONTENT_MENU_MIN_HEIGHT = 160;

// 강사 화면(ClassroomDashboard)의 selectedDate와 동일한 로컬 날짜 계산 — 게이팅 날짜가 어긋나지 않도록 맞춘다.
const getLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// 수업 종료 안내는 종료 시각부터 이 시간까지만 보여준다 — 이후에 페이지를 여는 학생에겐 뜨지 않고, 떠 있던 안내도 자동으로 닫힌다.
const END_NOTICE_MAX_AGE_MS = 10 * 60 * 1000;

// 수업 종료 안내 — 여러 나라 학생이라 언어를 특정할 수 없어 몇 초마다 순환 표시한다.
const END_NOTICE_LANGS: { code: string; label: string; dir?: 'rtl' | 'ltr'; title: string; lines: string[] }[] = [
  {
    code: 'ko', label: '한국어', title: '오늘 수업 끝!',
    lines: [
      '오늘 수업은 여기서 마무리합니다.',
      '모두 수고 많으셨습니다! 다음에 또 만나요.',
      '이제 정리해도 좋습니다.',
      '더 연습하고 싶은 학생은 10분 정도 자율 연습 가능합니다.',
    ],
  },
  {
    code: 'ru', label: 'Русский', title: 'Урок окончен!',
    lines: [
      'На этом сегодняшний урок заканчивается.',
      'Все большие молодцы! Увидимся в следующий раз.',
      'Теперь можно собираться.',
      'Кто хочет ещё потренироваться — можно заниматься самостоятельно около 10 минут.',
    ],
  },
  {
    code: 'vi', label: 'Tiếng Việt', title: 'Hết giờ học rồi!',
    lines: [
      'Buổi học hôm nay kết thúc ở đây.',
      'Các em đã làm rất tốt! Hẹn gặp lại lần sau.',
      'Bây giờ các em có thể dọn dẹp.',
      'Bạn nào muốn luyện tập thêm có thể tự học khoảng 10 phút.',
    ],
  },
  {
    code: 'zh', label: '中文', title: '今天的课结束啦！',
    lines: [
      '今天的课到这里就结束了。',
      '大家都辛苦了！下次再见。',
      '现在可以收拾东西了。',
      '想多练习的同学可以自己再练大约 10 分钟。',
    ],
  },
  {
    code: 'en', label: 'English', title: 'Class is over!',
    lines: [
      "That's the end of today's class.",
      'Great job, everyone! See you next time.',
      'You can pack up now.',
      'If you want more practice, you can study on your own for about 10 minutes.',
    ],
  },
  {
    code: 'ur', label: 'اردو', dir: 'rtl', title: 'آج کی کلاس ختم!',
    lines: [
      'آج کی کلاس یہیں ختم ہوتی ہے۔',
      'سب نے بہت اچھا کام کیا! اگلی بار ملیں گے۔',
      'اب آپ سامان سمیٹ سکتے ہیں۔',
      'جو طالب علم مزید مشق کرنا چاہتے ہیں وہ تقریباً 10 منٹ خود سے مشق کر سکتے ہیں۔',
    ],
  },
];

// 실습 타이머 만료 후 전환 카드를 보여주는 시간 — 이 시간이 지나면(늦게 접속한 학생 포함) 카드가 뜨지 않는다.
const TIMER_NOTICE_MAX_AGE_MS = 2 * 60 * 1000;

// 실습 타이머 만료 전환 카드 — 실습이 잠기는 순간 전원에게 같은 신호.
// 우하단 언어 버튼(StudentVoiceButton)으로 언어를 고른 학생에겐 그 언어로 바로 고정해 띄우고,
// 안 고른 학생에겐(언어를 특정할 수 없어) 종전처럼 몇 초마다 순환 표시한다.
// code는 StudentVoiceButton의 iso와 같은 값이어야 고정 매칭이 된다(ko 포함, 'off'는 순환 폴백).
const TIMER_NOTICE_LANGS: { code: string; label: string; dir?: 'rtl' | 'ltr'; title: string; line: string }[] = [
  { code: 'ko', label: '한국어', title: '실습 시간 끝!', line: '이제 선생님 화면을 보세요 👀' },
  { code: 'ru', label: 'Русский', title: 'Время вышло!', line: 'Теперь посмотрите на экран учителя 👀' },
  { code: 'vi', label: 'Tiếng Việt', title: 'Hết giờ thực hành!', line: 'Bây giờ hãy nhìn màn hình của thầy/cô 👀' },
  { code: 'zh', label: '中文', title: '练习时间到！', line: '现在请看老师的屏幕 👀' },
  { code: 'en', label: 'English', title: "Time's up!", line: "Now look at the teacher's screen 👀" },
  { code: 'ur', label: 'اردو', dir: 'rtl', title: 'مشق کا وقت ختم!', line: 'اب استاد کی اسکرین دیکھیں 👀' },
  { code: 'tl', label: 'Tagalog', title: 'Tapos na ang oras!', line: 'Tingnan na ang screen ng guro 👀' },
];

// 실습 완료 기록(localStorage 키 접두) — 실습 HTML이 완료 화면에서 보내는 {type:'dasa-practice-done'}
// postMessage를 콘텐츠 id별로 남긴다. 새로고침해도 ◀ ▶ 이동 권한이 유지되게 하기 위함(기기 로컬).
const PRACTICE_DONE_STORAGE_PREFIX = 'dsr_practice_done:';

// 학생이 우하단 언어 버튼(StudentVoiceButton)에서 고른 언어(iso) — 같은 localStorage 키를 공유한다
// (StudentSubtitleOverlay와 같은 패턴). 만료 정리는 StudentVoiceButton이 마운트 시 해 준다.
const VOICE_LANG_STORAGE_KEY = 'dsr_voice_lang';
const readStudentVoiceIso = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(VOICE_LANG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { iso?: unknown };
    return typeof parsed?.iso === 'string' && parsed.iso ? parsed.iso : null;
  } catch {
    return null;
  }
};

interface StudentPageProps {
  onBackToAdmin?: () => void;
  onLogin?: () => void;
  getAuthToken?: () => Promise<string | null>;
  isAdmin?: boolean;
  embeddedInAdminShell?: boolean;
  classrooms?: Classroom[];
  categories?: LessonCategory[];
  contents?: LessonContent[];
  publishedLessons?: PublishedLesson[];
}

type Language = 'KO' | 'EN' | 'RU' | 'ZH';

type StudentHistoryState = {
  studentPageView?: typeof STUDENT_HOME_HISTORY_VIEW | typeof STUDENT_CLASSROOM_HISTORY_VIEW;
  studentClassroomId?: string | null;
};

type ContentDropdownPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

const translations = {
  KO: {
    title: '다사랑 클래스',
    subtitle: '오늘의 배움을 확인해보세요',
    backToAdmin: '관리자 페이지로 돌아가기',
    welcome: '환영합니다!',
    welcomeDesc:
      '선생님이 준비하신 소중한 수업 자료와 공지사항을 여기서 확인할 수 있습니다. 본인의 클래스를 선택하여 수업을 확인해보세요.',
    schedule: '수업 일정',
    resources: '학습 자료실',
    teacherNote: '선생님의 한마디',
    adminLogin: '관리자 로그인',
    rights: '모든 권리 보유.',
    translateBtn: 'AI 스마트 번역',
    translating: '번역 중...',
    original: '원문 보기',
    noLessons: '이 클래스에 등록된 수업이 아직 없습니다.',
    noVisibleContents: '아직 공개된 실습이 없어요. 선생님이 수업 중에 공개하면 여기에서 바로 풀 수 있어요.',
    selectClass: '수업 클래스 선택하기',
    pm: '오후',
    am: '오전',
  },
  EN: {
    title: 'Dasarang Class',
    subtitle: "Check out today's learning",
    backToAdmin: 'Back to Admin Page',
    welcome: 'Welcome!',
    welcomeDesc:
      'You can find the valuable learning materials and announcements prepared by your teacher here. Select your class to check the lessons.',
    schedule: 'Class Schedule',
    resources: 'Learning Resources',
    teacherNote: "Teacher's Note",
    adminLogin: 'Admin Login',
    rights: 'All rights reserved.',
    translateBtn: 'AI Smart Translate',
    translating: 'Translating...',
    original: 'Show Original',
    noLessons: 'No lessons have been registered for this class yet.',
    noVisibleContents: 'No practice is open yet. It will appear here the moment your teacher unlocks it during class.',
    selectClass: 'Select Your Class',
    pm: 'PM',
    am: 'AM',
  },
  RU: {
    title: 'Класс Дасаран',
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
    noVisibleContents: 'Практика пока не открыта. Она появится здесь, как только учитель откроет её во время урока.',
    selectClass: 'Выберите свой класс',
    pm: 'дня',
    am: 'утра',
  },
  ZH: {
    title: '多爱课堂',
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
    noVisibleContents: '尚未开放练习。老师在课堂上开放后，这里会立即显示。',
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
    state.studentPageView === STUDENT_CLASSROOM_HISTORY_VIEW
      ? state.studentPageView
      : undefined;

  return {
    studentPageView,
    studentClassroomId:
      typeof state.studentClassroomId === 'string' ? state.studentClassroomId : null,
  };
};

const getMergedStudentHistoryState = (
  nextView: StudentHistoryState['studentPageView'],
  nextClassroomId: string | null = null
) => {
  if (typeof window === 'undefined') {
    return {
      studentPageView: nextView,
      studentClassroomId: nextClassroomId,
    };
  }

  const baseState =
    window.history.state && typeof window.history.state === 'object'
      ? (window.history.state as Record<string, unknown>)
      : {};

  return {
    ...baseState,
    studentPageView: nextView,
    studentClassroomId: nextClassroomId,
  };
};

const getInitialActiveClassroomId = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  const historyState = getStudentHistoryState(window.history.state);
  if (
    historyState.studentPageView === STUDENT_CLASSROOM_HISTORY_VIEW &&
    historyState.studentClassroomId
  ) {
    return historyState.studentClassroomId;
  }

  return null;
};

const calculateContentDropdownPosition = (button: HTMLElement): ContentDropdownPosition => {
  const rect = button.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.max(
    180,
    Math.min(CONTENT_MENU_WIDTH, viewportWidth - CONTENT_MENU_MARGIN * 2)
  );
  const left = Math.min(
    Math.max(rect.left, CONTENT_MENU_MARGIN),
    viewportWidth - CONTENT_MENU_MARGIN - width
  );
  const belowSpace = viewportHeight - rect.bottom - CONTENT_MENU_GAP - CONTENT_MENU_MARGIN;
  const aboveSpace = rect.top - CONTENT_MENU_GAP - CONTENT_MENU_MARGIN;
  const openAbove = belowSpace < CONTENT_MENU_MIN_HEIGHT && aboveSpace > belowSpace;
  const availableHeight = Math.max(openAbove ? aboveSpace : belowSpace, CONTENT_MENU_MIN_HEIGHT);
  const maxHeight = Math.min(CONTENT_MENU_MAX_HEIGHT, availableHeight);
  const top = openAbove
    ? Math.max(CONTENT_MENU_MARGIN, rect.top - CONTENT_MENU_GAP - maxHeight)
    : Math.min(rect.bottom + CONTENT_MENU_GAP, viewportHeight - CONTENT_MENU_MARGIN - maxHeight);

  return { top, left, width, maxHeight };
};

export const StudentPage: React.FC<StudentPageProps> = ({
  onBackToAdmin,
  onLogin,
  getAuthToken,
  isAdmin,
  embeddedInAdminShell = false,
  classrooms = [],
  categories = [],
  contents = [],
  publishedLessons = [],
}) => {
  const [lang, setLang] = useState<Language>('KO');
  const [isLangOpen, setIsLangOpen] = useState(false);
  const [activeClassroomId, setActiveClassroomId] = useState<string | null>(
    getInitialActiveClassroomId
  );
  // 지금 보고 있는 실습칸 페이지(공개 목록 순서 = 페이지 번호). 교사가 새로 공개하면 그 페이지로 자동 이동하고,
  // 학생은 ◀ ▶·번호 칩으로 공개된 페이지 안에서 자유롭게 앞뒤로 오갈 수 있다.
  const [currentPageId, setCurrentPageId] = useState<string | null>(null);
  const prevPageIdsRef = useRef<string[] | null>(null);
  // 복습 ◀ ▶ 단계 이동 신호 — 현재 실습을 끝낸 학생이 그 실습 안 단계를 앞뒤로 되짚어 볼 때 쓴다.
  // seq가 바뀔 때만 iframe에 dir을 전달한다(StudentContentPreviewFrame.reviewNav). 페이지가 바뀌면 0으로.
  const [reviewNav, setReviewNav] = useState<{ seq: number; dir: number }>({ seq: 0, dir: 1 });
  // 이 학생이 완료 화면까지 간(=다 끝낸) 실습 콘텐츠 id들. ◀ ▶·번호 칩은 공개된 실습을
  // 전부 끝낸 학생에게만 열린다(그 전에는 교사 따라가기로만 이동).
  const [completedContentIds, setCompletedContentIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [contentDropdownPosition, setContentDropdownPosition] = useState<ContentDropdownPosition | null>(null);
  // 강사 미리보기 전용: 이 날짜 기준으로 '공개된 실습'을 본다. 실제 학생(isAdmin=false)은 항상 실제 오늘만 본다.
  const [previewDate, setPreviewDate] = useState(getLocalDateString(new Date()));

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isEndNoticeOpen, setIsEndNoticeOpen] = useState(false);
  const [endNoticeLang, setEndNoticeLang] = useState(0);
  // 실습 타이머용 현재 시각 — 타이머가 돌거나 방금 만료된 동안만 1초씩 갱신된다(아래 효과).
  const [timerNow, setTimerNow] = useState(() => Date.now());
  const [timerNoticeLang, setTimerNoticeLang] = useState(0);
  // 이미 닫은 종료 안내의 endNoticeAt. 교사가 다시 종료(새 시각)하면 값이 달라져 안내가 다시 뜬다.
  const [dismissedEndNoticeAt, setDismissedEndNoticeAt] = useState<string | null>(null);
  const [uploadStudentName, setUploadStudentName] = useState('');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadAnonymous, setUploadAnonymous] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [uploadResult, setUploadResult] = useState<{ fileName: string; webViewLink: string } | null>(null);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contentDropdownRef = useRef<HTMLDivElement | null>(null);
  const contentDropdownButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  // 학생은 반을 직접 고르지 않으므로(전체 공개 정책 → activeClassroomId가 보통 null) 결과물 저장 대상 반을
  // '오늘 공개된 수업'에서 역으로 찾는다(아래 effectiveClassroom). 비동기 핸들러/업로드가 최신 값을 읽도록 ref에 보관.
  const effectiveClassroomIdRef = useRef<string | null>(null);

  const setUploadFileWithPreview = (file: File | null) => {
    setUploadFile(file);
    if (file && file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setUploadPreview(url);
    } else {
      setUploadPreview(null);
    }
  };

  const resetUploadModal = () => {
    setUploadState('idle');
    setUploadResult(null);
    setUploadFile(null);
    setUploadPreview(null);
    setUploadStudentName('');
    setUploadTitle('');
    setUploadAnonymous(false);
    setUploadError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const doUpload = async () => {
    const classroomId = effectiveClassroomIdRef.current;
    if (!uploadFile || !uploadStudentName.trim() || !classroomId) return;
    setUploadState('uploading');
    setUploadError('');
    try {
      const idToken = await getAuthToken?.();
      if (!idToken) {
        throw new Error('로그인이 필요합니다.');
      }

      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('classroomId', classroomId);
      formData.append('studentName', uploadStudentName.trim());
      if (uploadTitle.trim()) formData.append('title', uploadTitle.trim());
      formData.append('anonymous', uploadAnonymous ? 'true' : 'false');
      const res = await fetch(resolveAppPath('/api/drive/upload'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
        body: formData,
      });
      const data = await res.json() as { ok?: boolean; fileName?: string; webViewLink?: string; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || '업로드 실패');
      setUploadResult({ fileName: data.fileName!, webViewLink: data.webViewLink! });
      setUploadState('done');
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : '업로드에 실패했습니다.');
      setUploadState('error');
    }
  };

  // 실습(iframe) 결과물 자동 저장 브리지: 실습 HTML이 postMessage로 보낸 결과 파일(이미지 dataUrl 또는 html 문자열)을
  // 받아 기존 업로드 파이프라인(Drive 폴더 + studentPosts pending)으로 올린다. 답신은 보낸 iframe(event.source)에만 보낸다.
  useEffect(() => {
    const handleStudentWorkSave = async (event: MessageEvent) => {
      const data = event.data as
        | {
            type?: string;
            mimeType?: string;
            dataUrl?: string;
            html?: string;
            fileName?: string;
            title?: string;
            studentName?: string;
            anonymous?: boolean;
          }
        | null;
      if (!data || data.type !== 'student-work-save') return;
      const source = event.source as Window | null;
      const reply = (ok: boolean, extra: Record<string, unknown> = {}) => {
        try {
          source?.postMessage({ type: 'student-work-saved', ok, ...extra }, '*');
        } catch {
          /* iframe이 사라진 경우 등 무시 */
        }
      };
      try {
        const classroomId = effectiveClassroomIdRef.current;
        if (!classroomId) return reply(false, { error: '반 정보를 찾을 수 없어요.' });
        const studentName = (data.studentName || '').trim();
        if (!studentName) return reply(false, { error: '이름이 필요해요.' });
        const idToken = await getAuthToken?.();
        if (!idToken) return reply(false, { error: '로그인이 필요해요.' });

        const rawName = (data.fileName || 'student-work').toString().replace(/[\\/:*?"<>|]/g, '_');
        let file: File;
        if (data.mimeType === 'text/html' && typeof data.html === 'string') {
          const name = rawName.endsWith('.html') ? rawName : `${rawName}.html`;
          file = new File([data.html], name, { type: 'text/html' });
        } else if (typeof data.dataUrl === 'string') {
          const blob = await (await fetch(data.dataUrl)).blob();
          const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
          const name = /\.[a-z0-9]+$/i.test(rawName) ? rawName : `${rawName}.${ext}`;
          file = new File([blob], name, { type: blob.type || data.mimeType || 'image/png' });
        } else {
          return reply(false, { error: '저장할 내용이 없어요.' });
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('classroomId', classroomId);
        formData.append('studentName', studentName);
        if (data.title) formData.append('title', String(data.title));
        formData.append('anonymous', data.anonymous ? 'true' : 'false');

        const res = await fetch(resolveAppPath('/api/drive/upload'), {
          method: 'POST',
          headers: { Authorization: `Bearer ${idToken}` },
          body: formData,
        });
        const result = (await res.json()) as {
          ok?: boolean;
          fileName?: string;
          webViewLink?: string;
          error?: string;
        };
        if (!res.ok || !result.ok) throw new Error(result.error || '저장에 실패했어요.');
        reply(true, { fileName: result.fileName, webViewLink: result.webViewLink });
      } catch (err) {
        reply(false, { error: err instanceof Error ? err.message : '저장에 실패했어요.' });
      }
    };

    window.addEventListener('message', handleStudentWorkSave);
    return () => window.removeEventListener('message', handleStudentWorkSave);
    // 저장 대상 반은 effectiveClassroomIdRef(ref)로 항상 최신값을 읽으므로 deps에 넣지 않는다.
  }, [getAuthToken]);

  // 종료 안내가 열려 있는 동안 몇 초마다 언어를 바꾼다(읽을 수 있는 속도). 닫히면 멈추고 한국어로 초기화.
  useEffect(() => {
    if (!isEndNoticeOpen) return;
    setEndNoticeLang(0);
    const id = setInterval(() => {
      setEndNoticeLang((i) => (i + 1) % END_NOTICE_LANGS.length);
    }, 4500);
    return () => clearInterval(id);
  }, [isEndNoticeOpen]);

  const hasManagedHistoryEntryRef = useRef(false);

  // Set to true to restore the classroom selection home screen
  const SHOW_CLASSROOM_SELECTION = false;

  // 페이지 상단 UI 언어 선택기(한국어 ▾)를 숨긴다. 학생 혼동 방지 — 번역은 우하단 언어 버튼(StudentVoiceButton)
  // 하나로 한다(실습 병기 번역·교사 방송 자막을 함께 제어). 다시 보이려면 true로.
  const SHOW_PAGE_LANGUAGE_SELECTOR = false;

  const homeT = translations[lang];
  const detailT = translations.KO;
  const currentT = activeClassroomId ? detailT : homeT;
  const activeClassroom = classrooms.find((classroom) => classroom.id === activeClassroomId);
  const isContentViewActive = !SHOW_CLASSROOM_SELECTION || Boolean(activeClassroomId);

  const categorizedContents = contents.filter((content) => content.categoryId !== null);
  const categorizedContentIds = new Set(categorizedContents.map((content) => content.id));
  // 게이팅: 강사가 '오늘' 공개한 실습 블록만 학생에게 보인다. 공개 전까진 잠겨 있음(빈 상태).
  // 반 구분 없이 전체 공개 정책 → 오늘 날짜 publishedLessons의 공개 id를 합집합으로 본다.
  // 학생: 실제 오늘 공개분만. 강사 미리보기: previewDate 기준(테스트용 — 실제 학생 화면엔 영향 없음).
  const realTodayString = getLocalDateString(new Date());
  const gatingDateString = isAdmin ? previewDate : realTodayString;
  // 실습 타이머(공개 순간 시작된 카운트다운) — 오늘 publishedLessons의 practiceTimers를 합쳐 본다.
  const activePracticeTimers: Record<string, string> = {};
  publishedLessons
    .filter((lesson) => lesson.date === gatingDateString && lesson.practiceTimers)
    .forEach((lesson) => {
      Object.entries(lesson.practiceTimers as Record<string, string>).forEach(([contentId, endsAt]) => {
        activePracticeTimers[contentId] = endsAt;
      });
    });
  // 만료된 타이머의 실습은 교사가 잠그지 않아도 학생 화면에서 자동으로 잠긴다.
  const expiredTimerContentIds = new Set(
    Object.entries(activePracticeTimers)
      .filter(([, endsAt]) => new Date(endsAt).getTime() <= timerNow)
      .map(([contentId]) => contentId)
  );
  const publishedContentIdSet = new Set(
    publishedLessons
      .filter((lesson) => lesson.date === gatingDateString)
      .flatMap((lesson) => lesson.publishedContentIds)
      .filter((contentId) => !expiredTimerContentIds.has(contentId))
  );
  // 오늘 공개 중인 이론 슬라이드(한 번에 하나) — 여러 반이 공개했다면 가장 최근 것.
  // 이론만 켜지면 화면 전체, 실습·예제와 같이 켜지면 좌우(모바일은 위아래) 반반으로 나온다.
  const publishedTheory =
    publishedLessons
      .filter((lesson) => lesson.date === gatingDateString && lesson.publishedTheory?.url)
      .sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)))
      .map((lesson) => lesson.publishedTheory!)
      .pop() ?? null;
  // 실습칸 페이지 목록 — 공개 목록 순서 그대로 1,2,3…페이지(대시보드와 같은 번호라 교사가 "N페이지"로 부른다).
  // 타이머가 만료된 실습은 목록에서 빼지 않고 '잠김 페이지'로 남겨 뒤 페이지 번호가 밀리지 않게 한다.
  const orderedPublishedContentIds: string[] = [];
  publishedLessons
    .filter((lesson) => lesson.date === gatingDateString)
    .sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)))
    .flatMap((lesson) => lesson.publishedContentIds)
    .forEach((contentId) => {
      if (!orderedPublishedContentIds.includes(contentId)) {
        orderedPublishedContentIds.push(contentId);
      }
    });
  const practicePages = orderedPublishedContentIds.flatMap((contentId) => {
    const content = contents.find((candidate) => candidate.id === contentId);
    return content ? [{ content, locked: expiredTimerContentIds.has(contentId) }] : [];
  });
  const currentPageIndex = practicePages.findIndex((page) => page.content.id === currentPageId);
  const currentPage = currentPageIndex >= 0 ? practicePages[currentPageIndex] : null;

  // 교사 따라가기 — 교사가 새 페이지를 공개하면(예제 공개=실습 덮기 포함) 전원 그 페이지로 이동한다.
  // 학생이 다른 페이지를 둘러보는 중에도 새 공개가 오면 이동하고, 보던 페이지가 잠기면 최근 공개 페이지로 돌아온다.
  const unlockedPageIdsKey = practicePages
    .filter((page) => !page.locked)
    .map((page) => page.content.id)
    .join('|');
  useEffect(() => {
    const currentIds = unlockedPageIdsKey ? unlockedPageIdsKey.split('|') : [];
    const prev = prevPageIdsRef.current;
    prevPageIdsRef.current = currentIds;
    if (currentIds.length === 0) {
      setCurrentPageId(null);
      return;
    }
    if (prev === null) {
      // 첫 로드(늦게 접속 포함): 가장 마지막에 공개된 페이지 = 교사의 최근 액션.
      setCurrentPageId(currentIds[currentIds.length - 1]);
      return;
    }
    const added = currentIds.filter((contentId) => !prev.includes(contentId));
    if (added.length > 0) {
      setCurrentPageId(added[added.length - 1]);
      return;
    }
    setCurrentPageId((current) =>
      current && currentIds.includes(current) ? current : currentIds[currentIds.length - 1]
    );
  }, [unlockedPageIdsKey]);

  // 완료 기록 복원 — 새로고침해도 이미 끝낸 실습은 localStorage에서 되살린다.
  useEffect(() => {
    const currentIds = unlockedPageIdsKey ? unlockedPageIdsKey.split('|') : [];
    const stored = currentIds.filter((contentId) => {
      try {
        return window.localStorage.getItem(`${PRACTICE_DONE_STORAGE_PREFIX}${contentId}`) === '1';
      } catch {
        return false;
      }
    });
    if (stored.length === 0) return;
    setCompletedContentIds((prev) => {
      if (stored.every((contentId) => prev.has(contentId))) return prev;
      const next = new Set(prev);
      stored.forEach((contentId) => next.add(contentId));
      return next;
    });
  }, [unlockedPageIdsKey]);

  // 완료 신호 수신 — 실습 HTML이 완료 화면에서 {type:'dasa-practice-done'}을 postMessage로 보낸다.
  // 화면에 떠 있는 실습 iframe은 현재 페이지 하나뿐이라 currentPageId(ref)로 어느 실습인지 정한다.
  const currentPageIdRef = useRef<string | null>(null);
  useEffect(() => {
    currentPageIdRef.current = currentPageId;
  }, [currentPageId]);
  // 보고 있는 실습이 바뀌면 복습 단계 신호를 초기화 — 새 iframe에 이전 실습의 방향이 새어들지 않게.
  useEffect(() => {
    setReviewNav({ seq: 0, dir: 1 });
  }, [currentPageId]);
  useEffect(() => {
    const handlePracticeDone = (event: MessageEvent) => {
      const data = event.data as { type?: unknown } | null;
      if (!data || data.type !== 'dasa-practice-done') return;
      const contentId = currentPageIdRef.current;
      if (!contentId) return;
      try {
        window.localStorage.setItem(`${PRACTICE_DONE_STORAGE_PREFIX}${contentId}`, '1');
      } catch {
        /* 저장 실패해도 이번 세션 상태로는 동작 */
      }
      setCompletedContentIds((prev) => {
        if (prev.has(contentId)) return prev;
        const next = new Set(prev);
        next.add(contentId);
        return next;
      });
    };
    window.addEventListener('message', handlePracticeDone);
    return () => window.removeEventListener('message', handlePracticeDone);
  }, []);

  // ◀ ▶ '복습' 단계 이동 — 콘텐츠 사이 이동이 아니라, 지금 보고 있는 그 실습 하나를 단계별로 되짚어 본다.
  // 그 실습을 끝까지 끝낸 학생에게만 열린다(실습별 개별 개방). 예제(kind:reference)는 단계 개념이 없어 제외,
  // 잠긴(타이머 만료) 실습도 제외. 강사 미리보기(isAdmin)는 확인용으로 항상 보인다.
  // 콘텐츠 사이 이동은 두지 않는다 — 학생은 한 번에 실습 하나만 보고, 교사 공개(교사 따라가기)로만 바뀐다.
  const canReviewCurrent = Boolean(
    currentPage &&
      !currentPage.locked &&
      currentPage.content.kind !== 'reference' &&
      (Boolean(isAdmin) || completedContentIds.has(currentPage.content.id))
  );
  // 화면에 띄울 카운트다운 — 아직 안 끝난(공개 중) 타이머 중 가장 빨리 끝나는 것.
  const runningTimerEndsAt =
    Object.entries(activePracticeTimers)
      .filter(
        ([contentId, endsAt]) =>
          publishedContentIdSet.has(contentId) && new Date(endsAt).getTime() > timerNow
      )
      .map(([, endsAt]) => endsAt)
      .sort()[0] ?? null;
  // 방금(2분 안) 만료된 타이머 → 전환 카드. 늦게 접속한 학생에겐 이미 지난 신호라 뜨지 않는다.
  const recentTimerExpiryAt =
    Object.values(activePracticeTimers)
      .filter((endsAt) => {
        const endMs = new Date(endsAt).getTime();
        return endMs <= timerNow && timerNow - endMs < TIMER_NOTICE_MAX_AGE_MS;
      })
      .sort()
      .pop() ?? null;
  const isTimerNoticeOpen = Boolean(recentTimerExpiryAt);
  // 교사가 대시보드에서 '수업 종료'를 누르면 publishedLessons에 endNoticeAt가 찍힌다 → 모든 학생 화면에 종료 안내를 띄운다.
  const activeEndNoticeAt =
    publishedLessons
      .filter((lesson) => lesson.date === gatingDateString && lesson.endNoticeAt)
      .map((lesson) => lesson.endNoticeAt as string)
      .sort()
      .pop() || null;
  // 종료 안내 신호가 오면 자동으로 띄우고, 학생이 이미 닫은 신호(같은 시각)면 닫아 둔다.
  // 단, 종료 시각부터 10분이 지나면 띄우지 않는다 — 늦게 페이지를 연 학생에겐 안 뜨고, 떠 있던 안내도 시간이 되면 자동으로 닫힌다.
  useEffect(() => {
    if (!activeEndNoticeAt || activeEndNoticeAt === dismissedEndNoticeAt) {
      setIsEndNoticeOpen(false);
      return;
    }
    const remainingMs =
      END_NOTICE_MAX_AGE_MS - (Date.now() - new Date(activeEndNoticeAt).getTime());
    if (remainingMs <= 0) {
      setIsEndNoticeOpen(false);
      return;
    }
    setIsEndNoticeOpen(true);
    const timer = window.setTimeout(() => setIsEndNoticeOpen(false), remainingMs);
    return () => window.clearTimeout(timer);
  }, [activeEndNoticeAt, dismissedEndNoticeAt]);

  // 실습 타이머 1초 시계 — 타이머가 돌고 있거나 방금 만료(전환 카드 표시 중)인 동안만 돈다.
  // 멈추면 timerNow가 고정되지만, 만료 판정(endMs <= timerNow)은 이미 참이라 잠금 상태는 유지된다.
  const needsTimerTick = runningTimerEndsAt !== null || recentTimerExpiryAt !== null;
  useEffect(() => {
    if (!needsTimerTick) return;
    const id = setInterval(() => setTimerNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [needsTimerTick]);

  // 전환 카드 언어 — 학생이 언어 버튼으로 고른 언어가 카드에 있으면 그 언어로 바로 고정해 띄운다
  // (실습 병기 번역·교사 자막과 같은 감각). 미선택·자막 끄기('off') 등 카드에 없는 언어면
  // 종전대로 몇 초마다 순환한다(종료 안내와 같은 패턴). 카드가 떠 있는 중에 언어를 바꿔도 즉시 따라간다.
  useEffect(() => {
    if (!isTimerNoticeOpen) return;
    let intervalId: number | null = null;
    const applyLang = () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
      const iso = readStudentVoiceIso();
      const pinnedIndex = iso ? TIMER_NOTICE_LANGS.findIndex((l) => l.code === iso) : -1;
      if (pinnedIndex >= 0) {
        setTimerNoticeLang(pinnedIndex);
        return;
      }
      setTimerNoticeLang(0);
      intervalId = window.setInterval(() => {
        setTimerNoticeLang((i) => (i + 1) % TIMER_NOTICE_LANGS.length);
      }, 3500);
    };
    applyLang();
    window.addEventListener(VOICE_LANG_CHANGED_EVENT, applyLang);
    return () => {
      if (intervalId !== null) window.clearInterval(intervalId);
      window.removeEventListener(VOICE_LANG_CHANGED_EVENT, applyLang);
    };
  }, [isTimerNoticeOpen]);

  const getAssignedContentIdsForClassroom = (_classroom?: Classroom) =>
    Array.from(categorizedContentIds);
  const visibleContents = categorizedContents.filter((content) =>
    publishedContentIdSet.has(content.id)
  );
  const visibleContentIds = new Set(visibleContents.map((content) => content.id));
  const visibleAssignedContentIds = visibleContentIds;
  // 카테고리 드롭다운 UI는 공개 페이지가 둘 이상일 때만 쓴다(페이저와 함께 빠른 점프용).
  const hasMultipleVisible = visibleContents.length >= 2;

  // 'dsr-fit-viewport' 마커가 든 실습(코딩반 타이핑 미션 등)과 예제(한 화면 설계)는 위아래 페이지 스크롤 없이
  // 남은 화면 높이에 iframe을 딱 맞춰 꽉 채운다. 마커 없는 기존 콘텐츠는 종전대로 자연 높이 + 스크롤.
  const fitCandidateContent = currentPage && !currentPage.locked ? currentPage.content : null;
  const isFitViewport = Boolean(
    (!SHOW_CLASSROOM_SELECTION || activeClassroomId) &&
      (fitCandidateContent?.html?.includes('dsr-fit-viewport') ||
        fitCandidateContent?.kind === 'reference')
  );
  // 이론이 공개 중이면(단독·분할 모두) 화면을 뷰포트에 꽉 채우는 셸로 전환한다.
  const isSplitView = Boolean(publishedTheory) && practicePages.length > 0;
  const isFillLayout = Boolean(publishedTheory) || isFitViewport;

  // 결과물 저장 대상 반 결정 — 학생은 반을 직접 고르지 않으므로(전체 공개 정책) '오늘 공개된 수업'에서 역으로 찾는다.
  // 우선순위: (1) 강사가 직접 고른 반(미리보기), (2) 지금 보고 있는 실습을 공개한 반,
  //          (3) 가장 최근에 공개한 반. Drive 폴더가 연결된 반을 우선하되, 후보가 있으면 폴더 없는 반이라도 잡아
  //          서버가 "Drive 폴더 미연결"이라는 구체적 에러를 돌려주도록 한다.
  const viewedContentId = currentPage?.content.id ?? null;
  const todaysPublishedLessons = [...publishedLessons]
    .filter(
      (lesson) =>
        lesson.date === gatingDateString &&
        (lesson.publishedContentIds.length > 0 || lesson.publishedTheory)
    )
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  // 저장 폴더는 모든 반이 공유 폴더로 동일하지만, 게시물(결과물 갤러리)의 반 구분은 중요하다.
  // 그래서 한 묶음(tier)에서 가장 최근 공개한 반을 고르되, '지금 보고 있는 실습을 공개한 반'을 항상 우선해
  // 결과물이 엉뚱한 반 갤러리로 들어가지 않게 한다(크로스 라우팅 방지).
  const pickClassroomFromLessons = (lessons: PublishedLesson[]): Classroom | undefined => {
    for (const lesson of lessons) {
      const found = classrooms.find((classroom) => classroom.id === lesson.classroomId);
      if (found) return found;
    }
    return undefined;
  };
  const contentMatchedLessons = todaysPublishedLessons.filter(
    (lesson) => viewedContentId && lesson.publishedContentIds.includes(viewedContentId)
  );
  const effectiveClassroom =
    activeClassroom ??
    pickClassroomFromLessons(contentMatchedLessons) ??
    pickClassroomFromLessons(todaysPublishedLessons) ??
    null;
  effectiveClassroomIdRef.current = effectiveClassroom?.id ?? null;

  const contentsByCategory = categories
    .map((category) => ({
      category,
      items: visibleContents.filter((content) => content.categoryId === category.id),
    }))
    .filter((group) => group.items.length > 0);

  // (강사가 실시간으로 잠그면 위 '교사 따라가기' 효과가 보던 페이지를 최근 공개 페이지로 되돌린다.)

  const closeContentDropdown = () => {
    setOpenDropdown(null);
    setContentDropdownPosition(null);
  };

  const toggleContentDropdown = (categoryId: string, button: HTMLButtonElement) => {
    if (openDropdown === categoryId) {
      closeContentDropdown();
      return;
    }

    setOpenDropdown(categoryId);
    setContentDropdownPosition(calculateContentDropdownPosition(button));
  };

  const applyHomeViewState = () => {
    setActiveClassroomId(null);
    closeContentDropdown();
    setIsLangOpen(false);
  };

  const applyClassroomViewState = (classroomId: string) => {
    setActiveClassroomId(classroomId);
    closeContentDropdown();
    setIsLangOpen(false);
  };

  const handleOpenClassroom = (classroomId: string) => {
    if (typeof window !== 'undefined') {
      window.history.pushState(
        getMergedStudentHistoryState(STUDENT_CLASSROOM_HISTORY_VIEW, classroomId),
        ''
      );
      hasManagedHistoryEntryRef.current = true;
    }

    applyClassroomViewState(classroomId);
  };

  const handleGoHome = () => {
    if (typeof window !== 'undefined') {
      const historyState = getStudentHistoryState(window.history.state);
      if (
        historyState.studentPageView === STUDENT_CLASSROOM_HISTORY_VIEW &&
        hasManagedHistoryEntryRef.current
      ) {
        window.history.back();
        return;
      }

      window.history.replaceState(getMergedStudentHistoryState(STUDENT_HOME_HISTORY_VIEW), '');
    }

    applyHomeViewState();
  };

  const getClassroomDisplayName = (classroom: Classroom) => classroom.name;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const historyState = getStudentHistoryState(window.history.state);
    if (
      historyState.studentPageView === STUDENT_CLASSROOM_HISTORY_VIEW &&
      historyState.studentClassroomId
    ) {
      hasManagedHistoryEntryRef.current = true;
      applyClassroomViewState(historyState.studentClassroomId);
    } else {
      window.history.replaceState(getMergedStudentHistoryState(STUDENT_HOME_HISTORY_VIEW), '');
      hasManagedHistoryEntryRef.current = true;
    }

    const handlePopState = (event: PopStateEvent) => {
      hasManagedHistoryEntryRef.current = true;
      const nextState = getStudentHistoryState(event.state);
      if (
        nextState.studentPageView === STUDENT_CLASSROOM_HISTORY_VIEW &&
        nextState.studentClassroomId
      ) {
        applyClassroomViewState(nextState.studentClassroomId);
        return;
      }

      applyHomeViewState();
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (!openDropdown) {
      setContentDropdownPosition(null);
    }
  }, [openDropdown]);

  useEffect(() => {
    if (!openDropdown) return;

    const closeOnViewportChange = () => closeContentDropdown();
    const handleViewportScroll = (event: Event) => {
      const target = event.target as Node;
      if (contentDropdownRef.current?.contains(target)) {
        return;
      }

      closeContentDropdown();
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      const menuElement = contentDropdownRef.current;
      const buttonElement = contentDropdownButtonRefs.current[openDropdown];

      if (menuElement?.contains(target) || buttonElement?.contains(target)) {
        return;
      }

      closeContentDropdown();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeContentDropdown();
      }
    };

    window.addEventListener('resize', closeOnViewportChange);
    window.addEventListener('scroll', handleViewportScroll, true);
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('resize', closeOnViewportChange);
      window.removeEventListener('scroll', handleViewportScroll, true);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [openDropdown]);

  return (
    <div
      className={`bg-[#FBFBFA] font-sans text-[#4A3728] ${
        embeddedInAdminShell
          ? `flex min-h-0 flex-1 flex-col ${isFillLayout ? 'overflow-hidden' : 'overflow-y-auto'}`
          : isFillLayout
            ? 'flex h-screen flex-col overflow-hidden'
            : 'min-h-screen'
      }`}
    >
      <header className="sticky top-0 z-50 border-b border-[#E5E3DD] bg-white/95 backdrop-blur">
        <div
          className={`px-4 py-5 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 ${
            activeClassroomId && contentsByCategory.length > 0 ? 'space-y-5' : ''
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {SHOW_CLASSROOM_SELECTION && activeClassroomId && (
                <button
                  onClick={handleGoHome}
                  className="rounded-xl p-2 text-[#8B7E74] transition-all hover:bg-[#F3F2EE] hover:text-[#4A3728]"
                >
                  <ArrowLeft size={20} />
                </button>
              )}
              <div className="flex min-w-0 flex-col">
                <h1 className="truncate font-serif text-xl font-bold text-[#141414] sm:text-2xl">
                  {SHOW_CLASSROOM_SELECTION && activeClassroom ? activeClassroom.name : currentT.title}
                </h1>
                <p className="truncate text-xs font-medium text-[#8B7E74]">
                  {SHOW_CLASSROOM_SELECTION && activeClassroom
                    ? `${visibleAssignedContentIds.size}개의 학습 콘텐츠`
                    : currentT.subtitle}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
              {SHOW_PAGE_LANGUAGE_SELECTOR && !activeClassroomId && (
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

              {effectiveClassroom && (
                <button
                  onClick={() => { resetUploadModal(); setIsUploadModalOpen(true); }}
                  className="flex items-center gap-2 rounded-xl bg-[#FFF5E9] px-3 py-2 text-sm font-bold text-[#8B5E3C] transition-all hover:bg-[#FFE8CC]"
                  title="활동 결과 업로드"
                >
                  <Upload size={18} />
                  <span className="hidden sm:inline">업로드</span>
                </button>
              )}

              {isAdmin && (
                <label
                  className="flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-[#FFF5E9] px-3 py-2 text-sm font-bold text-[#8B5E3C]"
                  title="강사 미리보기 날짜 — 이 날짜에 공개된 실습을 미리 봅니다. 실제 학생 화면에는 영향이 없습니다."
                >
                  🔧 <span className="hidden sm:inline">미리보기</span>
                  <input
                    type="date"
                    value={previewDate}
                    onChange={(event) => setPreviewDate(event.target.value)}
                    className="w-[7.5rem] bg-transparent text-sm font-bold text-[#8B5E3C] outline-none sm:w-auto"
                  />
                </label>
              )}

              {isAdmin && onBackToAdmin && (
                <button
                  onClick={onBackToAdmin}
                  className="whitespace-nowrap rounded-xl bg-[#8B5E3C] px-3 py-2 text-sm font-bold text-white transition-all hover:bg-[#724D31] sm:px-4"
                >
                  <span className="sm:hidden">관리자</span>
                  <span className="hidden sm:inline">{currentT.backToAdmin}</span>
                </button>
              )}
            </div>
          </div>

          {/* 카테고리 빠른점프 드롭다운 제거(2026-07-20) — 학생은 한 번에 실습 하나만 보고 콘텐츠 사이 이동을 두지 않는다. */}
        </div>
      </header>

      {SHOW_CLASSROOM_SELECTION && !activeClassroomId ? (
        <main className="mx-auto max-w-5xl p-4 sm:p-8">
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 rounded-[40px] bg-[#FFF5E9] p-6 text-center sm:mb-12 sm:p-12"
          >
            <h2 className="mb-4 font-serif text-2xl font-bold text-[#4A3728] sm:text-4xl">{homeT.welcome}</h2>
            <p className="mx-auto mb-8 max-w-2xl text-base text-[#8B7E74] sm:text-lg">{homeT.welcomeDesc}</p>

            <div className="mb-6">
              <span className="rounded-full bg-[#EBD9C1]/30 px-3 py-1 text-xs font-bold uppercase tracking-widest text-[#8B5E3C]">
                {homeT.selectClass}
              </span>
            </div>
          </motion.section>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {classrooms.map((classroom, index) => {
              const classroomContentIds = new Set(
                getAssignedContentIdsForClassroom(classroom).filter((id) =>
                  categorizedContentIds.has(id)
                )
              );

              const { color, backgroundColor } = getClassroomCardColors(classroom.color);
              const ClassroomIcon = getClassroomIconComponent(classroom.icon);

              return (
                <motion.button
                  key={classroom.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  onClick={() => handleOpenClassroom(classroom.id)}
                  className="group rounded-[32px] border border-[#E5E3DD] bg-white p-8 text-left shadow-sm transition-all hover:shadow-lg"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-2xl transition-all"
                      style={{ backgroundColor, color }}
                    >
                      <ClassroomIcon size={24} />
                    </div>
                    <ArrowRight
                      size={20}
                      className="text-[#E5E3DD] transition-all group-hover:translate-x-1"
                    />
                  </div>
                  <h3 className="mb-1 text-xl font-bold" style={{ color }}>
                    {getClassroomDisplayName(classroom)}
                  </h3>
                  <p className="text-sm text-[#A89F94]">
                    {isAdmin
                      ? `${classroomContentIds.size}개 콘텐츠 · ${classroom.students?.length || 0}명 학생`
                      : `${classroomContentIds.size}개 콘텐츠`}
                  </p>
                </motion.button>
              );
            })}
          </div>
        </main>
      ) : (
        <main
          className={
            isFillLayout
              ? 'flex min-h-0 w-full flex-1 flex-col px-3 pb-3 pt-3 sm:px-4'
              : 'w-full px-4 pb-8 pt-6 sm:px-6 lg:px-8 xl:px-10 2xl:px-12'
          }
        >
          {publishedTheory || practicePages.length > 0 ? (
            // 교사가 켠 것에 따라 화면 구성이 바뀐다: 이론만=전체, 이론+실습(예제)=반반, 실습/예제만=전체.
            <div
              className={`flex min-h-0 flex-1 gap-3 ${
                isSplitView ? 'flex-col lg:flex-row' : 'flex-col'
              }`}
            >
              {/* 이론 패널 — 공개된 이론 슬라이드 임베드. 슬라이드 자체 ◀ ▶로 앞뒤 장을 넘겨볼 수 있다. */}
              {publishedTheory && (
                <div
                  className={`min-h-0 flex-1 overflow-hidden rounded-[24px] border border-[#E5E3DD] bg-white shadow-sm ${
                    isSplitView ? 'lg:basis-1/2' : ''
                  }`}
                >
                  <iframe
                    src={publishedTheory.url}
                    title={publishedTheory.label || '이론 슬라이드'}
                    className="h-full w-full border-0"
                    allowFullScreen
                  />
                </div>
              )}

              {/* 실습/예제 칸 — 공개 목록 순서 = 페이지 번호. 예제가 공개되면 이 칸의 기본 페이지가 예제가 된다. */}
              {practicePages.length > 0 && (
                <div
                  className={`flex min-h-0 flex-1 flex-col gap-2 ${isSplitView ? 'lg:basis-1/2' : ''}`}
                >
                  {/* 복습 ◀ ▶ — 그 실습을 끝낸 학생만, 같은 실습을 단계별로 앞뒤로 되짚어 본다(콘텐츠 간 이동 아님). */}
                  {canReviewCurrent && (
                    <div className="flex flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-[#E5E3DD] bg-white px-3 py-2 shadow-sm">
                      <span className="mr-1 text-xs font-bold text-[#8B7E74]">🔁 복습</span>
                      <button
                        type="button"
                        onClick={() => setReviewNav((s) => ({ seq: s.seq + 1, dir: -1 }))}
                        aria-label="이전 단계"
                        title="이전 단계"
                        className="flex h-8 items-center gap-1 rounded-xl px-3 text-sm font-bold text-[#8B7E74] transition-all hover:bg-[#F3F2EE] hover:text-[#4A3728]"
                      >
                        <ChevronLeft size={18} />
                        이전 단계
                      </button>
                      <button
                        type="button"
                        onClick={() => setReviewNav((s) => ({ seq: s.seq + 1, dir: 1 }))}
                        aria-label="다음 단계"
                        title="다음 단계"
                        className="flex h-8 items-center gap-1 rounded-xl px-3 text-sm font-bold text-[#8B7E74] transition-all hover:bg-[#F3F2EE] hover:text-[#4A3728]"
                      >
                        다음 단계
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  )}

                  {currentPage && !currentPage.locked ? (
                    <motion.div
                      key={currentPage.content.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={isFillLayout ? 'min-h-0 flex-1' : undefined}
                    >
                      {isFillLayout ? (
                        <StudentContentPreviewFrame
                          html={currentPage.content.html ?? ''}
                          title={currentPage.content.title}
                          autoHeight={false}
                          reviewMode={Boolean(isAdmin)}
                          reviewNav={reviewNav}
                          className="h-full w-full overflow-hidden rounded-[24px] border border-[#E5E3DD] bg-white shadow-sm"
                        />
                      ) : (
                        <StudentContentCard
                          content={currentPage.content}
                          showDescriptionToggle={false}
                          reviewNav={reviewNav}
                        />
                      )}
                    </motion.div>
                  ) : (
                    <div className="flex min-h-[12rem] flex-1 flex-col items-center justify-center rounded-[24px] border border-[#E5E3DD] bg-white p-8 text-center">
                      <Lock size={28} className="mb-3 text-[#A89F94]" />
                      <p className="text-sm font-bold text-[#8B7E74]">
                        실습 시간이 끝났어요 — 선생님 화면을 보세요 👀
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-12 w-full max-w-none rounded-[40px] border border-[#E5E3DD] bg-white p-12 text-center shadow-sm"
            >
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#F3F2EE]">
                <Lock size={28} className="text-[#A89F94]" />
              </div>
              <p className="mx-auto max-w-md text-lg font-bold text-[#8B7E74]">
                {detailT.noVisibleContents}
              </p>
            </motion.section>
          )}

        </main>
      )}

      {isUploadModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={(e) => { if (e.target === e.currentTarget) { setIsUploadModalOpen(false); resetUploadModal(); } }}
          onPaste={(e) => {
            const item = Array.from(e.clipboardData.items).find((i) => (i as DataTransferItem).type.startsWith('image/')) as DataTransferItem | undefined;
            if (item) {
              const file = item.getAsFile();
              if (file) setUploadFileWithPreview(file);
            }
          }}
        >
          {/* mb-20: 모바일 바텀시트가 FAB(z-[10010], 우하단 64px — 모달보다 위에 뜬다)와 겹쳐
              업로드 버튼 탭을 뺏기지 않게 FAB 높이만큼 띄운다. 데스크톱(sm, 중앙 정렬)은 안 겹침. */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="mb-20 w-full max-w-md rounded-[32px] bg-white p-7 shadow-2xl sm:mb-0"
          >
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF5E9]">
                  <Upload size={20} className="text-[#8B5E3C]" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#4A3728]">활동 결과 업로드</h3>
                  <p className="text-xs text-[#A89F94]">Drive에 직접 전달됩니다</p>
                </div>
              </div>
              <button
                onClick={() => { setIsUploadModalOpen(false); resetUploadModal(); }}
                className="rounded-xl p-2 text-[#A89F94] hover:bg-[#F3F2EE]"
              >
                <X size={18} />
              </button>
            </div>

            {uploadState === 'done' && uploadResult ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 rounded-2xl bg-green-50 p-4">
                  <CheckCircle2 size={22} className="shrink-0 text-green-500" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-green-700">업로드 완료!</p>
                    <p className="truncate text-xs text-green-600">{uploadResult.fileName}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <a
                    href={uploadResult.webViewLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 rounded-2xl border-2 border-[#8B5E3C] py-3 text-center text-sm font-bold text-[#8B5E3C] transition-all hover:bg-[#FFF5E9]"
                  >
                    Drive에서 보기
                  </a>
                  <button
                    onClick={() => { resetUploadModal(); }}
                    className="flex-1 rounded-2xl bg-[#F3F2EE] py-3 text-sm font-bold text-[#4A3728] transition-all hover:bg-[#EAE8E2]"
                  >
                    다시 업로드
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="이름을 입력하세요"
                  value={uploadStudentName}
                  onChange={(e) => setUploadStudentName(e.target.value)}
                  className="w-full rounded-2xl border-2 border-[#E5E3DD] px-4 py-3 text-sm text-[#4A3728] outline-none focus:border-[#8B5E3C]"
                />
                <input
                  type="text"
                  placeholder="작품 제목 (선택)"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  className="w-full rounded-2xl border-2 border-[#E5E3DD] px-4 py-3 text-sm text-[#4A3728] outline-none focus:border-[#8B5E3C]"
                />
                <label className="flex cursor-pointer items-center gap-2 px-1 text-xs text-[#A89F94]">
                  <input
                    type="checkbox"
                    checked={uploadAnonymous}
                    onChange={(e) => setUploadAnonymous(e.target.checked)}
                    className="h-4 w-4 accent-[#8B5E3C]"
                  />
                  홈페이지에 공개될 때 이름 대신 '익명'으로 표시
                </label>

                {uploadPreview ? (
                  <div className="relative">
                    <img src={uploadPreview} alt="미리보기" className="max-h-48 w-full rounded-2xl object-cover" />
                    <button
                      onClick={() => { setUploadFile(null); setUploadPreview(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                      className="absolute right-2 top-2 rounded-full bg-black/50 p-1 text-white hover:bg-black/70"
                    >
                      <X size={14} />
                    </button>
                    <p className="mt-1 truncate text-center text-xs text-[#A89F94]">{uploadFile?.name}</p>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-[#E5E3DD] px-4 py-8 transition-colors hover:border-[#8B5E3C]"
                  >
                    <Upload size={24} className="text-[#C8BFB8]" />
                    <p className="text-sm font-bold text-[#A89F94]">
                      {uploadFile ? uploadFile.name : '클릭하거나 Ctrl+V로 붙여넣기'}
                    </p>
                    <p className="text-xs text-[#C8BFB8]">사진, HTML, PDF · 최대 20MB</p>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.html,application/pdf"
                  className="hidden"
                  onChange={(e) => setUploadFileWithPreview(e.target.files?.[0] ?? null)}
                />

                {uploadState === 'error' && (
                  <p className="rounded-xl bg-red-50 px-4 py-2 text-xs text-red-500">{uploadError}</p>
                )}

                <button
                  disabled={!uploadStudentName.trim() || !uploadFile || uploadState === 'uploading'}
                  onClick={doUpload}
                  className="w-full rounded-2xl bg-[#8B5E3C] py-3.5 text-sm font-bold text-white transition-all hover:bg-[#724D31] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {uploadState === 'uploading' ? '업로드 중...' : '업로드'}
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}

      {!isFillLayout && (
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
      )}

      {/* 학생 음성 → 한국어 채팅 FAB. 실제 학생 화면에서만(강사 미리보기 제외) 띄운다.
          강사 미리보기에서 눌러 봐도 메시지가 강사 채팅에 섞이지 않도록 isAdmin일 땐 감춘다. */}
      {!isAdmin && (
        <StudentVoiceButton
          classroomId={effectiveClassroom?.id}
          classroomName={effectiveClassroom?.name}
          date={gatingDateString}
          endNoticeAt={activeEndNoticeAt}
        />
      )}

      {/* 선생님과 텍스트 채팅 FAB — 언어 FAB 왼쪽 옆. 교사가 보낸 링크를 열거나 제출 링크를 보낸다.
          음성 버튼과 같은 이유로 강사 미리보기에서는 감춘다. */}
      {!isAdmin && (
        <StudentChatPanel
          classroomId={effectiveClassroom?.id}
          classroomName={effectiveClassroom?.name}
          date={gatingDateString}
        />
      )}

      {/* 교사 통역 자막 방송 수신 — 실제 학생 화면에서만(강사 미리보기 제외).
          반·수업 공개 여부와 무관하게 오늘의 최신 방송을 내 언어 자막으로 상단 중앙에 띄운다. */}
      {!isAdmin && <StudentSubtitleOverlay date={gatingDateString} />}

      {/* 실습 타이머 카운트다운 — 실습이 닫히기까지 남은 시간. 닫히는 시각이 미리 보여서 학생이 스스로
          페이스를 조절한다. 실습 팝업(z-[9999/10000]) 위, 교사 자막(z-[10005])·언어 버튼(z-[10010]) 아래. */}
      {runningTimerEndsAt &&
        (() => {
          const totalSec = Math.max(
            0,
            Math.ceil((new Date(runningTimerEndsAt).getTime() - timerNow) / 1000)
          );
          return (
            <div className="pointer-events-none fixed left-1/2 top-16 z-[10001] -translate-x-1/2">
              <div
                className={`rounded-full px-5 py-2 text-xl font-bold text-white shadow-lg backdrop-blur-sm tabular-nums ${
                  totalSec <= 60 ? 'bg-[#B42318]/90' : 'bg-[#141414]/80'
                }`}
              >
                ⏰ {Math.floor(totalSec / 60)}:{String(totalSec % 60).padStart(2, '0')}
              </div>
            </div>
          );
        })()}

      {/* 실습 타이머 만료 전환 카드 — 실습이 잠기는 순간 전원(못 끝낸 학생 포함)에게 같은 신호.
          약 2분 뒤 자동으로 사라지고, 늦게 접속한 학생에겐 뜨지 않는다(신선도 창).
          실습 팝업(z-[9999/10000])보다 위, 교사 자막(z-[10005])·언어 버튼(z-[10010])보다 아래. */}
      {isTimerNoticeOpen && (
        <div className="fixed inset-0 z-[10002] flex select-none flex-col items-center justify-center gap-5 bg-[#141414]/85 p-6 backdrop-blur-sm">
          <div className="animate-bounce text-7xl">🖥️</div>
          <h2
            className="text-center font-serif text-4xl font-bold text-white sm:text-5xl"
            dir={TIMER_NOTICE_LANGS[timerNoticeLang].dir || 'ltr'}
          >
            {TIMER_NOTICE_LANGS[timerNoticeLang].title}
          </h2>
          <p
            className="text-center text-2xl font-medium text-white/90"
            dir={TIMER_NOTICE_LANGS[timerNoticeLang].dir || 'ltr'}
          >
            {TIMER_NOTICE_LANGS[timerNoticeLang].line}
          </p>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-2" dir="ltr">
            {TIMER_NOTICE_LANGS.map((langItem, idx) => (
              <span
                key={langItem.code}
                className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                  idx === timerNoticeLang ? 'bg-white text-[#141414]' : 'bg-white/15 text-white/60'
                }`}
              >
                {langItem.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 수업 종료 안내 — 교사가 대시보드에서 '수업 종료'를 누르면 실시간 신호로 모든 학생 화면에 뜬다. 학생은 띄우거나 닫을 수만 있다. */}
      {isEndNoticeOpen && (
        <div
          className="fixed inset-0 z-[110] flex cursor-pointer items-center justify-center bg-black/50 p-4"
          onClick={() => {
            setDismissedEndNoticeAt(activeEndNoticeAt);
            setIsEndNoticeOpen(false);
          }}
          title="화면을 누르면 닫혀요"
        >
          <div className="w-full max-w-lg rounded-[28px] bg-white p-8 text-center shadow-2xl sm:p-12">
            <div className="text-6xl">🎉</div>
            <h2
              className="mt-4 font-serif text-3xl font-bold text-[#141414]"
              dir={END_NOTICE_LANGS[endNoticeLang].dir || 'ltr'}
            >
              {END_NOTICE_LANGS[endNoticeLang].title}
            </h2>
            <div
              className="mt-6 min-h-[180px] space-y-3 text-xl font-medium leading-relaxed text-[#4A3728]"
              dir={END_NOTICE_LANGS[endNoticeLang].dir || 'ltr'}
            >
              {END_NOTICE_LANGS[endNoticeLang].lines.map((line, idx) => (
                <p key={idx} className={idx === END_NOTICE_LANGS[endNoticeLang].lines.length - 1 ? 'text-lg text-[#8B7E74]' : ''}>
                  {line}
                </p>
              ))}
            </div>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-2" dir="ltr">
              {END_NOTICE_LANGS.map((lang, idx) => (
                <span
                  key={lang.code}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                    idx === endNoticeLang ? 'bg-[#8B5E3C] text-white' : 'bg-[#F3F2EE] text-[#A89F94]'
                  }`}
                >
                  {lang.label}
                </span>
              ))}
            </div>
            <p className="mt-4 text-xs text-[#A89F94]">화면을 누르면 닫혀요 · Tap anywhere to close</p>
          </div>
        </div>
      )}
    </div>
  );
};
