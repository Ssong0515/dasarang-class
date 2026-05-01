import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { DocumentData, QuerySnapshot } from 'firebase/firestore';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { MemoSection } from './components/MemoSection';
import { ErrorBoundary } from './components/ErrorBoundary';
import { StudentPage } from './components/StudentPage';
import {
  AccessLog,
  ClassroomDateRecord,
  Classroom,
  DailyReview,
  GeneratedMemoDraftOption,
  Memo,
  NotebookLmFolderSyncResult,
  Student,
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
import { resolveAppPath } from './utils/appPaths';
import {
  normalizeAttendanceRecords,
  sanitizeAttendanceRecordsForStorage,
} from './utils/attendance';
import { normalizeClassroomDateRecordContentIds } from './utils/classroomDateRecordContent';
import {
  CLASSROOMS_COLLECTION,
  DAILY_REVIEWS_COLLECTION,
  CLASSROOM_DATE_RECORDS_COLLECTION,
  comparePreferredClassroomDateRecord,
  getClassroomDateRecordId,
  sortClassroomDateRecords,
} from './utils/classroomDomain';
import {
  getVisibleStudents,
  isStudentDeleted,
  normalizeStudentRecord,
  sanitizeStudentForStorage,
  sortStudents,
} from './utils/students';

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
  drafts: GeneratedMemoDraftOption[];
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

type AdminTab = 'home' | 'memo' | 'classroom-management' | 'content-library';

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

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [dailyReviews, setDailyReviews] = useState<DailyReview[]>([]);
  const [classroomDateRecords, setClassroomDateRecords] = useState<ClassroomDateRecord[]>([]);
  const [categories, setCategories] = useState<LessonCategory[]>([]);
  const [contents, setContents] = useState<LessonContent[]>([]);
  const [activeTab, setActiveTab] = useState<AdminTab>('home');
  const [viewMode, setViewMode] = useState<'admin' | 'student'>('student');
  const [activeClassroomId, setActiveClassroomId] = useState<string | null>(null);
  const [isContentLibraryDirty, setIsContentLibraryDirty] = useState(false);
  const [googleSheetsSyncError, setGoogleSheetsSyncError] = useState<GoogleSheetsSyncErrorState | null>(null);
  const [isRetryingGoogleSheetsSync, setIsRetryingGoogleSheetsSync] = useState(false);

  // Login State
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [signInError, setSignInError] = useState('');
  const [driveAccessToken, setDriveAccessToken] = useState('');

  // Admins (Firestore-driven)
  const [adminEmails, setAdminEmails] = useState<string[] | null>(null);
  const isAdmin = adminEmails !== null && adminEmails.includes(user?.email ?? '');
  const isAppReady = isAuthReady && adminEmails !== null;

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

  const handleRetryGoogleSheetsSync = async () => {
    if (!googleSheetsSyncError) return;
    await syncClassroomsWithGoogleSheets(googleSheetsSyncError.requests, { isRetry: true });
  };

  // Load admin emails from Firestore once on mount
  useEffect(() => {
    const FALLBACK_ADMINS = ['songes0515@gmail.com', 'damunacenter@gmail.com'];
    getDocs(collection(db, 'admins'))
      .then((snapshot) => {
        const emails = snapshot.docs.map((d) => d.id);
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

  // Set viewMode once we know both user & adminEmails
  useEffect(() => {
    if (adminEmails === null) return;
    if (user?.email && adminEmails.includes(user.email)) {
      setViewMode('admin');
    } else if (user) {
      setViewMode('student');
    }
  }, [user, adminEmails]);

  // Log non-admin access
  useEffect(() => {
    if (!user || adminEmails === null || isAdmin || accessLoggedRef.current) return;
    accessLoggedRef.current = true;
    void addDoc(collection(db, 'access_logs'), {
      email: user.email ?? '',
      uid: user.uid,
      displayName: user.displayName ?? '',
      loginAt: new Date().toISOString(),
    });
  }, [user, adminEmails, isAdmin]);

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

    const studentsQuery = query(collection(db, 'students'));
    const unsubscribeStudents = onSnapshot(
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

    // Memos Listener (Requires auth)
    let unsubscribeMemos = () => {};
    if (user) {
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

    let unsubscribeDailyReviews = () => {};
    if (user && isAdmin) {
      const dailyReviewsQuery = query(collection(db, DAILY_REVIEWS_COLLECTION), orderBy('date', 'desc'));
      unsubscribeDailyReviews = onSnapshot(
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
    } else {
      setDailyReviews([]);
    }

    let unsubscribeClassroomDateRecords = () => {};
    if (user) {
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

    return () => {
      unsubscribeClassrooms();
      unsubscribeStudents();
      unsubscribeMemos();
      unsubscribeDailyReviews();
      unsubscribeClassroomDateRecords();
      unsubscribeCategories();
      unsubscribeContents();
    };
  }, [user]);

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
  ) => {
    const response = await postAdminRequest<GeneratedMemoDraftResponse>(
      'api/classroom-date-records/generate-memo-draft',
      {
        classroomId,
        date,
        existingMemo,
      }
    );

    return response.drafts;
  };

  const handleGenerateDailyReview = async (date: string) => {
    const response = await postAdminRequest<GeneratedDailyReviewResponse>(
      'api/daily-reviews/generate',
      { date }
    );

    return response.summary;
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
      await setDoc(doc(db, CLASSROOMS_COLLECTION, classroomId), data, { merge: true });
      triggerGoogleSheetsSync([{
        classroomId,
        mode: 'upsert',
        previousName: previousClassroom?.name,
      }]);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${CLASSROOMS_COLLECTION}/${classroomId}`);
    }
  };

  const handleCreateClassroom = async () => {
    if (!user) return;
    try {
      const newOrder = classrooms.length;
      const classroomRef = doc(collection(db, CLASSROOMS_COLLECTION));
      const classroomData = {
        name: '새로운 클래스',
        ownerUid: user.uid,
        order: newOrder,
        createdAt: new Date().toISOString(),
      };
      await setDoc(classroomRef, classroomData);
      triggerGoogleSheetsSync([{ classroomId: classroomRef.id, mode: 'upsert' }]);
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
        await setDoc(doc(db, 'categories', category.id), { ...category, ownerUid: user.uid }, { merge: true });
      } else {
        await addDoc(collection(db, 'categories'), {
          ...category,
          ownerUid: user.uid,
          order: category.order ?? categories.length,
        });
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
    const savedContent: LessonContent = {
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
    };

    try {
      await setDoc(
        contentRef,
        {
          ...content,
          categoryId,
          title: content.title.trim(),
          description,
          order,
          ownerUid: user.uid,
          createdAt,
        },
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
        createdAt: existingRecord?.createdAt || record.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, CLASSROOM_DATE_RECORDS_COLLECTION, recordId), nextRecord);
      await deleteDuplicateClassroomDateRecordDocs(record.classroomId, record.date, recordId);

      upsertLocalClassroomDateRecord(nextRecord);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `classroomDateRecords/${record.id}`);
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
    if (!isAppReady) {
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

    if (!isAdmin) {
      return (
        <StudentPage
          isAdmin={false}
          classrooms={classroomsWithStudents}
          categories={categories}
          contents={contents}
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
          onTabChange={handleTabChange} 
          onManageClassroom={handleManageClassroom}
          onLogout={handleLogout}
          onSwitchToStudent={handleSwitchToStudent}
          onCreateClassroom={handleCreateClassroom}
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
        <div className="flex-1 flex flex-col overflow-hidden">
          {viewMode === 'student' ? (
            <StudentPage
              embeddedInAdminShell
              isAdmin={isAdmin}
              onBackToAdmin={() => setViewMode('admin')}
              classrooms={classroomsWithStudents}
              categories={categories}
              contents={contents}
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
              userEmail={user?.email ?? undefined}
              onSaveStudents={handleSaveStudents}
              onMoveStudent={handleMoveStudent}
              onSaveDateRecord={handleSaveClassroomDateRecord}
              onDeleteDateRecord={handleDeleteClassroomDateRecord}
              onGenerateMemoDraft={handleGenerateMemoDraft}
              onUpdateClassroom={handleUpdateClassroom}
              onDeleteClassroom={handleDeleteClassroom}
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
            />
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
