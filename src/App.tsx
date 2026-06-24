import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DocumentData, QuerySnapshot } from 'firebase/firestore';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { MemoSection } from './components/MemoSection';
import { ErrorBoundary } from './components/ErrorBoundary';
import { StudentPage } from './components/StudentPage';
import { StudentAccessManager } from './components/StudentAccessManager';
import { StudentShowcaseManager } from './components/StudentShowcaseManager';
import {
  AccessLog,
  AssignCurriculumDatesResult,
  CalendarClassSummary,
  ClassroomDateRecord,
  Classroom,
  ClassroomSessionState,
  Curriculum,
  CurriculumSession,
  DailyReview,
  Memo,
  NotebookLmFolderSyncResult,
  PublishedLesson,
  Student,
  StudentAccess,
  StudentPost,
  LessonCategory,
  LessonContent,
} from './types';
import {
  auth,
  db,
  googleProvider,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  signInWithCustomToken,
  signOut,
  onAuthStateChanged,
  collection,
  getDocs,
  query,
  where,
  onSnapshot,
  addDoc,
  setDoc,
  deleteDoc,
  doc,
  updateDoc,
  writeBatch,
  orderBy,
  handleFirestoreError,
  OperationType
} from './firebase';

import { ClassroomDashboard } from './components/ClassroomDashboard';
import { ContentLibrary, CONTENT_EDIT_DISCARD_WARNING } from './components/ContentLibrary';
import { CurriculumManager } from './components/CurriculumManager';
import { TimetableFrame } from './components/TimetableFrame';
import { resolveAppPath } from './utils/appPaths';
import {
  normalizeAttendanceRecords,
  sanitizeAttendanceRecordsForStorage,
} from './utils/attendance';
import { normalizeClassroomDateRecordContentIds } from './utils/classroomDateRecordContent';
import {
  CLASSROOM_COLOR_OPTIONS,
  DEFAULT_CLASSROOM_COLOR,
  pickUnusedClassroomColor,
} from './utils/classroomAppearance';
import { CreateClassroomModal } from './components/CreateClassroomModal';
import {
  CLASSROOMS_COLLECTION,
  DAILY_REVIEWS_COLLECTION,
  CLASSROOM_DATE_RECORDS_COLLECTION,
  PUBLISHED_LESSONS_COLLECTION,
  comparePreferredClassroomDateRecord,
  getClassroomDateRecordId,
  getPublishedLessonId,
  sortClassroomDateRecords,
} from './utils/classroomDomain';
import {
  getVisibleStudents,
  isStudentDeleted,
  normalizeStudentRecord,
  sanitizeStudentForStorage,
  sortStudents,
} from './utils/students';
import {
  isValidStudentAccessId,
  normalizeStudentAccessId,
  STUDENT_ACCESS_COLLECTION,
} from './utils/studentAccess';

const removeUndefinedFields = <T extends Record<string, any>>(obj: T): T => {
  const result = { ...obj };
  Object.keys(result).forEach((key) => {
    if (result[key] === undefined) {
      delete result[key];
    }
  });
  return result;
};

type GoogleSheetsSyncRequest = {
  classroomId: string;
  mode?: 'upsert' | 'delete';
  previousName?: string;
  classroomName?: string;
};

type GoogleSheetsSyncErrorState = {
  message: string;
  requests: GoogleSheetsSyncRequest[];
};

type GeneratedMemoDraftResponse = {
  memo: string;
  classroomId: string;
  date: string;
  contentIds: string[];
};

type GeneratedDailyReviewResponse = {
  summary: string;
  date: string;
  recordCount: number;
  classroomCount: number;
};

type ContentReorderUpdate = {
  id: string;
  categoryId: string | null;
  order: number;
};

type AdminTab = 'home' | 'memo' | 'classroom-management' | 'content-library' | 'curriculum-management' | 'timetable' | 'student-access' | 'student-showcase';

const UNCATEGORIZED_CATEGORY_ID = null;
const MISC_CATEGORY_NAME = '기타';

const hasNumericOrder = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const compareCategoryNames = (left: LessonCategory, right: LessonCategory) => {
  if (left.name === MISC_CATEGORY_NAME) return 1;
  if (right.name === MISC_CATEGORY_NAME) return -1;
  return left.name.localeCompare(right.name);
};

const sortCategories = (items: LessonCategory[]) =>
  [...items].sort((left, right) => {
    const leftHasOrder = hasNumericOrder(left.order);
    const rightHasOrder = hasNumericOrder(right.order);

    if (leftHasOrder && rightHasOrder && left.order !== right.order) {
      return left.order - right.order;
    }

    if (leftHasOrder !== rightHasOrder) {
      return leftHasOrder ? -1 : 1;
    }

    return compareCategoryNames(left, right);
  });

const compareCreatedAt = (left: LessonContent, right: LessonContent) =>
  new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();

const sortClassrooms = (items: Classroom[]) =>
  [...items].sort((left, right) => (left.order || 0) - (right.order || 0));

const canonicalizeClassroomDateRecords = (records: ClassroomDateRecord[]) => {
  const recordMap = new Map<string, ClassroomDateRecord>();

  records.forEach((record) => {
    const canonicalId = getClassroomDateRecordId(record.classroomId, record.date);
    const existingRecord = recordMap.get(canonicalId);

    if (!existingRecord || comparePreferredClassroomDateRecord(record, existingRecord) < 0) {
      recordMap.set(canonicalId, record);
    }
  });

  return sortClassroomDateRecords([...recordMap.values()]);
};

const sortContents = (items: LessonContent[]) =>
  [...items].sort((left, right) => {
    const leftHasOrder = hasNumericOrder(left.order);
    const rightHasOrder = hasNumericOrder(right.order);

    if (left.categoryId !== right.categoryId) {
      const leftCategory = left.categoryId ?? '';
      const rightCategory = right.categoryId ?? '';
      return leftCategory.localeCompare(rightCategory);
    }

    if (leftHasOrder && rightHasOrder && left.order !== right.order) {
      return left.order - right.order;
    }

    if (leftHasOrder !== rightHasOrder) {
      return leftHasOrder ? -1 : 1;
    }

    const createdAtDiff = compareCreatedAt(left, right);
    if (createdAtDiff !== 0) {
      return createdAtDiff;
    }

    return left.title.localeCompare(right.title);
  });

// 이론 슬라이드 배열 저장용 정규화: url 트리밍, 빈 항목 제거, 빈 label 키는 빼서 Firestore undefined를 피한다.
const sanitizeTheorySlidesForStorage = (slides: unknown): { url: string; label?: string }[] => {
  if (!Array.isArray(slides)) return [];
  return slides
    .map((slide) => {
      const url = typeof slide?.url === 'string' ? slide.url.trim() : '';
      const label = typeof slide?.label === 'string' ? slide.label.trim() : '';
      return { url, label };
    })
    .filter((slide) => slide.url)
    .map((slide) => (slide.label ? { url: slide.url, label: slide.label } : { url: slide.url }));
};

// 이론 프롬프트 배열 저장용 정규화: prompt 트리밍·빈 항목 제거, 빈 label 키는 빼서 Firestore undefined를 피한다.
// 루틴(MCP)이 써넣는 읽기 전용 필드라 클라이언트는 만들지 않지만, 통째 setDoc 저장 시 보존하기 위해 정규화해 다시 쓴다.
const sanitizeTheoryPromptsForStorage = (prompts: unknown): { label?: string; prompt: string }[] => {
  if (!Array.isArray(prompts)) return [];
  return prompts
    .map((entry) => {
      const label = typeof entry?.label === 'string' ? entry.label.trim() : '';
      const prompt = typeof entry?.prompt === 'string' ? entry.prompt : '';
      return { label, prompt };
    })
    .filter((entry) => entry.prompt.trim())
    .map((entry) => (entry.label ? { label: entry.label, prompt: entry.prompt } : { prompt: entry.prompt }));
};

const getStudentsByClassroomId = (students: Student[]) => {
  const studentsByClassroomId = new Map<string, Student[]>();

  for (const student of sortStudents(getVisibleStudents(students))) {
    const classroomStudents = studentsByClassroomId.get(student.classroomId);
    if (classroomStudents) {
      classroomStudents.push(student);
    } else {
      studentsByClassroomId.set(student.classroomId, [student]);
    }
  }

  return studentsByClassroomId;
};

const DEV_BYPASS = import.meta.env.DEV;

// ── URL 라우팅 헬퍼 ──────────────────────────────────────────────────────────

const getPathFromAppState = (
  vm: 'admin' | 'student',
  tab: AdminTab,
  classroomId: string | null
): string => {
  if (vm === 'student') return '/student';
  switch (tab) {
    case 'memo':                return '/memo';
    case 'classroom-management': return classroomId ? `/classroom/${classroomId}` : '/';
    case 'content-library':     return '/content-library';
    case 'student-access':      return '/student-access';
    case 'student-showcase':    return '/student-showcase';
    default:                    return '/';
  }
};

const parsePathToAppState = (
  pathname: string
): { viewMode: 'admin' | 'student'; activeTab: AdminTab; activeClassroomId: string | null } => {
  if (pathname.startsWith('/student'))     return { viewMode: 'student',  activeTab: 'home',                  activeClassroomId: null };
  if (pathname === '/memo')                return { viewMode: 'admin',    activeTab: 'memo',                  activeClassroomId: null };
  if (pathname.startsWith('/classroom/')) {
    const id = pathname.slice('/classroom/'.length).split('/')[0];
    return { viewMode: 'admin', activeTab: 'classroom-management', activeClassroomId: id || null };
  }
  if (pathname === '/content-library')     return { viewMode: 'admin',    activeTab: 'content-library',       activeClassroomId: null };
  if (pathname === '/student-access')      return { viewMode: 'admin',    activeTab: 'student-access',        activeClassroomId: null };
  if (pathname === '/student-showcase')    return { viewMode: 'admin',    activeTab: 'student-showcase',      activeClassroomId: null };
  return                                          { viewMode: 'admin',    activeTab: 'home',                  activeClassroomId: null };
};

// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [dailyReviews, setDailyReviews] = useState<DailyReview[]>([]);
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [classroomDateRecords, setClassroomDateRecords] = useState<ClassroomDateRecord[]>([]);
  const [categories, setCategories] = useState<LessonCategory[]>([]);
  const [contents, setContents] = useState<LessonContent[]>([]);
  const [publishedLessons, setPublishedLessons] = useState<PublishedLesson[]>([]);
  const [studentPosts, setStudentPosts] = useState<StudentPost[]>([]);
  const [activeTab, setActiveTab] = useState<AdminTab>('home');
  const [viewMode, setViewMode] = useState<'admin' | 'student'>('student');
  const [isDevSigningIn, setIsDevSigningIn] = useState(DEV_BYPASS);
  const [activeClassroomId, setActiveClassroomId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isContentLibraryDirty, setIsContentLibraryDirty] = useState(false);
  const [selectedContentIdInLibrary, setSelectedContentIdInLibrary] = useState<string | null>(null);

  // URL 라우팅 – 초기 경로 저장, 동기화 활성화 플래그
  const initialPathRef = useRef(window.location.pathname);
  const initialPathAppliedRef = useRef(false);
  const urlSyncEnabledRef = useRef(false);
  const isPopstateRef = useRef(false);
  const [googleSheetsSyncError, setGoogleSheetsSyncError] = useState<GoogleSheetsSyncErrorState | null>(null);
  const [isRetryingGoogleSheetsSync, setIsRetryingGoogleSheetsSync] = useState(false);

  // Login State
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [signInError, setSignInError] = useState('');
  const [driveAccessToken, setDriveAccessToken] = useState('');

  // Admins (Firestore-driven)
  const [adminEmails, setAdminEmails] = useState<string[] | null>(null);
  const normalizedUserEmail = normalizeStudentAccessId(user?.email);
  const isAdmin = DEV_BYPASS || (adminEmails !== null && adminEmails.includes(normalizedUserEmail));
  const [studentAccessEntries, setStudentAccessEntries] = useState<StudentAccess[]>([]);
  const [isStudentAccessAllowed, setIsStudentAccessAllowed] = useState(false);
  const [isStudentAccessCheckReady, setIsStudentAccessCheckReady] = useState(true);
  const canAccessStudentPage = isAdmin || isStudentAccessAllowed;
  const isAppReady =
    isAuthReady &&
    adminEmails !== null &&
    (!user || isAdmin || isStudentAccessCheckReady);

  // Access Logs (admin-only)
  const [accessLogs, setAccessLogs] = useState<AccessLog[]>([]);
  const accessLoggedRef = useRef(false);
  const studentsById = useMemo(
    () => new Map(students.map((student) => [student.id, student])),
    [students]
  );
  const studentsByClassroomId = useMemo(
    () => getStudentsByClassroomId(students),
    [students]
  );
  const classroomsWithStudents = useMemo(
    () =>
      classrooms.map((classroom) => ({
        ...classroom,
        students: studentsByClassroomId.get(classroom.id) || [],
      })),
    [classrooms, studentsByClassroomId]
  );
  const activeClassroom = useMemo(
    () => classroomsWithStudents.find((classroom) => classroom.id === activeClassroomId) || null,
    [classroomsWithStudents, activeClassroomId]
  );
  const getUserIdToken = useCallback(async () => {
    if (!user) return null;
    return user.getIdToken();
  }, [user]);

  const confirmContentLibraryNavigation = () => {
    if (activeTab !== 'content-library' || !isContentLibraryDirty) {
      return true;
    }

    return window.confirm(CONTENT_EDIT_DISCARD_WARNING);
  };

  const runWithContentLibraryNavigationGuard = (action: () => void) => {
    if (!confirmContentLibraryNavigation()) {
      return false;
    }

    action();
    return true;
  };

  const handleTabChange = (nextTab: AdminTab) => {
    if (viewMode !== 'student' && nextTab === activeTab) return;
    runWithContentLibraryNavigationGuard(() => {
      setViewMode('admin');
      setActiveTab(nextTab);
    });
  };

  const handleSwitchToStudent = () => {
    runWithContentLibraryNavigationGuard(() => setViewMode('student'));
  };

  const postAdminRequest = async <TResponse,>(path: string, payload: unknown): Promise<TResponse> => {
    if (!user) {
      throw new Error('관리자 요청을 보내려면 로그인 정보가 필요합니다.');
    }

    const idToken = await user.getIdToken();
    const response = await fetch(resolveAppPath(path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
    });

    const responsePayload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(responsePayload?.error || '관리자 요청 처리에 실패했습니다.');
    }
    return (responsePayload || {}) as TResponse;
  };

  const getAdminRequest = async <TResponse,>(path: string): Promise<TResponse> => {
    if (!user) {
      throw new Error('관리자 요청을 보내려면 로그인 정보가 필요합니다.');
    }
    const idToken = await user.getIdToken();
    const response = await fetch(resolveAppPath(path), {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const responsePayload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(responsePayload?.error || '관리자 요청 처리에 실패했습니다.');
    }
    return (responsePayload || {}) as TResponse;
  };

  const handleListCalendarClasses = async (): Promise<CalendarClassSummary[]> => {
    const { items } = await getAdminRequest<{ items: CalendarClassSummary[] }>('api/calendar/classes');
    return items || [];
  };

  // 학생 작품 승인(홈페이지 공유)/숨김. 실제 반영은 studentPosts 리스너가 실시간으로 갱신.
  const handleReviewStudentPost = async (id: string, action: 'approve' | 'hide') => {
    await postAdminRequest(`api/student-posts/${id}/review`, { action });
  };

  const handleAssignCurriculumDates = async (
    classroomId: string,
    options?: { calendarClassId?: string; overwrite?: boolean }
  ): Promise<AssignCurriculumDatesResult> =>
    postAdminRequest<AssignCurriculumDatesResult>('api/calendar/assign-curriculum-dates', {
      classroomId,
      ...options,
    });

  const syncClassroomsWithGoogleSheets = async (
    requests: GoogleSheetsSyncRequest[],
    options?: { isRetry?: boolean }
  ) => {
    if (!user || requests.length === 0) return;

    if (options?.isRetry) {
      setIsRetryingGoogleSheetsSync(true);
    }

    try {
      await Promise.all(
        requests.map((request) =>
          postAdminRequest<unknown>('api/google-sheets/sync-classroom', request)
        )
      );
      setGoogleSheetsSyncError(null);
    } catch (error) {
      setGoogleSheetsSyncError({
        message: error instanceof Error ? error.message : 'Google Sheets 동기화에 실패했습니다.',
        requests,
      });
    } finally {
      if (options?.isRetry) {
        setIsRetryingGoogleSheetsSync(false);
      }
    }
  };

  const triggerGoogleSheetsSync = (requests: GoogleSheetsSyncRequest[]) => {
    void syncClassroomsWithGoogleSheets(requests);
  };

  const handleSyncNotebookLmFolder = (folderId: string, driveAccessToken: string) =>
    postAdminRequest<NotebookLmFolderSyncResult>('api/notebooklm/sync-folder', {
      folderId,
      driveAccessToken,
    });

  const handleAddStudentAccess = async (rawEmail: string, memo: string) => {
    if (!user || !isAdmin) return;

    const email = normalizeStudentAccessId(rawEmail);
    if (!isValidStudentAccessId(email)) {
      throw new Error('올바른 이메일 형식의 아이디를 입력하세요.');
    }

    const timestamp = new Date().toISOString();
    await setDoc(
      doc(db, STUDENT_ACCESS_COLLECTION, email),
      {
        email,
        memo: memo.trim(),
        ownerUid: user.uid,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      { merge: true }
    );
  };

  const handleDeleteStudentAccess = async (rawEmail: string) => {
    if (!user || !isAdmin) return;

    const email = normalizeStudentAccessId(rawEmail);
    if (!isValidStudentAccessId(email)) {
      throw new Error('삭제할 아이디를 찾을 수 없습니다.');
    }

    await deleteDoc(doc(db, STUDENT_ACCESS_COLLECTION, email));
  };

  const handleRetryGoogleSheetsSync = async () => {
    if (!googleSheetsSyncError) return;
    await syncClassroomsWithGoogleSheets(googleSheetsSyncError.requests, { isRetry: true });
  };

  // Load admin emails from Firestore once on mount
  useEffect(() => {
    const FALLBACK_ADMINS = ['songes0515@gmail.com', 'damunacenter@gmail.com'];
    getDocs(collection(db, 'admins'))
      .then((snapshot) => {
        const emails = snapshot.docs
          .map((d) => normalizeStudentAccessId(d.id))
          .filter(Boolean);
        setAdminEmails(emails.length > 0 ? emails : FALLBACK_ADMINS);
      })
      .catch(() => {
        setAdminEmails(FALLBACK_ADMINS);
      });
  }, []);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setIsAuthReady(true);
      if (!nextUser) {
        accessLoggedRef.current = false;
      }
    });
    return () => unsubscribe();
  }, []);

  // Dev auto sign-in: get a custom token from the local server and sign in silently
  useEffect(() => {
    if (!DEV_BYPASS) return;

    fetch(resolveAppPath('api/dev/token'))
      .then((r) => r.json() as Promise<{ token?: string }>)
      .then(({ token }) => {
        if (token) return signInWithCustomToken(auth, token);
      })
      .catch((err) => console.warn('[dev] Auto sign-in failed:', err))
      .finally(() => setIsDevSigningIn(false));
  }, []);

  useEffect(() => {
    if (!isAuthReady || adminEmails === null) {
      return;
    }

    if (!user) {
      setIsStudentAccessAllowed(false);
      setIsStudentAccessCheckReady(true);
      return;
    }

    if (isAdmin) {
      setIsStudentAccessAllowed(true);
      setIsStudentAccessCheckReady(true);
      return;
    }

    const email = normalizeStudentAccessId(user.email);
    if (!email) {
      setIsStudentAccessAllowed(false);
      setIsStudentAccessCheckReady(true);
      return;
    }

    setIsStudentAccessAllowed(false);
    setIsStudentAccessCheckReady(false);

    const unsubscribe = onSnapshot(
      doc(db, STUDENT_ACCESS_COLLECTION, email),
      (snapshot) => {
        setIsStudentAccessAllowed(snapshot.exists());
        setIsStudentAccessCheckReady(true);
      },
      () => {
        setIsStudentAccessAllowed(false);
        setIsStudentAccessCheckReady(true);
      }
    );

    return () => unsubscribe();
  }, [adminEmails, isAdmin, isAuthReady, user]);

  // Set viewMode once we know both user & adminEmails
  useEffect(() => {
    if (!user) return;
    if (isAdmin) {
      setViewMode('admin');
    } else {
      setViewMode('student');
    }
  }, [user, isAdmin]);

  // ── URL 라우팅 ────────────────────────────────────────────────────────────

  // 1) 인증 준비 완료 후 초기 URL 경로 적용 (1회)
  useEffect(() => {
    if (!isAppReady || !user || initialPathAppliedRef.current) return;
    initialPathAppliedRef.current = true;
    urlSyncEnabledRef.current = true;

    if (!isAdmin) return; // 비관리자는 항상 학생 뷰

    const parsed = parsePathToAppState(initialPathRef.current);
    if (parsed.viewMode === 'student') {
      setViewMode('student');
    } else {
      setActiveTab(parsed.activeTab);
      if (parsed.activeClassroomId) setActiveClassroomId(parsed.activeClassroomId);
    }
  }, [isAppReady, user, isAdmin]);

  // 2) 상태 변경 → URL 동기화
  useEffect(() => {
    if (!urlSyncEnabledRef.current || isPopstateRef.current) return;
    const path = getPathFromAppState(viewMode, activeTab, activeClassroomId);
    if (window.location.pathname !== path) {
      window.history.pushState(null, '', path);
    }
  }, [viewMode, activeTab, activeClassroomId]);

  // 3) 브라우저 뒤로/앞으로 버튼 처리
  useEffect(() => {
    const isAdminSnapshot = isAdmin; // 클로저용 스냅샷

    const handlePopstate = () => {
      isPopstateRef.current = true;
      const parsed = parsePathToAppState(window.location.pathname);

      if (isAdminSnapshot) {
        if (parsed.viewMode === 'student') {
          setViewMode('student');
        } else {
          setViewMode('admin');
          setActiveTab(parsed.activeTab);
          setActiveClassroomId(parsed.activeClassroomId);
        }
      }

      requestAnimationFrame(() => { isPopstateRef.current = false; });
    };

    window.addEventListener('popstate', handlePopstate);
    return () => window.removeEventListener('popstate', handlePopstate);
  }, [isAdmin]);

  // ─────────────────────────────────────────────────────────────────────────

  // Log non-admin access
  useEffect(() => {
    if (
      !user ||
      adminEmails === null ||
      isAdmin ||
      !canAccessStudentPage ||
      !isStudentAccessCheckReady ||
      accessLoggedRef.current
    ) return;
    accessLoggedRef.current = true;
    void addDoc(collection(db, 'access_logs'), {
      email: user.email ?? '',
      uid: user.uid,
      displayName: user.displayName ?? '',
      loginAt: new Date().toISOString(),
    }).catch((error) => console.error('Failed to write access log', error));
  }, [user, adminEmails, isAdmin, canAccessStudentPage, isStudentAccessCheckReady]);

  useEffect(() => {
    if (!isAdmin) {
      setStudentAccessEntries([]);
      return;
    }

    const unsubscribe = onSnapshot(
      collection(db, STUDENT_ACCESS_COLLECTION),
      (snapshot) => {
        setStudentAccessEntries(
          snapshot.docs.map((accessDoc) => {
            const data = accessDoc.data() as Partial<StudentAccess>;
            return {
              id: accessDoc.id,
              email: normalizeStudentAccessId(data.email) || accessDoc.id,
              memo: typeof data.memo === 'string' ? data.memo : undefined,
              ownerUid: data.ownerUid ?? '',
              createdAt: data.createdAt ?? '',
              updatedAt: data.updatedAt ?? '',
            } satisfies StudentAccess;
          })
        );
      },
      (error) => handleFirestoreError(error, OperationType.LIST, STUDENT_ACCESS_COLLECTION)
    );

    return () => unsubscribe();
  }, [isAdmin]);

  // Load access logs (admin only)
  useEffect(() => {
    if (!isAdmin) {
      setAccessLogs([]);
      return;
    }
    const logsQuery = query(
      collection(db, 'access_logs'),
      orderBy('loginAt', 'desc')
    );
    const unsubscribe = onSnapshot(logsQuery, (snapshot) => {
      setAccessLogs(
        snapshot.docs.map((d) => ({
          id: d.id,
          email: d.data().email ?? '',
          uid: d.data().uid ?? '',
          displayName: d.data().displayName ?? '',
          loginAt: d.data().loginAt ?? '',
        }))
      );
    });
    return () => unsubscribe();
  }, [isAdmin]);

  useEffect(() => {
    if (!user) {
      setGoogleSheetsSyncError(null);
      setIsRetryingGoogleSheetsSync(false);
    }
  }, [user]);

  // Auto-hide Google Sheets sync error alert after 5 seconds
  useEffect(() => {
    if (googleSheetsSyncError) {
      const timer = setTimeout(() => {
        setGoogleSheetsSyncError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [googleSheetsSyncError]);

  // Data Listeners
  useEffect(() => {
    if (!canAccessStudentPage) {
      setClassrooms([]);
      setStudents([]);
      setMemos([]);
      setDailyReviews([]);
      setClassroomDateRecords([]);
      setCategories([]);
      setContents([]);
      setPublishedLessons([]);
      return;
    }

    const normalizeClassroomSnapshot = (snapshot: QuerySnapshot<DocumentData>) =>
      snapshot.docs.map((classroomDoc) => {
        const data = classroomDoc.data() as Partial<Classroom>;
        return {
          id: classroomDoc.id,
          name: data.name ?? '',
          ownerUid: data.ownerUid ?? '',
          isOpen: data.isOpen,
          order: hasNumericOrder(data.order) ? data.order : undefined,
          icon: typeof data.icon === 'string' ? data.icon : undefined,
          color: typeof data.color === 'string' ? data.color : undefined,
          createdAt: typeof data.createdAt === 'string' ? data.createdAt : undefined,
          driveFolderId: typeof data.driveFolderId === 'string' ? data.driveFolderId : undefined,
          driveFolderName: typeof data.driveFolderName === 'string' ? data.driveFolderName : undefined,
          curriculumId: typeof data.curriculumId === 'string' ? data.curriculumId : undefined,
          description: typeof data.description === 'string' ? data.description : undefined,
          organization: typeof data.organization === 'string' ? data.organization : undefined,
          calendarClassId: typeof data.calendarClassId === 'string' ? data.calendarClassId : undefined,
          sessionStates:
            data.sessionStates && typeof data.sessionStates === 'object'
              ? (data.sessionStates as Record<string, ClassroomSessionState>)
              : undefined,
          hidden: data.hidden === true,
        } satisfies Classroom;
      });

    const classroomsQuery = query(collection(db, CLASSROOMS_COLLECTION));
    const unsubscribeClassrooms = onSnapshot(
      classroomsQuery,
      (snapshot) => {
        setClassrooms(sortClassrooms(normalizeClassroomSnapshot(snapshot)));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, CLASSROOMS_COLLECTION)
    );

    let unsubscribeStudents = () => {};
    if (isAdmin) {
      const studentsQuery = query(collection(db, 'students'));
      unsubscribeStudents = onSnapshot(
        studentsQuery,
        (snapshot) => {
          const nextStudents = snapshot.docs.map((studentDoc) =>
            normalizeStudentRecord({
              id: studentDoc.id,
              ...(studentDoc.data() as Partial<Student>),
            })
          );

          if (import.meta.env.DEV) {
            const incomplete = nextStudents.filter((s) => !s.classroomId || s.order === undefined);
            if (incomplete.length > 0) {
              console.warn(
                '[dev] Students missing classroomId or order:',
                incomplete.map((s) => ({ id: s.id, name: s.name, classroomId: s.classroomId, order: s.order }))
              );
            }
          }

          setStudents(sortStudents(nextStudents));
        },
        (error) => handleFirestoreError(error, OperationType.LIST, 'students')
      );
    } else {
      setStudents([]);
    }

    // Memos Listener (Requires auth)
    let unsubscribeMemos = () => {};
    if (user && isAdmin) {
      const memosQuery = query(
        collection(db, 'memos'),
        where('ownerUid', '==', user.uid),
        orderBy('date', 'desc')
      );
      unsubscribeMemos = onSnapshot(memosQuery, (snapshot) => {
        const memosData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Memo[];
        setMemos(memosData);
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'memos'));
    } else {
      setMemos([]);
    }


    let unsubscribeClassroomDateRecords = () => {};
    if (user && isAdmin) {
      const normalizeClassroomDateRecordSnapshot = (snapshot: QuerySnapshot<DocumentData>) =>
        snapshot.docs.map((recordDoc) => {
          const data = recordDoc.data() as Partial<ClassroomDateRecord>;
          const classroomId = typeof data.classroomId === 'string' ? data.classroomId.trim() : '';
          const date = typeof data.date === 'string' ? data.date.trim() : '';

          if (!classroomId || !date) {
            return null;
          }

          return {
            id: recordDoc.id,
            classroomId,
            classroomName: typeof data.classroomName === 'string' ? data.classroomName.trim() : '',
            ownerUid: data.ownerUid ?? '',
            date,
            contentIds: normalizeClassroomDateRecordContentIds(data),
            attendance: normalizeAttendanceRecords(data.attendance),
            memo: data.memo ?? '',
            ...(typeof data.theorySlideUrl === 'string' ? { theorySlideUrl: data.theorySlideUrl } : {}),
            ...(Array.isArray(data.theorySlides)
              ? {
                  theorySlides: data.theorySlides
                    .filter((slide) => slide && typeof slide.url === 'string' && slide.url.trim())
                    .map((slide): { url: string; label?: string } =>
                      slide.label ? { url: slide.url, label: slide.label } : { url: slide.url }
                    ),
                }
              : {}),
            // 새벽 루틴이 써둔 NotebookLM 이론 프롬프트(강사 대시보드 표시용). 빼먹으면 화면에 안 뜨고,
            // 강사가 날짜기록을 저장(setDoc)할 때 통째로 덮어써져 사라진다.
            ...(Array.isArray(data.theoryPrompts)
              ? {
                  theoryPrompts: data.theoryPrompts
                    .filter((entry) => entry && typeof entry.prompt === 'string' && entry.prompt.trim())
                    .map((entry): { prompt: string; label?: string } =>
                      typeof entry.label === 'string' && entry.label.trim()
                        ? { prompt: entry.prompt, label: entry.label.trim() }
                        : { prompt: entry.prompt }
                    ),
                }
              : {}),
            ...(typeof data.curriculumId === 'string' && data.curriculumId.trim()
              ? { curriculumId: data.curriculumId.trim() }
              : {}),
            ...(typeof data.curriculumSessionId === 'string' && data.curriculumSessionId.trim()
              ? { curriculumSessionId: data.curriculumSessionId.trim() }
              : {}),
            createdAt: data.createdAt ?? '',
            updatedAt: data.updatedAt ?? '',
          } satisfies ClassroomDateRecord;
        }).filter((record): record is ClassroomDateRecord => Boolean(record));

      const classroomDateRecordsQuery = query(
        collection(db, CLASSROOM_DATE_RECORDS_COLLECTION),
        orderBy('date', 'desc')
      );
      unsubscribeClassroomDateRecords = onSnapshot(
        classroomDateRecordsQuery,
        (snapshot) => {
          setClassroomDateRecords(
            canonicalizeClassroomDateRecords(normalizeClassroomDateRecordSnapshot(snapshot))
          );
        },
        (error) => handleFirestoreError(error, OperationType.LIST, CLASSROOM_DATE_RECORDS_COLLECTION)
      );
    } else {
      setClassroomDateRecords([]);
    }

    // Categories Listener
    const categoriesQuery = query(
      collection(db, 'categories')
    );
    const unsubscribeCategories = onSnapshot(categoriesQuery, (snapshot) => {
      const categoryData = snapshot.docs.map((categoryDoc) => {
        const data = categoryDoc.data() as Partial<LessonCategory>;
        return {
          id: categoryDoc.id,
          name: data.name ?? '',
          ownerUid: data.ownerUid ?? '',
          order: hasNumericOrder(data.order) ? data.order : undefined,
        } satisfies LessonCategory;
      });

      setCategories(sortCategories(categoryData));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'categories'));

    // Contents Listener
    const contentsQuery = query(
      collection(db, 'contents')
    );
    const unsubscribeContents = onSnapshot(contentsQuery, (snapshot) => {
      const contentData = snapshot.docs.map((contentDoc) => {
        const data = contentDoc.data() as Partial<LessonContent>;
        return {
          id: contentDoc.id,
          categoryId: typeof data.categoryId === 'string' ? data.categoryId : UNCATEGORIZED_CATEGORY_ID,
          ownerUid: data.ownerUid ?? '',
          title: data.title ?? '',
          description: data.description ?? '',
          html: data.html ?? '',
          slideUrl: data.slideUrl ?? '',
          createdAt: data.createdAt ?? new Date(0).toISOString(),
          order: hasNumericOrder(data.order) ? data.order : undefined,
          sourceDriveFileId: data.sourceDriveFileId,
          convertedDriveFileId: data.convertedDriveFileId,
          sourceModifiedTime: data.sourceModifiedTime,
          syncedAt: data.syncedAt,
          syncProvider: data.syncProvider === 'notebooklm-drive-folder' ? data.syncProvider : undefined,
        } satisfies LessonContent;
      });

      setContents(sortContents(contentData));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'contents'));

    // Published Lessons Listener — 강사가 '공개'한 실습 블록 목록. 학생도 읽을 수 있는 유일한 수업 데이터.
    const publishedLessonsQuery = query(collection(db, PUBLISHED_LESSONS_COLLECTION));
    const unsubscribePublishedLessons = onSnapshot(
      publishedLessonsQuery,
      (snapshot) => {
        const publishedData = snapshot.docs.map((lessonDoc) => {
          const data = lessonDoc.data() as Partial<PublishedLesson>;
          return {
            id: lessonDoc.id,
            classroomId: typeof data.classroomId === 'string' ? data.classroomId : '',
            classroomName: typeof data.classroomName === 'string' ? data.classroomName : '',
            date: typeof data.date === 'string' ? data.date : '',
            publishedContentIds: Array.isArray(data.publishedContentIds)
              ? data.publishedContentIds.filter((value): value is string => typeof value === 'string')
              : [],
            ownerUid: data.ownerUid ?? '',
            updatedAt: data.updatedAt ?? '',
            endNoticeAt: typeof data.endNoticeAt === 'string' ? data.endNoticeAt : undefined,
          } satisfies PublishedLesson;
        });
        setPublishedLessons(publishedData);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, PUBLISHED_LESSONS_COLLECTION)
    );

    return () => {
      unsubscribeClassrooms();
      unsubscribeStudents();
      unsubscribeMemos();
      unsubscribeClassroomDateRecords();
      unsubscribeCategories();
      unsubscribeContents();
      unsubscribePublishedLessons();
    };
  }, [user, isAdmin, canAccessStudentPage]);

  // dailyReviews 리스너는 isAdmin 변경에도 반응해야 하므로 별도 useEffect로 분리
  useEffect(() => {
    if (!user || !isAdmin) {
      setDailyReviews([]);
      return;
    }

    const dailyReviewsQuery = query(collection(db, DAILY_REVIEWS_COLLECTION), orderBy('date', 'desc'));
    const unsubscribeDailyReviews = onSnapshot(
      dailyReviewsQuery,
      (snapshot) => {
        const dailyReviewsData = snapshot.docs.map((reviewDoc) => {
          const data = reviewDoc.data() as Partial<DailyReview>;
          return {
            id: reviewDoc.id,
            date: data.date ?? '',
            ownerUid: data.ownerUid ?? '',
            summary: data.summary ?? '',
            sourceRecordIds: Array.isArray(data.sourceRecordIds)
              ? data.sourceRecordIds.filter((value): value is string => typeof value === 'string')
              : [],
            createdAt: data.createdAt ?? '',
            updatedAt: data.updatedAt ?? '',
          } satisfies DailyReview;
        });
        setDailyReviews(dailyReviewsData);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, DAILY_REVIEWS_COLLECTION)
    );

    return () => unsubscribeDailyReviews();
  }, [user, isAdmin]);

  // 학생 작품 게시물 리스너 (관리자 전용 — 홈페이지 공유 관리·실시간 승인 대기 배지)
  useEffect(() => {
    if (!user || !isAdmin) {
      setStudentPosts([]);
      return;
    }

    const unsubscribeStudentPosts = onSnapshot(
      collection(db, 'studentPosts'),
      (snapshot) => {
        const postsData = snapshot.docs.map((postDoc) => {
          const data = postDoc.data() as Partial<StudentPost>;
          return {
            id: postDoc.id,
            ownerUid: data.ownerUid ?? '',
            title: data.title ?? '',
            description: data.description ?? '',
            studentName: data.studentName ?? '',
            anonymous: data.anonymous === true,
            classroomId: data.classroomId ?? '',
            classroomName: data.classroomName ?? '',
            driveFileId: data.driveFileId ?? '',
            fileName: data.fileName ?? '',
            mimeType: data.mimeType ?? '',
            webViewLink: data.webViewLink ?? '',
            imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : undefined,
            status: (['pending', 'approved', 'hidden'] as const).includes(
              data.status as StudentPost['status']
            )
              ? (data.status as StudentPost['status'])
              : 'pending',
            order: typeof data.order === 'number' ? data.order : undefined,
            createdAt: data.createdAt ?? '',
            approvedAt: typeof data.approvedAt === 'string' ? data.approvedAt : undefined,
          } satisfies StudentPost;
        });
        setStudentPosts(postsData);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'studentPosts')
    );

    return () => unsubscribeStudentPosts();
  }, [user, isAdmin]);

  // 커리큘럼 리스너 (관리자 전용 — ChatGPT/Claude로 관리되는 데이터를 실시간 반영)
  useEffect(() => {
    if (!user || !isAdmin) {
      setCurriculums([]);
      return;
    }

    const unsubscribeCurriculums = onSnapshot(
      collection(db, 'curriculums'),
      (snapshot) => {
        const curriculumsData = snapshot.docs.map((curriculumDoc) => {
          const data = curriculumDoc.data() as Partial<Curriculum>;
          return {
            id: curriculumDoc.id,
            ownerUid: data.ownerUid ?? '',
            title: data.title ?? '',
            description: data.description,
            sessions: Array.isArray(data.sessions) ? data.sessions : [],
            order: data.order,
            createdAt: data.createdAt ?? '',
            updatedAt: data.updatedAt ?? '',
          } satisfies Curriculum;
        });
        curriculumsData.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setCurriculums(curriculumsData);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'curriculums')
    );

    return () => unsubscribeCurriculums();
  }, [user, isAdmin]);

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    setSignInError('');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setDriveAccessToken(credential.accessToken);
      }
    } catch (error: any) {
      if (error.code !== 'auth/popup-closed-by-user') {
        setSignInError('로그인에 실패했습니다. 다시 시도해주세요.');
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  // Google One Tap auto-login
  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID as string | undefined;
    if (!clientId || user || !isAuthReady) return;

    const onLoad = () => {
      window.google?.accounts.id.initialize({
        client_id: clientId,
        callback: async (response: { credential: string }) => {
          try {
            const cred = GoogleAuthProvider.credential(response.credential);
            const result = await signInWithCredential(auth, cred);
            const googleCred = GoogleAuthProvider.credentialFromResult(result);
            if (googleCred?.accessToken) {
              setDriveAccessToken(googleCred.accessToken);
            }
          } catch (err) {
            console.error('One Tap sign-in failed:', err);
          }
        },
        auto_select: true,
      });
      window.google?.accounts.id.prompt();
    };

    if (window.google?.accounts?.id) {
      onLoad();
    } else {
      const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
      if (!existing) {
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = onLoad;
        document.head.appendChild(script);
      }
    }

    return () => {
      window.google?.accounts.id.cancel?.();
    };
  }, [user, isAuthReady]);

  const handleLogout = async () => {
    if (!confirmContentLibraryNavigation()) {
      return;
    }

    try {
      await signOut(auth);
      setDriveAccessToken('');
      setActiveTab('home');
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const handleAddMemo = async (content: string) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'memos'), {
        content,
        date: new Date().toISOString().split('T')[0],
        ownerUid: user.uid,
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'memos');
    }
  };

  const handleDeleteMemo = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'memos', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `memos/${id}`);
    }
  };

  const handleGenerateMemoDraft = async (
    classroomId: string,
    date: string,
    existingMemo?: string
  ): Promise<string> => {
    const response = await postAdminRequest<GeneratedMemoDraftResponse>(
      'api/classroom-date-records/generate-memo-draft',
      {
        classroomId,
        date,
        existingMemo,
      }
    );

    return response.memo;
  };

  const handleGenerateDailyReview = async (date: string) => {
    try {
      const response = await postAdminRequest<GeneratedDailyReviewResponse>(
        'api/daily-reviews/generate',
        { date }
      );
      return response.summary;
    } catch (error) {
      const message = error instanceof Error ? error.message : '하루 전체 평 생성에 실패했습니다.';
      throw new Error(message);
    }
  };

  const handleUpdateDailyReview = async (id: string, summary: string) => {
    await updateDoc(doc(db, DAILY_REVIEWS_COLLECTION, id), {
      summary,
      updatedAt: new Date().toISOString(),
    });
  };

  const upsertLocalClassroomDateRecord = (record: ClassroomDateRecord) => {
    setClassroomDateRecords((previousRecords) =>
      canonicalizeClassroomDateRecords([
        ...previousRecords.filter(
          (candidate) =>
            candidate.id !== record.id &&
            getClassroomDateRecordId(candidate.classroomId, candidate.date) !==
              getClassroomDateRecordId(record.classroomId, record.date)
        ),
        record,
      ])
    );
  };

  const removeLocalClassroomDateRecord = (recordId: string) => {
    setClassroomDateRecords((previousRecords) =>
      sortClassroomDateRecords(previousRecords.filter((record) => record.id !== recordId))
    );
  };

  const deleteDuplicateClassroomDateRecordDocs = async (
    classroomId: string,
    date: string,
    retainRecordId?: string
  ) => {
    const snapshot = await getDocs(
      query(collection(db, CLASSROOM_DATE_RECORDS_COLLECTION), where('classroomId', '==', classroomId))
    );

    await Promise.all(
      snapshot.docs
        .filter((recordDoc) => {
          const recordDate = recordDoc.data().date;
          return recordDate === date && recordDoc.id !== retainRecordId;
        })
        .map((recordDoc) => deleteDoc(doc(db, CLASSROOM_DATE_RECORDS_COLLECTION, recordDoc.id)))
    );
  };

  const handleSaveStudents = async (classroomId: string, students: Student[]): Promise<void> => {
    if (!user) return;
    try {
      const previousStudents = studentsByClassroomId.get(classroomId) || [];
      const previousStudentsById = new Map(
        previousStudents.map((student) => [student.id, student])
      );
      const nextStudentIds = new Set(students.map((student) => student.id));
      const timestamp = new Date().toISOString();
      const batch = writeBatch(db);

      students.forEach((student, index) => {
        const previousStudent = previousStudentsById.get(student.id) || studentsById.get(student.id);
        const previousWithoutDeletedAt = previousStudent
          ? (({ deletedAt: _deletedAt, ...restStudent }) => restStudent)(previousStudent)
          : undefined;

        const nextStudent = sanitizeStudentForStorage(
          normalizeStudentRecord({
            ...previousWithoutDeletedAt,
            ...student,
            ownerUid: user.uid,
            classroomId,
            order: index,
            createdAt: student.createdAt || previousWithoutDeletedAt?.createdAt || timestamp,
            updatedAt: timestamp,
          })
        );

        batch.set(doc(db, 'students', nextStudent.id), nextStudent);
      });

      previousStudents
        .filter((student) => !nextStudentIds.has(student.id))
        .forEach((student) => {
          const deletedStudent = sanitizeStudentForStorage(
            normalizeStudentRecord({
              ...student,
              ownerUid: student.ownerUid || user.uid,
              classroomId: student.classroomId || classroomId,
              createdAt: student.createdAt || timestamp,
              updatedAt: timestamp,
              deletedAt: timestamp,
            })
          );

          batch.set(doc(db, 'students', student.id), deletedStudent);
        });

      if (students.length > 0 || previousStudents.length > 0) {
        await batch.commit();
      }

      triggerGoogleSheetsSync([{ classroomId, mode: 'upsert' }]);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `students/${classroomId}`);
    }
  };

  const handleMoveStudent = async (
    sourceClassroomId: string,
    targetClassroomId: string,
    studentId: string
  ): Promise<void> => {
    if (!user) return;

    if (!targetClassroomId) {
      throw new Error('이동할 클래스를 선택해 주세요.');
    }

    if (sourceClassroomId === targetClassroomId) {
      throw new Error('같은 클래스로는 이동할 수 없습니다.');
    }

    const sourceClassroom = classrooms.find((classroom) => classroom.id === sourceClassroomId);
    const targetClassroom = classrooms.find((classroom) => classroom.id === targetClassroomId);

    if (!sourceClassroom || !targetClassroom) {
      throw new Error('이동할 클래스 정보를 찾을 수 없습니다.');
    }

    const studentToMove = studentsById.get(studentId);
    const targetStudents = studentsByClassroomId.get(targetClassroomId) || [];

    if (!studentToMove || isStudentDeleted(studentToMove)) {
      throw new Error('이동할 학생 정보를 찾을 수 없습니다.');
    }

    try {
      const { deletedAt: _deletedAt, ...studentWithoutDeletedAt } = studentToMove;
      const movedStudent = sanitizeStudentForStorage(
        normalizeStudentRecord({
          ...studentWithoutDeletedAt,
          ownerUid: studentToMove.ownerUid || user.uid,
          classroomId: targetClassroomId,
          order: targetStudents.length,
          createdAt: studentToMove.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      );
      await setDoc(doc(db, 'students', studentId), movedStudent);
      triggerGoogleSheetsSync([
        { classroomId: sourceClassroomId, mode: 'upsert' },
        { classroomId: targetClassroomId, mode: 'upsert' },
      ]);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `students/${studentId}`);
    }
  };

  const handleUpdateClassroom = async (classroomId: string, data: Partial<Classroom>) => {
    if (!user) return;
    try {
      const previousClassroom = classrooms.find((classroom) => classroom.id === classroomId);
      await setDoc(doc(db, CLASSROOMS_COLLECTION, classroomId), removeUndefinedFields(data), { merge: true });
      triggerGoogleSheetsSync([{
        classroomId,
        mode: 'upsert',
        previousName: previousClassroom?.name,
      }]);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${CLASSROOMS_COLLECTION}/${classroomId}`);
    }
  };

  const handleCreateCurriculum = async (
    title: string,
    description?: string
  ): Promise<string | null> => {
    if (!user) return null;
    try {
      const nowIso = new Date().toISOString();
      const ref = await addDoc(
        collection(db, 'curriculums'),
        removeUndefinedFields({
          ownerUid: user.uid,
          title: title.trim() || '새 커리큘럼',
          description: description?.trim() ? description.trim() : undefined,
          sessions: [],
          order: curriculums.length,
          createdAt: nowIso,
          updatedAt: nowIso,
        })
      );
      return ref.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'curriculums');
      return null;
    }
  };

  const handleUpdateCurriculumMeta = async (
    curriculumId: string,
    data: { title?: string; description?: string }
  ) => {
    if (!user) return;
    try {
      await setDoc(
        doc(db, 'curriculums', curriculumId),
        {
          ...(data.title !== undefined ? { title: data.title.trim() } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `curriculums/${curriculumId}`);
      throw error;
    }
  };

  const handleDeleteCurriculum = async (curriculumId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'curriculums', curriculumId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `curriculums/${curriculumId}`);
      throw error;
    }
  };

  const handleSaveCurriculumSessions = async (
    curriculumId: string,
    sessions: CurriculumSession[]
  ) => {
    if (!user) return;
    // 커리큘럼은 순수 템플릿: 주제·상세·순서·기본 콘텐츠만 저장한다.
    // 날짜·상태(반별)는 절대 커리큘럼에 쓰지 않는다 — 옛 문서/드래프트에 남아 있어도 여기서 떨군다.
    const orderedSessions = sessions.map((session, index) => ({
      id: session.id,
      order: index + 1,
      topic: session.topic,
      ...(session.details !== undefined ? { details: session.details } : {}),
      ...(session.contentIds !== undefined ? { contentIds: session.contentIds } : {}),
    }));
    try {
      await setDoc(
        doc(db, 'curriculums', curriculumId),
        { sessions: orderedSessions, updatedAt: new Date().toISOString() },
        { merge: true }
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `curriculums/${curriculumId}`);
      throw error;
    }
  };

  const handleCreateClassroom = async () => {
    if (!user) return;
    try {
      const newOrder = classrooms.length;
      const classroomRef = doc(collection(db, CLASSROOMS_COLLECTION));
      // 가려지지 않은 기존 클래스 색과 겹치지 않는 색을 자동 배정
      const usedColors = classrooms
        .filter((classroom) => !classroom.hidden)
        .map((classroom) => classroom.color || DEFAULT_CLASSROOM_COLOR);
      const classroomData = {
        name: '새로운 클래스',
        ownerUid: user.uid,
        order: newOrder,
        color: pickUnusedClassroomColor(usedColors),
        createdAt: new Date().toISOString(),
      };
      await setDoc(classroomRef, classroomData);
      triggerGoogleSheetsSync([{ classroomId: classroomRef.id, mode: 'upsert' }]);
      setIsCreateModalOpen(false);
      handleManageClassroom({ ...classroomData, id: classroomRef.id } as Classroom);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, CLASSROOMS_COLLECTION);
    }
  };

  const handleCreateClassroomFromCalendar = async (calendarClass: CalendarClassSummary) => {
    if (!user) return;
    try {
      const newOrder = classrooms.length;
      const classroomRef = doc(collection(db, CLASSROOMS_COLLECTION));
      // 캘린더가 강사명으로 산출한 색을 그대로 사용해 동기화. 없으면 팔레트 기본색.
      const classroomData = {
        name: calendarClass.name || '새로운 클래스',
        ownerUid: user.uid,
        order: newOrder,
        color: calendarClass.color || CLASSROOM_COLOR_OPTIONS[0].value,
        calendarClassId: calendarClass.id,
        createdAt: new Date().toISOString(),
      };
      await setDoc(classroomRef, classroomData);
      triggerGoogleSheetsSync([{ classroomId: classroomRef.id, mode: 'upsert' }]);
      setIsCreateModalOpen(false);
      handleManageClassroom({ ...classroomData, id: classroomRef.id } as Classroom);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, CLASSROOMS_COLLECTION);
    }
  };

  const handleDeleteClassroom = async (classroomId: string) => {
    if (!user) return;
    try {
      const classroomToDelete = classrooms.find((classroom) => classroom.id === classroomId);
      const recordsToDeleteSnapshot = await getDocs(
        query(
          collection(db, CLASSROOM_DATE_RECORDS_COLLECTION),
          where('classroomId', '==', classroomId)
        )
      );
      const studentsToDelete = students.filter(
        (student) => student.classroomId === classroomId
      );
      for (const recordDoc of recordsToDeleteSnapshot.docs) {
        await deleteDoc(doc(db, CLASSROOM_DATE_RECORDS_COLLECTION, recordDoc.id));
      }
      for (const student of studentsToDelete) {
        await deleteDoc(doc(db, 'students', student.id));
      }
      await deleteDoc(doc(db, CLASSROOMS_COLLECTION, classroomId));
      setActiveClassroomId(null);
      setActiveTab('home');
      triggerGoogleSheetsSync([{
        classroomId,
        mode: 'delete',
        classroomName: classroomToDelete?.name,
      }]);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${CLASSROOMS_COLLECTION}/${classroomId}`);
    }
  };

  const handleSaveCategory = async (category: Partial<LessonCategory>) => {
    if (!user) return;
    try {
      if (category.id) {
        await setDoc(doc(db, 'categories', category.id), removeUndefinedFields({ ...category, ownerUid: user.uid }), { merge: true });
      } else {
        await addDoc(collection(db, 'categories'), removeUndefinedFields({
          ...category,
          ownerUid: user.uid,
          order: category.order ?? categories.length,
        }));
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'categories');
    }
  };

  const handleSaveContent = async (content: Partial<LessonContent>): Promise<LessonContent> => {
    if (!user) {
      throw new Error('콘텐츠를 저장하려면 로그인이 필요합니다.');
    }

    if (!content.title?.trim()) {
      throw new Error('콘텐츠 저장에 필요한 정보가 부족합니다.');
    }

    const contentRef = content.id
      ? doc(db, 'contents', content.id)
      : doc(collection(db, 'contents'));
    const categoryId = typeof content.categoryId === 'string' ? content.categoryId : UNCATEGORIZED_CATEGORY_ID;
    const createdAt = content.createdAt ?? new Date().toISOString();
    const description = content.description ?? '';
    const order =
      content.id
        ? content.order
        : content.order ?? contents.filter((item) => (item.categoryId ?? null) === categoryId).length;
    const savedContent: LessonContent = removeUndefinedFields({
      id: contentRef.id,
      categoryId,
      ownerUid: user.uid,
      title: content.title.trim(),
      description,
      html: content.html ?? '',
      slideUrl: content.slideUrl ?? '',
      createdAt,
      order,
      sourceDriveFileId: content.sourceDriveFileId,
      convertedDriveFileId: content.convertedDriveFileId,
      sourceModifiedTime: content.sourceModifiedTime,
      syncedAt: content.syncedAt,
      syncProvider: content.syncProvider,
    });

    try {
      await setDoc(
        contentRef,
        removeUndefinedFields({
          ...content,
          categoryId,
          title: content.title.trim(),
          description,
          order,
          ownerUid: user.uid,
          createdAt,
        }),
        { merge: true }
      );

      return savedContent;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'contents');
      throw error;
    }
  };

  const handleReorderCategories = async (nextCategories: LessonCategory[]) => {
    if (!user) {
      throw new Error('카테고리 순서를 저장하려면 로그인이 필요합니다.');
    }

    try {
      const batch = writeBatch(db);
      nextCategories.forEach((category, index) => {
        batch.set(doc(db, 'categories', category.id), { order: index }, { merge: true });
      });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'categories/reorder');
      throw error;
    }
  };

  const handleReorderContents = async (updates: ContentReorderUpdate[]) => {
    if (!user) {
      throw new Error('콘텐츠 순서를 저장하려면 로그인이 필요합니다.');
    }
    if (updates.length === 0) return;

    try {
      const batch = writeBatch(db);
      updates.forEach((update) => {
        batch.set(
          doc(db, 'contents', update.id),
          {
            categoryId: update.categoryId,
            order: update.order,
          },
          { merge: true }
        );
      });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'contents/reorder');
      throw error;
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!user || !window.confirm('이 카테고리를 삭제하시겠습니까? 관련 콘텐츠도 모두 삭제됩니다.')) return;
    try {
      // Delete all contents in this category
      const categoryContents = contents.filter(c => c.categoryId === categoryId);
      for (const content of categoryContents) {
        await deleteDoc(doc(db, 'contents', content.id));
      }
      // Delete the category
      await deleteDoc(doc(db, 'categories', categoryId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `categories/${categoryId}`);
    }
  };

  const handleDeleteContent = async (contentId: string) => {
    if (!user || !window.confirm('이 콘텐츠를 삭제하시겠습니까?')) return;
    try {
      await deleteDoc(doc(db, 'contents', contentId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `contents/${contentId}`);
    }
  };

  const handleSaveClassroomDateRecord = async (record: ClassroomDateRecord) => {
    if (!user) return;

    try {
      const classroom = classrooms.find((candidate) => candidate.id === record.classroomId);
      const recordId = getClassroomDateRecordId(record.classroomId, record.date);
      const existingRecord = classroomDateRecords.find(
        (candidate) =>
          getClassroomDateRecordId(candidate.classroomId, candidate.date) === recordId
      );
      const nextRecord: ClassroomDateRecord = {
        ...record,
        id: recordId,
        classroomId: record.classroomId,
        classroomName: classroom?.name || record.classroomName,
        ownerUid: user.uid,
        contentIds: normalizeClassroomDateRecordContentIds(record),
        attendance: sanitizeAttendanceRecordsForStorage(record.attendance),
        memo: record.memo ?? '',
        theorySlides: sanitizeTheorySlidesForStorage(record.theorySlides),
        // 루틴이 써둔 이론 프롬프트를 통째 setDoc 저장에서 잃지 않도록 보존(클라이언트는 편집하지 않음).
        theoryPrompts: sanitizeTheoryPromptsForStorage(record.theoryPrompts ?? existingRecord?.theoryPrompts),
        createdAt: existingRecord?.createdAt || record.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, CLASSROOM_DATE_RECORDS_COLLECTION, recordId), nextRecord);
      await deleteDuplicateClassroomDateRecordDocs(record.classroomId, record.date, recordId);

      upsertLocalClassroomDateRecord(nextRecord);
      void postAdminRequest('api/calendar/sync-record', { recordId }).catch(() => {});
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `classroomDateRecords/${record.id}`);
    }
  };

  // 강사가 수업 진행 중 실습 블록을 학생에게 공개/해제. 공개된 콘텐츠 id 목록 전체를 받아 덮어쓴다.
  const handleUpdatePublishedLesson = async (
    classroomId: string,
    classroomName: string,
    date: string,
    publishedContentIds: string[]
  ) => {
    if (!user) return;

    const lessonId = getPublishedLessonId(classroomId, date);
    try {
      const lessonRef = doc(db, PUBLISHED_LESSONS_COLLECTION, lessonId);

      // 공개된 게 하나도 없으면 문서를 지워 학생 화면에서 깔끔히 사라지게 한다.
      if (publishedContentIds.length === 0) {
        await deleteDoc(lessonRef);
        return;
      }

      const nextLesson: PublishedLesson = {
        id: lessonId,
        classroomId,
        classroomName,
        date,
        publishedContentIds,
        ownerUid: user.uid,
        updatedAt: new Date().toISOString(),
      };
      await setDoc(lessonRef, nextLesson);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${PUBLISHED_LESSONS_COLLECTION}/${lessonId}`);
    }
  };

  // 교사가 대시보드에서 '수업 종료'를 누르면: 공개를 모두 닫아 잠그고(빈 목록), endNoticeAt 신호를 찍어
  // 모든 학생 화면에 '오늘 수업 끝!' 안내를 띄운다. 문서를 지우지 않고 남겨야 학생이 신호를 받는다.
  // (다시 공개하면 handleUpdatePublishedLesson이 새 문서로 덮어써 endNoticeAt가 자연히 해제된다.)
  const handleEndLesson = async (
    classroomId: string,
    classroomName: string,
    date: string
  ) => {
    if (!user) return;

    const lessonId = getPublishedLessonId(classroomId, date);
    try {
      const nextLesson: PublishedLesson = {
        id: lessonId,
        classroomId,
        classroomName,
        date,
        publishedContentIds: [],
        ownerUid: user.uid,
        updatedAt: new Date().toISOString(),
        endNoticeAt: new Date().toISOString(),
      };
      await setDoc(doc(db, PUBLISHED_LESSONS_COLLECTION, lessonId), nextLesson);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${PUBLISHED_LESSONS_COLLECTION}/${lessonId}`);
    }
  };

  const handleDeleteClassroomDateRecord = async (recordId: string) => {
    if (!user) return;

    try {
      const record = classroomDateRecords.find((candidate) => candidate.id === recordId);

      if (record) {
        await deleteDuplicateClassroomDateRecordDocs(record.classroomId, record.date);
      } else {
        await deleteDoc(doc(db, CLASSROOM_DATE_RECORDS_COLLECTION, recordId));
      }

      removeLocalClassroomDateRecord(recordId);
      void postAdminRequest('api/calendar/sync-record', { recordId }).catch(() => {});
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `classroomDateRecords/${recordId}`);
    }
  };

  const handleManageClassroom = (classroom: Classroom) => {
    runWithContentLibraryNavigationGuard(() => {
      setViewMode('admin');
      setActiveClassroomId(classroom.id);
      setActiveTab('classroom-management');
    });
  };

  const renderContent = () => {
    if (!isAppReady || isDevSigningIn) {
      return (
        <div className="h-screen flex items-center justify-center bg-[#FBFBFA]">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#8B5E3C]"></div>
        </div>
      );
    }

    if (!user) {
      return (
        <div className="h-screen flex flex-col items-center justify-center bg-[#FBFBFA] p-8">
          <div className="max-w-sm w-full bg-white p-12 rounded-[40px] border border-[#E5E3DD] shadow-xl shadow-[#8B5E3C]/5 text-center">
            <div className="w-16 h-16 bg-[#FFF5E9] rounded-2xl flex items-center justify-center mx-auto mb-8">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#8B5E3C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
              </svg>
            </div>
            <h1 className="text-3xl font-serif font-bold text-[#4A3728] mb-3">다사랑 클래스</h1>
            <p className="text-[#8B7E74] mb-10 leading-relaxed text-sm">
              Google 계정으로 로그인하여<br/>수업 자료를 확인하세요.
            </p>
            {signInError && (
              <p className="text-sm text-red-500 mb-5 font-medium">{signInError}</p>
            )}
            <button
              onClick={() => void handleGoogleSignIn()}
              disabled={isSigningIn}
              className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-white border-2 border-[#E5E3DD] rounded-2xl text-[#4A3728] font-bold hover:bg-[#F3F2EE] hover:border-[#8B5E3C] transition-all disabled:opacity-50 shadow-sm"
            >
              {isSigningIn ? (
                <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#8B5E3C]" />
              ) : (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Google로 로그인
                </>
              )}
            </button>
          </div>
        </div>
      );
    }

    if (!canAccessStudentPage) {
      return (
        <div className="h-screen flex flex-col items-center justify-center bg-[#FBFBFA] p-8">
          <div className="max-w-md w-full rounded-[40px] border border-[#E5E3DD] bg-white p-10 text-center shadow-xl shadow-[#8B5E3C]/5">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-500">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
              </svg>
            </div>
            <h1 className="mb-3 font-serif text-3xl font-bold text-[#4A3728]">
              등록되지 않은 아이디입니다
            </h1>
            <p className="mb-2 text-sm font-medium text-[#8B7E74]">
              {user.email}
            </p>
            <p className="mb-8 text-sm leading-relaxed text-[#8B7E74]">
              관리자에게 학생 페이지 접근 아이디 등록을 요청하세요.
            </p>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="w-full rounded-2xl border-2 border-[#E5E3DD] bg-white px-6 py-4 text-sm font-bold text-[#4A3728] transition-all hover:border-[#8B5E3C] hover:bg-[#F3F2EE]"
            >
              다른 계정으로 로그인
            </button>
          </div>
        </div>
      );
    }

    if (!isAdmin) {
      return (
        <StudentPage
          isAdmin={false}
          getAuthToken={getUserIdToken}
          classrooms={classroomsWithStudents}
          categories={categories}
          contents={contents}
          publishedLessons={publishedLessons}
        />
      );
    }

    return (
      <div className="flex h-screen bg-[#FBFBFA] font-sans text-[#4A3728]">
        <Sidebar
          classrooms={classroomsWithStudents}
          activeClassroomId={activeClassroomId || undefined}
          activeTab={activeTab}
          isStudentView={viewMode === 'student'}
          pendingShowcaseCount={studentPosts.filter((post) => post.status === 'pending').length}
          onTabChange={handleTabChange}
          onManageClassroom={handleManageClassroom}
          onLogout={handleLogout}
          onSwitchToStudent={handleSwitchToStudent}
          onCreateClassroom={() => setIsCreateModalOpen(true)}
          onReorderClassrooms={async (newOrder) => {
            try {
              await Promise.all(
                newOrder.map((classroom, index) =>
                  setDoc(doc(db, CLASSROOMS_COLLECTION, classroom.id), { order: index }, { merge: true })
                )
              );
            } catch (error) {
              console.error('Failed to reorder classrooms', error);
            }
          }}
        />
        <CreateClassroomModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onCreateBlank={handleCreateClassroom}
          onCreateFromCalendar={handleCreateClassroomFromCalendar}
          onListCalendarClasses={handleListCalendarClasses}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          {viewMode === 'student' ? (
            <StudentPage
              embeddedInAdminShell
              isAdmin={isAdmin}
              onBackToAdmin={() => setViewMode('admin')}
              getAuthToken={getUserIdToken}
              classrooms={classroomsWithStudents}
              categories={categories}
              contents={contents}
              publishedLessons={publishedLessons}
            />
          ) : (
            <>
              <Header user={user} activeTab={activeTab} />
              {googleSheetsSyncError && (
            <div className="mx-6 mt-4 flex items-center justify-between gap-4 rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 shadow-sm">
              <div>
                <p className="font-bold">Google Sheets 동기화에 실패했습니다.</p>
                <p className="text-amber-800/80">{googleSheetsSyncError.message}</p>
              </div>
              <button
                onClick={() => void handleRetryGoogleSheetsSync()}
                disabled={isRetryingGoogleSheetsSync}
                className="shrink-0 rounded-xl bg-amber-500 px-4 py-2 font-bold text-white transition-all hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-amber-500"
              >
                {isRetryingGoogleSheetsSync ? '재시도 중...' : '다시 시도'}
              </button>
            </div>
          )}
          {activeTab === 'home' && (
            <Dashboard
              classrooms={classroomsWithStudents}
              onManageClassroom={handleManageClassroom}
              onGoToLibrary={() => handleTabChange('content-library')}
              onGoToMemo={() => handleTabChange('memo')}
              onSwitchToStudent={handleSwitchToStudent}
              accessLogs={accessLogs}
            />
          )}
          {activeTab === 'memo' && (
            <MemoSection
              memos={memos}
              dailyReviews={dailyReviews}
              classrooms={classroomsWithStudents}
              classroomDateRecords={classroomDateRecords}
              onAddMemo={handleAddMemo}
              onDeleteMemo={handleDeleteMemo}
              onGenerateDailyReview={handleGenerateDailyReview}
              onUpdateDailyReview={handleUpdateDailyReview}
            />
          )}
          {activeTab === 'classroom-management' && activeClassroom && (
            <ClassroomDashboard
              key={activeClassroom.id}
              classroom={activeClassroom}
              classrooms={classroomsWithStudents}
              studentsById={studentsById}
              dateRecords={classroomDateRecords}
              categories={categories}
              contents={contents}
              curriculums={curriculums}
              publishedLessons={publishedLessons}
              studentPosts={studentPosts}
              onReviewStudentPost={handleReviewStudentPost}
              getAuthToken={getUserIdToken}
              userEmail={user?.email ?? undefined}
              onSaveStudents={handleSaveStudents}
              onMoveStudent={handleMoveStudent}
              onSaveDateRecord={handleSaveClassroomDateRecord}
              onDeleteDateRecord={handleDeleteClassroomDateRecord}
              onUpdatePublishedLesson={handleUpdatePublishedLesson}
              onEndLesson={handleEndLesson}
              onGenerateMemoDraft={handleGenerateMemoDraft}
              onUpdateClassroom={handleUpdateClassroom}
              onDeleteClassroom={handleDeleteClassroom}
              onListCalendarClasses={handleListCalendarClasses}
              onAssignCurriculumDates={handleAssignCurriculumDates}
              onSaveCurriculumSessions={handleSaveCurriculumSessions}
              onNavigateToContent={(contentId) => {
                setSelectedContentIdInLibrary(contentId);
                setActiveTab('content-library');
                setViewMode('admin');
              }}
            />
          )}
          {activeTab === 'content-library' && (
            <ContentLibrary
              categories={categories}
              contents={contents}
              userEmail={user?.email ?? undefined}
              onSaveCategory={handleSaveCategory}
              onSaveContent={handleSaveContent}
              onReorderCategories={handleReorderCategories}
              onReorderContents={handleReorderContents}
              onDeleteCategory={handleDeleteCategory}
              onDeleteContent={handleDeleteContent}
              onSyncNotebookLmFolder={handleSyncNotebookLmFolder}
              onDirtyStateChange={setIsContentLibraryDirty}
              initialSelectedContentId={selectedContentIdInLibrary}
              onClearInitialSelectedContentId={() => setSelectedContentIdInLibrary(null)}
            />
          )}
          {activeTab === 'curriculum-management' && (
            <CurriculumManager
              curriculums={curriculums}
              contents={contents}
              onCreateCurriculum={handleCreateCurriculum}
              onUpdateCurriculumMeta={handleUpdateCurriculumMeta}
              onDeleteCurriculum={handleDeleteCurriculum}
              onSaveCurriculumSessions={handleSaveCurriculumSessions}
            />
          )}
          {activeTab === 'timetable' && <TimetableFrame />}
          {activeTab === 'student-access' && (
            <StudentAccessManager
              entries={studentAccessEntries}
              onAdd={handleAddStudentAccess}
              onDelete={handleDeleteStudentAccess}
            />
          )}
          {activeTab === 'student-showcase' && (
            <StudentShowcaseManager posts={studentPosts} onReview={handleReviewStudentPost} />
          )}
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <ErrorBoundary>
      {renderContent()}
    </ErrorBoundary>
  );
}
