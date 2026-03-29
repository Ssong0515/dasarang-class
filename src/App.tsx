import React, { useEffect, useMemo, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { MemoSection } from './components/MemoSection';
import { ErrorBoundary } from './components/ErrorBoundary';
import { StudentPage } from './components/StudentPage';
import {
  FolderDateRecord,
  LessonFolder,
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
  query,
  where,
  onSnapshot,
  addDoc,
  setDoc,
  deleteDoc,
  doc,
  writeBatch,
  orderBy,
  handleFirestoreError,
  OperationType
} from './firebase';

import { FolderDashboard } from './components/FolderDashboard';
import { ContentLibrary, CONTENT_EDIT_DISCARD_WARNING } from './components/ContentLibrary';
import { resolveAppPath } from './utils/appPaths';
import {
  normalizeAttendanceRecords,
  sanitizeAttendanceRecordsForStorage,
} from './utils/attendance';
import { normalizeAssignedContentIds } from './utils/folderContentAssignments';
import { normalizeFolderDateRecordContentIds } from './utils/folderDateRecordContent';
import {
  getVisibleStudents,
  isStudentDeleted,
  normalizeLegacyStudents,
  normalizeStudentRecord,
  sanitizeStudentForStorage,
  sortStudents,
} from './utils/students';

type GoogleSheetsSyncRequest = {
  folderId: string;
  mode?: 'upsert' | 'delete';
  previousName?: string;
  folderName?: string;
};

type GoogleSheetsSyncErrorState = {
  message: string;
  requests: GoogleSheetsSyncRequest[];
};

type ContentReorderUpdate = {
  id: string;
  categoryId: string | null;
  order: number;
};

type AdminTab = 'home' | 'memo' | 'folder-management' | 'content-library';

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

const mergeStudentsWithLegacy = (students: Student[], legacyStudents: Student[]) => {
  const mergedStudentsById = new Map<string, Student>();

  legacyStudents.forEach((student) => {
    if (student.id) {
      mergedStudentsById.set(student.id, student);
    }
  });

  students.forEach((student) => {
    if (student.id) {
      mergedStudentsById.set(student.id, student);
    }
  });

  return sortStudents([...mergedStudentsById.values()]);
};

const getStudentsByFolderId = (students: Student[]) => {
  const studentsByFolderId = new Map<string, Student[]>();

  for (const student of sortStudents(getVisibleStudents(students))) {
    const folderStudents = studentsByFolderId.get(student.folderId);
    if (folderStudents) {
      folderStudents.push(student);
    } else {
      studentsByFolderId.set(student.folderId, [student]);
    }
  }

  return studentsByFolderId;
};

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [folders, setFolders] = useState<LessonFolder[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [folderDateRecords, setFolderDateRecords] = useState<FolderDateRecord[]>([]);
  const [categories, setCategories] = useState<LessonCategory[]>([]);
  const [contents, setContents] = useState<LessonContent[]>([]);
  const [activeTab, setActiveTab] = useState<AdminTab>('home');
  const [viewMode, setViewMode] = useState<'admin' | 'student'>('student');
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [isContentLibraryDirty, setIsContentLibraryDirty] = useState(false);
  const [googleSheetsSyncError, setGoogleSheetsSyncError] = useState<GoogleSheetsSyncErrorState | null>(null);
  const [isRetryingGoogleSheetsSync, setIsRetryingGoogleSheetsSync] = useState(false);

  // Login Modal State
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  const ADMIN_EMAIL = 'songes0515@gmail.com';
  const isAdmin = user?.email === ADMIN_EMAIL;
  const legacyStudents = useMemo(
    () =>
      sortStudents(
        folders.flatMap((folder) =>
          normalizeLegacyStudents(folder.students, {
            folderId: folder.id,
            ownerUid: folder.ownerUid,
            createdAt: folder.createdAt,
            updatedAt: folder.createdAt,
          })
        )
      ),
    [folders]
  );
  const mergedStudents = useMemo(
    () => mergeStudentsWithLegacy(students, legacyStudents),
    [students, legacyStudents]
  );
  const studentsById = useMemo(
    () => new Map(mergedStudents.map((student) => [student.id, student])),
    [mergedStudents]
  );
  const studentsByFolderId = useMemo(
    () => getStudentsByFolderId(mergedStudents),
    [mergedStudents]
  );
  const foldersWithStudents = useMemo(
    () =>
      folders.map((folder) => ({
        ...folder,
        students: studentsByFolderId.get(folder.id) || [],
      })),
    [folders, studentsByFolderId]
  );
  const activeFolder = useMemo(
    () => foldersWithStudents.find((folder) => folder.id === activeFolderId) || null,
    [foldersWithStudents, activeFolderId]
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

  const postGoogleSheetsRequest = async (path: string, payload: unknown) => {
    if (!user) {
      throw new Error('Google Sheets 동기화를 위한 로그인 정보를 확인할 수 없습니다.');
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

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null);
      throw new Error(errorPayload?.error || 'Google Sheets 동기화에 실패했습니다.');
    }
  };

  const syncFoldersWithGoogleSheets = async (
    requests: GoogleSheetsSyncRequest[],
    options?: { isRetry?: boolean }
  ) => {
    if (!user || requests.length === 0) return;

    if (options?.isRetry) {
      setIsRetryingGoogleSheetsSync(true);
    }

    try {
      await Promise.all(
        requests.map((request) => postGoogleSheetsRequest('api/google-sheets/sync-folder', request))
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
    void syncFoldersWithGoogleSheets(requests);
  };

  const handleRetryGoogleSheetsSync = async () => {
    if (!googleSheetsSyncError) return;
    await syncFoldersWithGoogleSheets(googleSheetsSyncError.requests, { isRetry: true });
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
    // Folders Listener
    const foldersQuery = query(collection(db, 'folders'));
    const unsubscribeFolders = onSnapshot(foldersQuery, (snapshot) => {
      const foldersData = snapshot.docs.map((folderDoc) => {
        const data = folderDoc.data() as Partial<LessonFolder> & { students?: unknown };
        return {
          id: folderDoc.id,
          name: data.name ?? '',
          ownerUid: data.ownerUid ?? '',
          students: normalizeLegacyStudents(data.students, {
            folderId: folderDoc.id,
            ownerUid: data.ownerUid ?? '',
            createdAt: data.createdAt,
            updatedAt: data.createdAt,
          }),
          assignedContentIds: Array.isArray(data.assignedContentIds)
            ? normalizeAssignedContentIds(data.assignedContentIds)
            : [],
          isOpen: data.isOpen,
          order: hasNumericOrder(data.order) ? data.order : undefined,
          icon: typeof data.icon === 'string' ? data.icon : undefined,
          color: typeof data.color === 'string' ? data.color : undefined,
          createdAt: typeof data.createdAt === 'string' ? data.createdAt : undefined,
        };
      }) as LessonFolder[];
      foldersData.sort((a, b) => (a.order || 0) - (b.order || 0));
      setFolders(foldersData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'folders'));

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

    let unsubscribeFolderDateRecords = () => {};
    if (user) {
      const folderDateRecordsQuery = query(
        collection(db, 'folderDateRecords'),
        orderBy('date', 'desc')
      );
      unsubscribeFolderDateRecords = onSnapshot(
        folderDateRecordsQuery,
        (snapshot) => {
          const nextFolderDateRecords = snapshot.docs.map((recordDoc) => {
            const data = recordDoc.data() as Partial<FolderDateRecord>;
            return {
              id: recordDoc.id,
              folderId: data.folderId ?? '',
              folderName: data.folderName ?? '',
              ownerUid: data.ownerUid ?? '',
              date: data.date ?? '',
              contentIds: normalizeFolderDateRecordContentIds(data),
              attendance: normalizeAttendanceRecords(data.attendance),
              memo: data.memo ?? '',
              createdAt: data.createdAt ?? '',
              updatedAt: data.updatedAt ?? '',
            } satisfies FolderDateRecord;
          });

          setFolderDateRecords(nextFolderDateRecords);
        },
        (error) => handleFirestoreError(error, OperationType.LIST, 'folderDateRecords')
      );
    } else {
      setFolderDateRecords([]);
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
      unsubscribeFolders();
      unsubscribeStudents();
      unsubscribeMemos();
      unsubscribeFolderDateRecords();
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

  const handleSaveStudents = async (folderId: string, students: Student[]): Promise<void> => {
    if (!user) return;
    try {
      const previousStudents = studentsByFolderId.get(folderId) || [];
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
            folderId,
            order: index,
            createdAt: student.createdAt || previousWithoutDeletedAt?.createdAt || timestamp,
            updatedAt: timestamp,
          })
        );

        batch.set(doc(db, 'students', nextStudent.id), nextStudent, { merge: true });
      });

      previousStudents
        .filter((student) => !nextStudentIds.has(student.id))
        .forEach((student) => {
          const deletedStudent = sanitizeStudentForStorage(
            normalizeStudentRecord({
              ...student,
              ownerUid: student.ownerUid || user.uid,
              folderId: student.folderId || folderId,
              createdAt: student.createdAt || timestamp,
              updatedAt: timestamp,
              deletedAt: timestamp,
            })
          );

          batch.set(doc(db, 'students', student.id), deletedStudent, { merge: true });
        });

      if (students.length > 0 || previousStudents.length > 0) {
        await batch.commit();
      }

      triggerGoogleSheetsSync([{ folderId, mode: 'upsert' }]);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `students/${folderId}`);
    }
  };

  const handleMoveStudent = async (sourceFolderId: string, targetFolderId: string, studentId: string): Promise<void> => {
    if (!user) return;

    if (!targetFolderId) {
      throw new Error('이동할 반을 선택해 주세요.');
    }

    if (sourceFolderId === targetFolderId) {
      throw new Error('같은 반으로는 이동할 수 없습니다.');
    }

    const sourceFolder = folders.find(folder => folder.id === sourceFolderId);
    const targetFolder = folders.find(folder => folder.id === targetFolderId);

    if (!sourceFolder || !targetFolder) {
      throw new Error('이동할 반 정보를 찾을 수 없습니다.');
    }

    const studentToMove = studentsById.get(studentId);
    const targetStudents = studentsByFolderId.get(targetFolderId) || [];

    if (!studentToMove || isStudentDeleted(studentToMove)) {
      throw new Error('이동할 학생 정보를 찾을 수 없습니다.');
    }

    try {
      const { deletedAt: _deletedAt, ...studentWithoutDeletedAt } = studentToMove;
      const movedStudent = sanitizeStudentForStorage(
        normalizeStudentRecord({
          ...studentWithoutDeletedAt,
          ownerUid: studentToMove.ownerUid || user.uid,
          folderId: targetFolderId,
          order: targetStudents.length,
          createdAt: studentToMove.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      );
      await setDoc(doc(db, 'students', studentId), movedStudent, { merge: true });
      triggerGoogleSheetsSync([
        { folderId: sourceFolderId, mode: 'upsert' },
        { folderId: targetFolderId, mode: 'upsert' },
      ]);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `students/${studentId}`);
    }
  };

  const handleUpdateFolder = async (folderId: string, data: Partial<LessonFolder>) => {
    if (!user) return;
    try {
      const previousFolder = folders.find(folder => folder.id === folderId);
      const folderRef = doc(db, 'folders', folderId);
      await setDoc(folderRef, data, { merge: true });
      triggerGoogleSheetsSync([{
        folderId,
        mode: 'upsert',
        previousName: previousFolder?.name,
      }]);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `folders/${folderId}`);
    }
  };

  const handleSaveFolderContents = async (folderId: string, contentIds: string[]) => {
    if (!user) return;

    try {
      await setDoc(
        doc(db, 'folders', folderId),
        { assignedContentIds: normalizeAssignedContentIds(contentIds) },
        { merge: true }
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `folders/${folderId}/assignedContentIds`);
      throw error;
    }
  };

  const handleCreateFolder = async () => {
    if (!user) return;
    try {
      const newOrder = folders.length;
      const folderRef = await addDoc(collection(db, 'folders'), {
        name: '새로운 클래스',
        ownerUid: user.uid,
        assignedContentIds: [],
        order: newOrder,
        createdAt: new Date().toISOString()
      });
      triggerGoogleSheetsSync([{ folderId: folderRef.id, mode: 'upsert' }]);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'folders');
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (!user) return;
    try {
      const folderToDelete = folders.find(folder => folder.id === folderId);
      const recordsToDelete = folderDateRecords.filter((record) => record.folderId === folderId);
      const studentsToDelete = mergedStudents.filter((student) => student.folderId === folderId);
      for (const record of recordsToDelete) {
        await deleteDoc(doc(db, 'folderDateRecords', record.id));
      }
      for (const student of studentsToDelete) {
        await deleteDoc(doc(db, 'students', student.id));
      }
      await deleteDoc(doc(db, 'folders', folderId));
      setActiveFolderId(null);
      setActiveTab('home');
      triggerGoogleSheetsSync([{
        folderId,
        mode: 'delete',
        folderName: folderToDelete?.name,
      }]);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'folders/' + folderId);
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

  const handleSaveFolderDateRecord = async (record: FolderDateRecord) => {
    if (!user) return;

    try {
      const folder = folders.find((candidate) => candidate.id === record.folderId);
      const recordId = record.id || `${record.folderId}_${record.date}`;
      const existingRecord = folderDateRecords.find((candidate) => candidate.id === recordId);

      await setDoc(
        doc(db, 'folderDateRecords', recordId),
        {
          folderId: record.folderId,
          folderName: folder?.name || record.folderName,
          date: record.date,
          contentIds: normalizeFolderDateRecordContentIds(record),
          attendance: sanitizeAttendanceRecordsForStorage(record.attendance),
          memo: record.memo ?? '',
          ownerUid: user.uid,
          createdAt: existingRecord?.createdAt || record.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `folderDateRecords/${record.id}`);
    }
  };

  const handleDeleteFolderDateRecord = async (recordId: string) => {
    if (!user) return;

    try {
      await deleteDoc(doc(db, 'folderDateRecords', recordId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `folderDateRecords/${recordId}`);
    }
  };

  const handleManageFolder = (folder: LessonFolder) => {
    runWithContentLibraryNavigationGuard(() => {
      setViewMode('admin');
      setActiveFolderId(folder.id);
      setActiveTab('folder-management');
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
          folders={foldersWithStudents}
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
          folders={foldersWithStudents} 
          activeFolderId={activeFolderId || undefined}
          activeTab={activeTab} 
          isStudentView={viewMode === 'student'}
          onTabChange={handleTabChange} 
          onManageFolder={handleManageFolder}
          onLogout={handleLogout}
          onSwitchToStudent={handleSwitchToStudent}
          onCreateFolder={handleCreateFolder}
          onReorderFolders={async (newOrder) => {
            try {
              await Promise.all(newOrder.map((folder, index) => 
                setDoc(doc(db, 'folders', folder.id), { order: index }, { merge: true })
              ));
            } catch (error) {
              console.error("Failed to reorder folders", error);
            }
          }}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          {viewMode === 'student' ? (
            <StudentPage
              embeddedInAdminShell
              isAdmin={isAdmin}
              onBackToAdmin={() => setViewMode('admin')}
              folders={foldersWithStudents}
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
          {activeTab === 'home' && (
            <Dashboard 
              folders={foldersWithStudents}
              onManageFolder={handleManageFolder}
              onGoToLibrary={() => handleTabChange('content-library')}
              onGoToMemo={() => handleTabChange('memo')}
              onSwitchToStudent={handleSwitchToStudent}
            />
          )}
          {activeTab === 'memo' && (
            <MemoSection 
              memos={memos}
              folders={foldersWithStudents}
              dateRecords={folderDateRecords}
              onAddMemo={handleAddMemo} 
              onDeleteMemo={handleDeleteMemo} 
            />
          )}
          {activeTab === 'folder-management' && activeFolder && (
            <FolderDashboard 
              key={activeFolder.id}
              folder={activeFolder}
              folders={foldersWithStudents}
              studentsById={studentsById}
              dateRecords={folderDateRecords}
              categories={categories}
              contents={contents}
              onSaveStudents={handleSaveStudents}
              onMoveStudent={handleMoveStudent}
              onSaveDateRecord={handleSaveFolderDateRecord}
              onDeleteDateRecord={handleDeleteFolderDateRecord}
              onSaveFolderContents={handleSaveFolderContents}
              onGoToLibrary={() => handleTabChange('content-library')}
              onUpdateFolder={handleUpdateFolder}
              onDeleteFolder={handleDeleteFolder}
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
