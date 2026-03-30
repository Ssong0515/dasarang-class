import React, { useEffect, useMemo, useState } from 'react';
import type { DocumentData, QuerySnapshot } from 'firebase/firestore';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { MemoSection } from './components/MemoSection';
import { ErrorBoundary } from './components/ErrorBoundary';
import { StudentPage } from './components/StudentPage';
import {
  ClassroomDateRecord,
  Classroom,
  DailyReview,
  GeneratedMemoDraftOption,
  Memo,
  Student,
  LessonCategory,
  LessonContent,
} from './types';
import {
  auth,
  db,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
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
  deleteField,
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
import { normalizeAssignedContentIds } from './utils/classroomContentAssignments';
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

  // Migration State
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<string | null>(null);

  // Login Modal State
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  const ADMIN_EMAIL = 'songes0515@gmail.com';
  const isAdmin = user?.email === ADMIN_EMAIL;
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

  const handleRetryGoogleSheetsSync = async () => {
    if (!googleSheetsSyncError) return;
    await syncClassroomsWithGoogleSheets(googleSheetsSyncError.requests, { isRetry: true });
  };

  const handleMigrateEmbeddedStudents = async () => {
    if (!user || !isAdmin || isMigrating) return;

    if (!window.confirm('레거시 학생 데이터를 canonical students 컬렉션으로 마이그레이션합니다. 진행하시겠습니까?')) {
      return;
    }

    setIsMigrating(true);
    setMigrationResult(null);

    try {
      // 1. Read all classrooms with embedded students
      const classroomSnapshot = await getDocs(query(collection(db, CLASSROOMS_COLLECTION)));
      const classroomDocs = classroomSnapshot.docs.map((classroomDoc) => ({
        id: classroomDoc.id,
        data: classroomDoc.data() as Record<string, unknown>,
      }));

      // 2. Read all existing canonical students
      const studentSnapshot = await getDocs(query(collection(db, 'students')));
      const globalStudentsById = new Map<string, Student>();
      studentSnapshot.docs.forEach((studentDoc) => {
        const student = normalizeStudentRecord({
          id: studentDoc.id,
          ...(studentDoc.data() as Partial<Student>),
        });
        if (student.id) globalStudentsById.set(student.id, student);
      });

      // 3. Extract embedded students from classrooms
      const embeddedById = new Map<string, Student>();
      const classroomsWithEmbedded: string[] = [];

      for (const classroomDoc of classroomDocs) {
        const embeddedArray = classroomDoc.data.students;
        if (!Array.isArray(embeddedArray) || embeddedArray.length === 0) continue;

        classroomsWithEmbedded.push(classroomDoc.id);
        embeddedArray.forEach((entry: unknown, index: number) => {
          const partial = entry as Partial<Student>;
          const student = normalizeStudentRecord(partial, {
            classroomId: classroomDoc.id,
            ownerUid: (classroomDoc.data.ownerUid as string) ?? '',
            order: index,
            createdAt: classroomDoc.data.createdAt as string | undefined,
            updatedAt: classroomDoc.data.createdAt as string | undefined,
          });
          if (student.id && student.name) {
            embeddedById.set(student.id, student);
          }
        });
      }

      // 4. Merge: global as base, embedded fills gaps
      const allIds = new Set([...globalStudentsById.keys(), ...embeddedById.keys()]);
      const canonicalStudents: Student[] = [];

      for (const id of allIds) {
        const global = globalStudentsById.get(id);
        const embedded = embeddedById.get(id);

        if (global && !embedded) {
          canonicalStudents.push(global);
          continue;
        }

        if (embedded && !global) {
          canonicalStudents.push(embedded);
          continue;
        }

        if (global && embedded) {
          const merged = { ...global };
          if (!merged.classroomId && embedded.classroomId) merged.classroomId = embedded.classroomId;
          if (embedded.order !== 0 || merged.order === 0) merged.order = embedded.order;
          if (embedded.inactiveAt && !merged.inactiveAt) merged.inactiveAt = embedded.inactiveAt;

          const globalUpdated = new Date(global.updatedAt).getTime();
          const embeddedUpdated = new Date(embedded.updatedAt).getTime();
          if (Number.isFinite(embeddedUpdated) && embeddedUpdated > globalUpdated) {
            merged.updatedAt = embedded.updatedAt;
          }
          const globalCreated = new Date(global.createdAt).getTime();
          const embeddedCreated = new Date(embedded.createdAt).getTime();
          if (Number.isFinite(embeddedCreated) && embeddedCreated < globalCreated) {
            merged.createdAt = embedded.createdAt;
          }
          canonicalStudents.push(merged);
        }
      }

      // 5. Detect duplicates by (classroomId, name)
      const byKey = new Map<string, Student[]>();
      for (const s of canonicalStudents) {
        if (s.deletedAt) continue;
        const key = `${s.classroomId}::${s.name}`;
        const group = byKey.get(key);
        if (group) group.push(s);
        else byKey.set(key, [s]);
      }

      const staleIds: string[] = [];
      for (const [, group] of byKey) {
        if (group.length <= 1) continue;
        group.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        group.slice(1).forEach((s) => staleIds.push(s.id));
      }

      // 6. Write canonical students
      const timestamp = new Date().toISOString();
      let upsertCount = 0;

      for (let i = 0; i < canonicalStudents.length; i += 400) {
        const batch = writeBatch(db);
        canonicalStudents.slice(i, i + 400).forEach((student) => {
          batch.set(doc(db, 'students', student.id), sanitizeStudentForStorage(student));
          upsertCount++;
        });
        await batch.commit();
      }

      // 7. Soft-delete stale duplicates
      for (let i = 0; i < staleIds.length; i += 400) {
        const batch = writeBatch(db);
        staleIds.slice(i, i + 400).forEach((id) => {
          batch.set(doc(db, 'students', id), { deletedAt: timestamp, updatedAt: timestamp }, { merge: true });
        });
        await batch.commit();
      }

      // 8. Remove embedded students field from classroom documents
      for (const classroomId of classroomsWithEmbedded) {
        await updateDoc(doc(db, CLASSROOMS_COLLECTION, classroomId), {
          students: deleteField(),
        });
      }

      const resultMessage = [
        `마이그레이션 완료:`,
        `  canonical students upsert: ${upsertCount}건`,
        staleIds.length > 0 ? `  중복 soft-delete: ${staleIds.length}건` : null,
        classroomsWithEmbedded.length > 0
          ? `  classroom embedded students 제거: ${classroomsWithEmbedded.length}개 클래스`
          : `  embedded students 없음 (이미 정리됨)`,
      ].filter(Boolean).join('\n');

      console.log(resultMessage);
      setMigrationResult(resultMessage);
    } catch (error) {
      const message = error instanceof Error ? error.message : '마이그레이션 실패';
      console.error('Migration error:', error);
      setMigrationResult(`오류: ${message}`);
    } finally {
      setIsMigrating(false);
    }
  };

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setIsAuthReady(true);
      if (user?.email === ADMIN_EMAIL) {
        setViewMode('admin');
      } else {
        setViewMode('student');
      }
    });
    return () => unsubscribe();
  }, []);

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
          assignedContentIds: Array.isArray(data.assignedContentIds)
            ? normalizeAssignedContentIds(data.assignedContentIds)
            : [],
          isOpen: data.isOpen,
          order: hasNumericOrder(data.order) ? data.order : undefined,
          icon: typeof data.icon === 'string' ? data.icon : undefined,
          color: typeof data.color === 'string' ? data.color : undefined,
          createdAt: typeof data.createdAt === 'string' ? data.createdAt : undefined,
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
          createdAt: data.createdAt ?? new Date(0).toISOString(),
          order: hasNumericOrder(data.order) ? data.order : undefined,
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

  const handleLogin = () => {
    setShowLoginModal(true);
    setAdminPassword('');
    setLoginError('');
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');
    
    // Firebase Auth requires at least 6 characters. If user typed '0221', pad it.
    const finalPassword = adminPassword.length < 6 ? adminPassword.padEnd(6, '0') : adminPassword;

    try {
      await signInWithEmailAndPassword(auth, ADMIN_EMAIL, finalPassword);
      setShowLoginModal(false);
    } catch (error: any) {
      if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
        // If the user doesn't exist as email/password, try creating it
        try {
          await createUserWithEmailAndPassword(auth, ADMIN_EMAIL, finalPassword);
          setShowLoginModal(false);
        } catch (createError: any) {
          console.error("Creation failed", createError);
          setLoginError('계정 연동에 실패했습니다. 구글 로그인이 이미 등록되어 있을 수 있습니다.');
        }
      } else if (error.code === 'auth/wrong-password') {
        setLoginError('비밀번호가 일치하지 않습니다.');
      } else {
        console.error("Login failed", error);
        setLoginError('로그인에 실패했습니다. 다시 시도해주세요.');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    if (!confirmContentLibraryNavigation()) {
      return;
    }

    try {
      await signOut(auth);
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

  const handleSaveClassroomContents = async (classroomId: string, contentIds: string[]) => {
    if (!user) return;

    try {
      const nextData = { assignedContentIds: normalizeAssignedContentIds(contentIds) };
      await setDoc(doc(db, CLASSROOMS_COLLECTION, classroomId), nextData, { merge: true });
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `${CLASSROOMS_COLLECTION}/${classroomId}/assignedContentIds`
      );
      throw error;
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
        assignedContentIds: [],
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
      createdAt,
      order,
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
    if (!isAuthReady) {
      return (
        <div className="h-screen flex items-center justify-center bg-[#FBFBFA]">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#8B5E3C]"></div>
        </div>
      );
    }

    if (!user || !isAdmin) {
      return (
        <StudentPage 
          isAdmin={isAdmin} 
          onBackToAdmin={user ? () => setViewMode('admin') : undefined} 
          onLogin={handleLogin}
          classrooms={classroomsWithStudents}
          categories={categories}
          contents={contents}
        />
      );
    }

    if (!isAdmin) {
      return (
        <div className="h-screen flex flex-col items-center justify-center bg-[#FBFBFA] p-8 text-center">
          <div className="max-w-md bg-white p-12 rounded-[40px] border border-[#E5E3DD] shadow-xl shadow-[#8B5E3C]/5">
            <h1 className="text-4xl font-serif font-bold text-[#4A3728] mb-6">접근 제한</h1>
            <p className="text-[#8B7E74] mb-10 leading-relaxed">
              죄송합니다. 이 페이지는 관리자 전용입니다.<br/>학생 페이지를 이용해주세요.
            </p>
            <button 
              onClick={() => setViewMode('student')}
              className="w-full py-4 bg-[#8B5E3C] text-white rounded-2xl font-bold shadow-lg shadow-[#8B5E3C]/20 hover:bg-[#724D31] transition-all"
            >
              학생 페이지로 가기
            </button>
            <button 
              onClick={handleLogout}
              className="mt-4 text-sm text-[#8B7E74] hover:text-[#4A3728] font-medium"
            >
              로그아웃
            </button>
          </div>
        </div>
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
              <Header user={user} />
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
          {activeTab === 'home' && isAdmin && (
            <div className="mx-6 mt-4">
              <button
                onClick={() => void handleMigrateEmbeddedStudents()}
                disabled={isMigrating}
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isMigrating ? '마이그레이션 중...' : '레거시 학생 데이터 마이그레이션'}
              </button>
              {migrationResult && (
                <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900">
                  {migrationResult}
                </pre>
              )}
            </div>
          )}
          {activeTab === 'home' && (
            <Dashboard
              classrooms={classroomsWithStudents}
              onManageClassroom={handleManageClassroom}
              onGoToLibrary={() => handleTabChange('content-library')}
              onGoToMemo={() => handleTabChange('memo')}
              onSwitchToStudent={handleSwitchToStudent}
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
              onSaveStudents={handleSaveStudents}
              onMoveStudent={handleMoveStudent}
              onSaveDateRecord={handleSaveClassroomDateRecord}
              onDeleteDateRecord={handleDeleteClassroomDateRecord}
              onSaveClassroomContents={handleSaveClassroomContents}
              onGenerateMemoDraft={handleGenerateMemoDraft}
              onGoToLibrary={() => handleTabChange('content-library')}
              onUpdateClassroom={handleUpdateClassroom}
              onDeleteClassroom={handleDeleteClassroom}
            />
          )}
          {activeTab === 'content-library' && (
            <ContentLibrary 
              categories={categories}
              contents={contents}
              onSaveCategory={handleSaveCategory}
              onSaveContent={handleSaveContent}
              onReorderCategories={handleReorderCategories}
              onReorderContents={handleReorderContents}
              onDeleteCategory={handleDeleteCategory}
              onDeleteContent={handleDeleteContent}
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

      {/* Login Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-[#A89F94]/50 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white rounded-[32px] w-full max-w-sm overflow-hidden shadow-2xl relative">
            <button 
              onClick={() => setShowLoginModal(false)}
              className="absolute top-6 right-6 text-[#A89F94] hover:text-[#4A3728] transition-colors"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
            <div className="p-8">
              <div className="w-12 h-12 bg-[#FFF5E9] rounded-2xl flex items-center justify-center mb-6">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8B5E3C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
              <h2 className="text-2xl font-bold text-[#4A3728] mb-2">관리자 로그인</h2>
              <p className="text-[#8B7E74] text-sm mb-6">비밀번호를 입력하여 권한을 확인하세요.</p>
              
              <form onSubmit={handlePasswordSubmit}>
                <div className="mb-6">
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="비밀번호 입력"
                    required
                    className="w-full bg-[#F3F2EE] border-none rounded-xl p-4 text-[#4A3728] placeholder:text-[#A89F94] focus:ring-2 focus:ring-[#8B5E3C] outline-none transition-all"
                  />
                  {loginError && <p className="text-sm text-red-500 mt-2 font-bold">{loginError}</p>}
                </div>
                <button
                  type="submit"
                  disabled={isLoggingIn || !adminPassword.trim()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-4 bg-[#8B5E3C] text-white rounded-xl font-bold shadow-lg shadow-[#8B5E3C]/20 hover:bg-[#724D31] transition-all disabled:opacity-50 disabled:shadow-none"
                >
                  {isLoggingIn ? (
                    <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></span>
                  ) : (
                    '로그인'
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </ErrorBoundary>
  );
}
