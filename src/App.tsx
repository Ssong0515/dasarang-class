import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { MemoSection } from './components/MemoSection';
import { LessonDetail } from './components/LessonDetail';
import { ErrorBoundary } from './components/ErrorBoundary';
import { StudentPage } from './components/StudentPage';
import { LessonFolder, Memo, Lesson, Student, LessonCategory, LessonContent } from './types';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  setDoc,
  getDocs,
  deleteDoc,
  doc,
  orderBy,
  handleFirestoreError,
  OperationType
} from './firebase';

import { FolderDashboard } from './components/FolderDashboard';
import { ContentLibrary } from './components/ContentLibrary';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [folders, setFolders] = useState<LessonFolder[]>([]);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [contents, setContents] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'home' | 'memo' | 'lesson-detail' | 'folder-management' | 'content-library'>('home');
  const [viewMode, setViewMode] = useState<'admin' | 'student'>('student');
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [activeFolder, setActiveFolder] = useState<LessonFolder | null>(null);

  const ADMIN_EMAIL = 'songes0515@gmail.com';
  const isAdmin = user?.email === ADMIN_EMAIL;

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

  // Data Listeners
  useEffect(() => {
    if (!user) {
      setFolders([]);
      setMemos([]);
      setLessons([]);
      setCategories([]);
      setContents([]);
      return;
    }

    // Folders Listener
    const foldersQuery = query(
      collection(db, 'folders'),
      where('ownerUid', '==', user.uid)
    );
    const unsubscribeFolders = onSnapshot(foldersQuery, (snapshot) => {
      const foldersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        lessons: []
      })) as any[];
      setFolders(foldersData);
      
      // Update active folder if it's being managed
      if (activeFolder) {
        const updated = foldersData.find(f => f.id === activeFolder.id);
        if (updated) setActiveFolder(updated);
      }
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'folders'));

    // Folder Initialization and Cleanup (Run once)
    const initFolders = async () => {
      if (user.email !== ADMIN_EMAIL) return;

      const initialFolders = [
        '디지털 기초반',
        'AI·인터넷 실전 활용',
        'AI 크리에이티브 활용'
      ];

      try {
        const snapshot = await getDocs(foldersQuery);
        const existingFolders = snapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name
        }));

        // 1. Cleanup duplicates (same name)
        const seenNames = new Set<string>();
        for (const folder of existingFolders) {
          if (seenNames.has(folder.name)) {
            // Delete duplicate
            await deleteDoc(doc(db, 'folders', folder.id));
            console.log(`Deleted duplicate folder: ${folder.name}`);
          } else {
            seenNames.add(folder.name);
          }
        }

        // 2. Create missing folders
        const missingFolders = initialFolders.filter(
          name => !existingFolders.some(f => f.name === name)
        );

        for (const folderName of missingFolders) {
          await addDoc(collection(db, 'folders'), {
            name: folderName,
            ownerUid: user.uid,
            createdAt: new Date().toISOString(),
            students: []
          });
          console.log(`Created missing folder: ${folderName}`);
        }
      } catch (error) {
        console.error("Failed to initialize folders", error);
      }
    };

    initFolders();

    // Memos Listener
    const memosQuery = query(
      collection(db, 'memos'),
      where('ownerUid', '==', user.uid),
      orderBy('date', 'desc')
    );
    const unsubscribeMemos = onSnapshot(memosQuery, (snapshot) => {
      const memosData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Memo[];
      setMemos(memosData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'memos'));

    // Lessons Listener
    const lessonsQuery = query(
      collection(db, 'lessons'),
      where('ownerUid', '==', user.uid),
      orderBy('date', 'desc')
    );
    const unsubscribeLessons = onSnapshot(lessonsQuery, (snapshot) => {
      const lessonsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Lesson[];
      setLessons(lessonsData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'lessons'));

    // Categories Listener
    const categoriesQuery = query(
      collection(db, 'categories'),
      where('ownerUid', '==', user.uid)
    );
    const unsubscribeCategories = onSnapshot(categoriesQuery, (snapshot) => {
      setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'categories'));

    // Contents Listener
    const contentsQuery = query(
      collection(db, 'contents'),
      where('ownerUid', '==', user.uid)
    );
    const unsubscribeContents = onSnapshot(contentsQuery, (snapshot) => {
      setContents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'contents'));

    return () => {
      unsubscribeFolders();
      unsubscribeMemos();
      unsubscribeLessons();
      unsubscribeCategories();
      unsubscribeContents();
    };
  }, [user, activeFolder?.id]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = async () => {
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

  const handleSaveFolder = async (folderId: string, students: Student[]) => {
    if (!user) return;
    try {
      const folderRef = doc(db, 'folders', folderId);
      await setDoc(folderRef, { students }, { merge: true });
      setActiveTab('home');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `folders/${folderId}`);
    }
  };

  const handleSaveCategory = async (category: Partial<LessonCategory>) => {
    if (!user) return;
    try {
      if (category.id) {
        await setDoc(doc(db, 'categories', category.id), { ...category, ownerUid: user.uid }, { merge: true });
      } else {
        await addDoc(collection(db, 'categories'), { ...category, ownerUid: user.uid });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'categories');
    }
  };

  const handleSaveContent = async (content: Partial<LessonContent>) => {
    if (!user) return;
    try {
      if (content.id) {
        await setDoc(doc(db, 'contents', content.id), { ...content, ownerUid: user.uid }, { merge: true });
      } else {
        await addDoc(collection(db, 'contents'), { ...content, ownerUid: user.uid, createdAt: new Date().toISOString() });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'contents');
    }
  };

  const handleCreateLesson = (folderId?: string, date?: string) => {
    const targetFolder = folderId ? folders.find(f => f.id === folderId) : folders[0];
    if (targetFolder) {
      setActiveFolder(targetFolder);
      setSelectedLesson(null); // Ensure we start fresh
      setActiveTab('folder-management');
    }
  };

  const handleSaveLesson = async (updatedLesson: Lesson) => {
    if (!user) return;
    try {
      const lessonRef = doc(db, 'lessons', updatedLesson.id.startsWith('new-') ? doc(collection(db, 'lessons')).id : updatedLesson.id);
      const { id, ...lessonData } = updatedLesson;
      
      // Ensure folderName is correct if folderId changed
      const folder = folders.find(f => f.id === updatedLesson.folderId);
      if (folder) {
        lessonData.folderName = folder.name;
      }

      await setDoc(lessonRef, {
        ...lessonData,
        ownerUid: user.uid,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      
      if (activeTab === 'lesson-detail') {
        setActiveTab('home');
        setSelectedLesson(null);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `lessons/${updatedLesson.id}`);
    }
  };

  const handleSelectLesson = (lesson: Lesson) => {
    const targetFolder = folders.find(f => f.id === lesson.folderId);
    if (targetFolder) {
      setActiveFolder(targetFolder);
      setSelectedLesson(lesson);
      setActiveTab('folder-management');
    }
  };

  const handleManageFolder = (folder: LessonFolder) => {
    setActiveFolder(folder);
    setSelectedLesson(null);
    setActiveTab('folder-management');
  };

  if (!isAuthReady) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#FBFBFA]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#8B5E3C]"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <StudentPage 
        isAdmin={false} 
        onLogin={handleLogin}
      />
    );
  }

  if (viewMode === 'student') {
    return (
      <StudentPage 
        isAdmin={isAdmin} 
        onBackToAdmin={() => setViewMode('admin')} 
        onLogin={handleLogin}
        lessons={lessons}
        folders={folders}
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
    <ErrorBoundary>
      <div className="flex h-screen bg-[#FBFBFA] font-sans text-[#4A3728]">
        <Sidebar 
          folders={folders} 
          lessons={lessons}
          selectedLessonId={selectedLesson?.id}
          activeTab={activeTab} 
          onTabChange={setActiveTab} 
          onSelectLesson={handleSelectLesson}
          onManageFolder={handleManageFolder}
          onLogout={handleLogout}
          onSwitchToStudent={() => setViewMode('student')}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header user={user} />
          {activeTab === 'home' && (
            <Dashboard 
              folders={folders}
              onStartLesson={handleCreateLesson} 
              onSelectLesson={handleSelectLesson}
              onManageFolder={handleManageFolder}
              onGoToLibrary={() => setActiveTab('content-library')}
            />
          )}
          {activeTab === 'memo' && (
            <MemoSection 
              memos={memos} 
              onAddMemo={handleAddMemo} 
              onDeleteMemo={handleDeleteMemo} 
            />
          )}
          {activeTab === 'folder-management' && activeFolder && (
            <FolderDashboard 
              folder={activeFolder}
              folders={folders}
              lessons={lessons}
              categories={categories}
              contents={contents}
              initialLesson={selectedLesson}
              onSaveStudents={handleSaveFolder}
              onSelectLesson={handleSelectLesson}
              onCreateLesson={handleCreateLesson}
              onSaveLesson={handleSaveLesson}
              onGoToLibrary={() => setActiveTab('content-library')}
            />
          )}
          {activeTab === 'content-library' && (
            <ContentLibrary 
              categories={categories}
              contents={contents}
              onSaveCategory={handleSaveCategory}
              onSaveContent={handleSaveContent}
            />
          )}
          {activeTab === 'lesson-detail' && (
            <LessonDetail 
              lesson={selectedLesson!} 
              folders={folders}
              contents={contents}
              onSave={handleSaveLesson}
            />
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}
