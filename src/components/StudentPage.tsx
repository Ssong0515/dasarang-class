import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Languages,
  ChevronDown,
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
import { StudentContentCard } from './StudentContentPreview';
import { StudentVoiceButton } from './StudentVoiceButton';
import { StudentSubtitleOverlay } from './StudentSubtitleOverlay';
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
  const [selectedContent, setSelectedContent] = useState<LessonContent | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [contentDropdownPosition, setContentDropdownPosition] = useState<ContentDropdownPosition | null>(null);
  // 강사 미리보기 전용: 이 날짜 기준으로 '공개된 실습'을 본다. 실제 학생(isAdmin=false)은 항상 실제 오늘만 본다.
  const [previewDate, setPreviewDate] = useState(getLocalDateString(new Date()));

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isEndNoticeOpen, setIsEndNoticeOpen] = useState(false);
  const [endNoticeLang, setEndNoticeLang] = useState(0);
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

  // 페이지 상단 UI 언어 선택기(한국어 ▾)를 숨긴다. 학생 혼동 방지 — 번역은 실습 안 🌐 번역 버튼으로 한다.
  // 다시 보이려면 true로.
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
  const publishedContentIdSet = new Set(
    publishedLessons
      .filter((lesson) => lesson.date === gatingDateString)
      .flatMap((lesson) => lesson.publishedContentIds)
  );
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

  const getAssignedContentIdsForClassroom = (_classroom?: Classroom) =>
    Array.from(categorizedContentIds);
  const visibleContents = categorizedContents.filter((content) =>
    publishedContentIdSet.has(content.id)
  );
  const visibleContentIds = new Set(visibleContents.map((content) => content.id));
  const visibleAssignedContentIds = visibleContentIds;
  // 공개된 실습이 하나뿐이면 카테고리 선택 없이 바로 보여주고, 둘 이상일 때만 카테고리 UI를 쓴다.
  const hasMultipleVisible = visibleContents.length >= 2;
  const singleVisibleContent = visibleContents.length === 1 ? visibleContents[0] : null;

  // 결과물 저장 대상 반 결정 — 학생은 반을 직접 고르지 않으므로(전체 공개 정책) '오늘 공개된 수업'에서 역으로 찾는다.
  // 우선순위: (1) 강사가 직접 고른 반(미리보기), (2) 지금 보고 있는 실습을 공개한 반,
  //          (3) 가장 최근에 공개한 반. Drive 폴더가 연결된 반을 우선하되, 후보가 있으면 폴더 없는 반이라도 잡아
  //          서버가 "Drive 폴더 미연결"이라는 구체적 에러를 돌려주도록 한다.
  const viewedContentId = singleVisibleContent?.id ?? selectedContent?.id ?? null;
  const todaysPublishedLessons = [...publishedLessons]
    .filter((lesson) => lesson.date === gatingDateString && lesson.publishedContentIds.length > 0)
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

  // 강사가 실시간으로 잠그면, 열어 두던 실습을 즉시 닫는다.
  useEffect(() => {
    if (selectedContent && !visibleContentIds.has(selectedContent.id)) {
      setSelectedContent(null);
    }
    // visibleContentIds는 publishedLessons에서 파생 → publishedLessons 변화가 트리거
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedContent?.id, publishedLessons]);

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
    setSelectedContent(null);
    closeContentDropdown();
    setIsLangOpen(false);
  };

  const applyClassroomViewState = (classroomId: string) => {
    setActiveClassroomId(classroomId);
    setSelectedContent(null);
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
    if (selectedContent && !visibleContentIds.has(selectedContent.id)) {
      setSelectedContent(null);
      closeContentDropdown();
    }
  }, [selectedContent, visibleContentIds]);

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
        embeddedInAdminShell ? 'flex min-h-0 flex-1 flex-col overflow-y-auto' : 'min-h-screen'
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

          {isContentViewActive && hasMultipleVisible && contentsByCategory.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t border-[#F0ECE6] pt-1">
              {contentsByCategory.map((group) => {
                const isDropdownOpen = openDropdown === group.category.id;
                const hasSelectedContent = Boolean(
                  selectedContent && group.items.some((item) => item.id === selectedContent.id)
                );
                const menuId = `student-content-menu-${group.category.id}`;

                return (
                  <div key={group.category.id} className="relative max-w-full">
                    <button
                      ref={(element) => {
                        contentDropdownButtonRefs.current[group.category.id] = element;
                      }}
                      type="button"
                      aria-expanded={isDropdownOpen}
                      aria-controls={menuId}
                      onClick={(event) => toggleContentDropdown(group.category.id, event.currentTarget)}
                      className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition-all ${
                        isDropdownOpen || hasSelectedContent
                          ? 'bg-[#8B5E3C] text-white shadow-md'
                          : 'bg-[#F7F4EF] text-[#6C6258] hover:bg-[#EEE7DD] hover:text-[#4A3728]'
                      }`}
                    >
                      {group.category.name}
                      <span
                        className={`text-xs ${
                          isDropdownOpen || hasSelectedContent ? 'text-white/70' : 'text-[#9B8F84]'
                        }`}
                      >
                        ({group.items.length})
                      </span>
                      <ChevronDown
                        size={14}
                        className={`transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`}
                      />
                    </button>

                    {isDropdownOpen && contentDropdownPosition && (
                      <motion.div
                        ref={contentDropdownRef}
                        id={menuId}
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="fixed z-[90] overflow-hidden rounded-2xl border border-[#E5E3DD] bg-white shadow-xl"
                        style={{
                          left: contentDropdownPosition.left,
                          top: contentDropdownPosition.top,
                          width: contentDropdownPosition.width,
                        }}
                      >
                        <div
                          className="overscroll-contain overflow-y-auto"
                          style={{ maxHeight: contentDropdownPosition.maxHeight }}
                        >
                          {group.items.map((content) => {
                            const isActive = selectedContent?.id === content.id;
                            return (
                              <button
                                key={content.id}
                                onClick={() => {
                                  setSelectedContent(content);
                                  closeContentDropdown();
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
                        </div>
                      </motion.div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
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
        <main className="w-full px-4 pb-8 pt-6 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
          {visibleContents.length > 0 ? (
            singleVisibleContent ? (
              <motion.div
                key={singleVisibleContent.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <StudentContentCard
                  content={singleVisibleContent}
                  showDescriptionToggle={Boolean(isAdmin)}
                />
              </motion.div>
            ) : selectedContent ? (
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
            )
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
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="w-full max-w-md rounded-[32px] bg-white p-7 shadow-2xl"
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

      {/* 교사 통역 자막 방송 수신 — 실제 학생 화면에서만(강사 미리보기 제외).
          반·수업 공개 여부와 무관하게 오늘의 최신 방송을 내 언어 자막으로 하단에 띄운다. */}
      {!isAdmin && <StudentSubtitleOverlay date={gatingDateString} />}

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
