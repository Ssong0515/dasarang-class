import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  Plus, 
  Trash2, 
  Save, 
  UserPlus, 
  Calendar, 
  FileText, 
  ClipboardList, 
  MessageSquare,
  ChevronRight,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Edit3,
  Library,
  ChevronLeft,
  Search,
  X,
  Settings,
  Palette,
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
  Lightbulb
} from 'lucide-react';
import { LessonFolder, Student, Lesson, LessonCategory, LessonContent, AttendanceRecord } from '../types';

interface FolderDashboardProps {
  folder: LessonFolder;
  folders: LessonFolder[];
  lessons: Lesson[];
  categories: LessonCategory[];
  contents: LessonContent[];
  initialLesson?: Lesson | null;
  onSaveStudents: (folderId: string, students: Student[]) => void;
  onSelectLesson: (lesson: Lesson) => void;
  onCreateLesson: (folderId: string, date?: string) => void;
  onSaveLesson: (lesson: Lesson) => void;
  onGoToLibrary: () => void;
  onUpdateFolder?: (folderId: string, data: Partial<LessonFolder>) => void;
  onDeleteFolder?: (folderId: string) => void;
}

type Tab = 'dashboard' | 'students' | 'settings';

const FOLDER_COLORS = [
  { name: '브라운', value: '#8B5E3C', bg: '#FFF5E9' },
  { name: '파랑', value: '#3B82F6', bg: '#EFF6FF' },
  { name: '초록', value: '#22C55E', bg: '#F0FDF4' },
  { name: '보라', value: '#8B5CF6', bg: '#F5F3FF' },
  { name: '분홍', value: '#EC4899', bg: '#FDF2F8' },
  { name: '주황', value: '#F97316', bg: '#FFF7ED' },
  { name: '쫑빛', value: '#14B8A6', bg: '#F0FDFA' },
  { name: '레드', value: '#EF4444', bg: '#FEF2F2' },
];

const FOLDER_ICONS = [
  { name: '책', icon: 'BookOpen' },
  { name: '학모', icon: 'GraduationCap' },
  { name: '코드', icon: 'Code' },
  { name: '음악', icon: 'Music' },
  { name: '미술', icon: 'Brush' },
  { name: '지구', icon: 'Globe' },
  { name: 'CPU', icon: 'Cpu' },
  { name: '하트', icon: 'Heart' },
  { name: '번개', icon: 'Zap' },
  { name: '로켓', icon: 'Rocket' },
  { name: '별', icon: 'Star' },
  { name: '전구', icon: 'Lightbulb' },
];

const iconMap: Record<string, React.FC<{ size?: number; className?: string }>> = {
  BookOpen, GraduationCap, Code, Music, Brush, Globe, Cpu, Heart, Zap, Rocket, Star, Lightbulb
};

export const FolderDashboard: React.FC<FolderDashboardProps> = ({ 
  folder, 
  folders,
  lessons, 
  categories,
  contents,
  initialLesson,
  onSaveStudents,
  onSelectLesson,
  onCreateLesson,
  onSaveLesson,
  onGoToLibrary,
  onUpdateFolder,
  onDeleteFolder
}) => {
  const getLocalDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [selectedCategory, setSelectedCategory] = useState<string>(categories[0]?.id || '');
  const [selectedDate, setSelectedDate] = useState(initialLesson?.date || getLocalDateString(new Date()));
  const [students, setStudents] = useState<Student[]>(folder.students || []);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentAge, setNewStudentAge] = useState('');
  const [newStudentContact, setNewStudentContact] = useState('');
  const [newStudentMemo, setNewStudentMemo] = useState('');
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [settingsDraft, setSettingsDraft] = useState({
    name: folder.name,
    color: folder.color || '#8B5E3C',
    icon: folder.icon || 'BookOpen'
  });

  // Sync draft when folder changes
  useEffect(() => {
    setSettingsDraft({
      name: folder.name,
      color: folder.color || '#8B5E3C',
      icon: folder.icon || 'BookOpen'
    });
  }, [folder]);

  // Sync with initialLesson date if it changes
  useEffect(() => {
    if (initialLesson) {
      setSelectedDate(initialLesson.date);
    }
  }, [initialLesson]);

  const folderLessons = lessons.filter(l => l.folderId === folder.id);
  const currentLesson = folderLessons.find(l => l.date === selectedDate);

  const handleQuickCreate = (contentId: string) => {
    if (!contentId) return;
    const content = contents.find(c => c.id === contentId);
    if (!content) return;
    
    const newLesson: Lesson = {
      id: 'new-' + Date.now(),
      folderId: folder.id,
      folderName: folder.name,
      ownerUid: '', // Will be set on save
      date: selectedDate,
      title: content.title,
      content: content.html,
      order: (folderLessons.length + 1),
      attendance: (folder.students || []).map(s => ({
        studentId: s.id,
        studentName: s.name,
        initials: s.initials,
        status: 'Present'
      })),
      resources: [],
      memo: '',
      contentId: content.id,
      summary: {
        text: '수업 요약이 쓰여지지 않았습니다.',
        attendanceRate: '0%',
        engagement: 'N/A',
        resourceCount: '0'
      }
    };
    onSaveLesson(newLesson);
  };

  const [localMemo, setLocalMemo] = useState('');
  useEffect(() => {
    setLocalMemo(currentLesson?.memo || '');
  }, [currentLesson?.id, currentLesson?.date, selectedDate]);

  const getOrCreateLesson = (): Lesson => {
    if (currentLesson) return currentLesson;
    return {
      id: '', // Let App.tsx generate a new ID
      folderId: folder.id,
      folderName: folder.name,
      ownerUid: '',
      date: selectedDate,
      title: '새로운 수업',
      content: '',
      contentId: '',
      contentIds: [],
      order: folderLessons.length + 1,
      attendance: (folder.students || []).map(s => ({
        studentId: s.id,
        studentName: s.name,
        initials: s.initials,
        status: 'Present'
      })),
      resources: [],
      memo: '',
      summary: { text: '', attendanceRate: '0%', engagement: 'N/A', resourceCount: '0' }
    };
  };

  const updateAttendance = (studentId: string, status: 'Present' | 'Absent' | 'Late') => {
    const lesson = getOrCreateLesson();
    const newAttendance = (lesson.attendance || []).map(a => 
      a.studentId === studentId ? { ...a, status } : a
    );
    onSaveLesson({ ...lesson, attendance: newAttendance });
  };
  
  const handleSaveMemo = () => {
    if (!currentLesson && !localMemo.trim()) return;
    const lesson = getOrCreateLesson();
    if (lesson.memo === localMemo && currentLesson) return;
    onSaveLesson({ ...lesson, memo: localMemo });
  };
  
  const handleToggleContent = (content: LessonContent) => {
    const lesson = getOrCreateLesson();
    const currentIds = lesson.contentIds || (lesson.contentId ? [lesson.contentId] : []);
    
    let newIds;
    if (currentIds.includes(content.id)) {
      newIds = currentIds.filter(id => id !== content.id); // Remove
    } else {
      newIds = [...currentIds, content.id]; // Add
    }

    const selectedList = newIds.map(id => contents.find(c => c.id === id)).filter(Boolean) as LessonContent[];
    const newTitle = selectedList.length > 0 ? selectedList.map(c => c.title).join(', ') : '새로운 수업';
    const newHtml = selectedList.map(c => c.html).join('\n<hr style="margin: 40px 0; border-color: #E5E3DD;" />\n');

    onSaveLesson({
      ...lesson,
      title: newTitle,
      content: newHtml,
      contentId: newIds[0] || '', // keep first ID for backward compatibility
      contentIds: newIds
    });
  };

  const handleAddStudent = () => {
    if (!newStudentName.trim()) return;
    const initials = newStudentName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const newStudent: Student = {
      id: 'std-' + Date.now(),
      name: newStudentName.trim(),
      initials: initials || '??',
      age: newStudentAge.trim() || undefined,
      contact: newStudentContact.trim() || undefined,
      memo: newStudentMemo.trim() || undefined,
    };
    const updated = [...students, newStudent];
    setStudents(updated);
    setNewStudentName('');
    setNewStudentAge('');
    setNewStudentContact('');
    setNewStudentMemo('');
    onSaveStudents(folder.id, updated);
  };

  const handleRemoveStudent = (id: string) => {
    const updated = students.filter(s => s.id !== id);
    setStudents(updated);
    onSaveStudents(folder.id, updated);
    if (expandedStudent === id) setExpandedStudent(null);
  };

  const handleSaveStudentEdit = (student: Student) => {
    const updated = students.map(s => s.id === student.id ? student : s);
    setStudents(updated);
    setEditingStudent(null);
    onSaveStudents(folder.id, updated);
  };

  const getAttendanceStats = (lesson?: Lesson) => {
    if (!lesson || !lesson.attendance) return { present: 0, absent: 0, late: 0, total: 0 };
    const total = lesson.attendance.length;
    const present = lesson.attendance.filter(a => a.status === 'Present').length;
    const absent = lesson.attendance.filter(a => a.status === 'Absent').length;
    const late = lesson.attendance.filter(a => a.status === 'Late').length;
    return { present, absent, late, total };
  };

  const [viewMonth, setViewMonth] = useState(new Date());

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  };

  const calendarDays = getDaysInMonth(viewMonth);
  const weekDays = ['일', '월', '화', '수', '목', '금', '토'];

  return (
    <main className="flex-1 overflow-y-auto bg-[#FBFBFA] p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="px-3 py-1 bg-[#FFF5E9] text-[#8B5E3C] text-[10px] font-bold uppercase tracking-widest rounded-full">
              클래스 관리
            </span>
          </div>
          <h1 className="text-5xl font-serif font-bold text-[#4A3728] mb-4">{folder.name}</h1>
          <p className="text-[#8B7E74] max-w-md">
            날짜를 선택하여 클래스를 등록하고, 학생들의 출석과 수업 메모를 관리하세요.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-8 border-b border-[#E5E3DD] mb-8">
          {[
            { id: 'dashboard', label: '수업 대시보드', icon: ClipboardList },
            { id: 'students', label: '학생 명단 관리', icon: Users },
            { id: 'settings', label: '클래스 설정', icon: Settings },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={`flex items-center gap-2 pb-4 font-bold text-sm transition-all relative ${
                activeTab === tab.id ? 'text-[#8B5E3C]' : 'text-[#8B7E74] hover:text-[#4A3728]'
              }`}
            >
              <tab.icon size={18} />
              {tab.label}
              {activeTab === tab.id && (
                <motion.div 
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#8B5E3C]" 
                />
              )}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' ? (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-8"
            >
              {/* Left Column (span 2) */}
              <div className="lg:col-span-2 space-y-8">
                {(() => {
                  const selectedIds = currentLesson?.contentIds || (currentLesson?.contentId ? [currentLesson.contentId] : []);
                  const selectedContentsList = selectedIds.map(id => contents.find(c => c.id === id)).filter(Boolean) as LessonContent[];
                  
                  return (
                    <div className="bg-white rounded-[40px] border border-[#E5E3DD] shadow-sm p-10">
                      <div className="flex items-center justify-between mb-8">
                        <h2 className="text-xl font-bold text-[#4A3728] flex items-center gap-2">
                          <FileText className="text-[#8B5E3C]" size={20} />
                          콘텐츠
                        </h2>
                      </div>
                      {/* Warning for missing content */}
                      {selectedIds.length > 0 && selectedContentsList.length === 0 && (
                        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-2xl mb-8 text-red-600 animate-pulse">
                          <AlertCircle size={20} />
                          <div className="text-sm">
                            <p className="font-bold">연결된 콘텐츠를 찾을 수 없습니다.</p>
                            <p className="opacity-80">콘텐츠가 삭제되었을 수 있습니다. 아래 목록에서 새로운 콘텐츠를 선택해주세요.</p>
                          </div>
                        </div>
                      )}

                      {/* Selected Content Bubbles (Multiple) */}
                      {selectedContentsList.length > 0 && (
                        <div className="flex flex-wrap gap-2 items-center mb-8 pb-8 border-b border-[#E5E3DD]">
                          {selectedContentsList.map(c => (
                            <div key={c.id} className="relative group inline-flex">
                              <button className="px-5 py-3 bg-[#8B5E3C] text-white rounded-full font-bold text-sm shadow-md pr-10 text-left transition-all cursor-default">
                                {c.title}
                              </button>
                              <button 
                                onClick={() => handleToggleContent(c)}
                                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 bg-white/20 hover:bg-[#D9534F] hover:text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all text-white/80 z-10"
                                title="콘텐츠 제거"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Category Tabs */}
                      <div className="flex flex-wrap gap-2 mb-6 border-b border-[#E5E3DD] pb-4">
                        {categories.map(cat => (
                          <button 
                             key={cat.id}
                             onClick={() => setSelectedCategory(cat.id)}
                             className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${
                               selectedCategory === cat.id ? 'bg-[#8B5E3C] text-white shadow-md' : 'bg-[#F3F2EE] text-[#8B7E74] hover:bg-[#EBD9C1] hover:text-[#8B5E3C]'
                             }`}
                          >
                            {cat.name}
                          </button>
                        ))}
                      </div>

                      {/* Bubble Tags */}
                      <div className="flex flex-wrap gap-3">
                        {contents.filter(c => c.categoryId === selectedCategory).map(content => {
                          const isSelected = selectedIds.includes(content.id);
                          return (
                            <button 
                               key={content.id}
                               onClick={() => handleToggleContent(content)}
                               className={`px-5 py-3 rounded-full font-bold text-sm transition-all text-left ${
                                  isSelected 
                                    ? 'bg-[#F3F2EE] text-[#D0C9C0] border border-transparent shadow-inner cursor-default opacity-80'
                                    : 'bg-[#FFF5E9] text-[#8B5E3C] border border-[#EBD9C1] hover:bg-[#EBD9C1] hover:shadow-md hover:-translate-y-0.5'
                               }`}
                               disabled={isSelected}
                            >
                              {content.title}
                            </button>
                          );
                        })}
                        {contents.filter(c => c.categoryId === selectedCategory).length === 0 && (
                           <p className="text-[#8B7E74] text-sm py-4">이 카테고리에 등록된 콘텐츠가 없습니다.</p>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Always-visible Attendance List */}
                <div className="bg-white rounded-[32px] border border-[#E5E3DD] p-8 shadow-sm text-left">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-[#4A3728] flex items-center gap-2">
                      <CheckCircle2 className="text-[#8B5E3C]" size={20} />
                      출석 체크 ({getAttendanceStats(currentLesson).present}명 출석)
                    </h2>
                  </div>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {((currentLesson ? currentLesson.attendance : null) || folder.students?.map(s => ({ studentId: s.id, studentName: s.name, initials: s.initials, status: 'Present' })) || []).map(record => (
                      <div key={record.studentId} className="flex items-center justify-between p-3 bg-[#FBFBFA] rounded-xl border border-[#F3F2EE]">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#EBD9C1] flex items-center justify-center text-[#8B5E3C] font-bold text-xs">
                            {record.initials}
                          </div>
                          <span className="font-bold text-[#4A3728] text-sm">{record.studentName}</span>
                        </div>
                        <div className="flex gap-1">
                          {(['Present', 'Absent', 'Late'] as const).map(status => (
                            <button
                              key={status}
                              onClick={() => updateAttendance(record.studentId, status)}
                              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                                record.status === status
                                  ? status === 'Present' ? 'bg-[#D1F3E0] text-[#2D7A4D]' : status === 'Absent' ? 'bg-[#F3D1D1] text-[#7A2D2D]' : 'bg-[#F3EBD1] text-[#7A6A2D]'
                                  : 'bg-white border border-[#E5E3DD] text-[#8B7E74] hover:bg-[#F3F2EE]'
                              }`}
                            >
                              {status === 'Present' ? '출석' : status === 'Absent' ? '결석' : '지각'}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    {(!folder.students || folder.students.length === 0) && (
                      <div className="py-6 text-center text-sm text-[#8B7E74]">명단이 없습니다. 학생 명단 관리 탭에서 학생을 추가하세요.</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column (span 1) */}
              <div className="space-y-8">
                {/* Small Calendar Card */}
                <div className="bg-white p-6 rounded-[32px] border border-[#E5E3DD] shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="font-bold text-[#4A3728]">
                      {viewMonth.getFullYear()}년 {viewMonth.getMonth() + 1}월
                    </h3>
                    <div className="flex gap-1">
                      <button 
                        onClick={() => setViewMonth(new Date(viewMonth.setMonth(viewMonth.getMonth() - 1)))}
                        className="p-1.5 hover:bg-[#F3F2EE] rounded-lg text-[#8B7E74] transition-all"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <button 
                        onClick={() => setViewMonth(new Date(viewMonth.setMonth(viewMonth.getMonth() + 1)))}
                        className="p-1.5 hover:bg-[#F3F2EE] rounded-lg text-[#8B7E74] transition-all"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-7 gap-1 mb-2">
                    {weekDays.map(day => (
                      <div key={day} className="text-center text-[10px] font-bold text-[#A89F94] py-1">
                        {day}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {calendarDays.map((date, idx) => {
                      if (!date) return <div key={`empty-${idx}`} className="h-8" />;
                      
                      const dateStr = getLocalDateString(date);
                      const isSelected = dateStr === selectedDate;
                      const isToday = dateStr === getLocalDateString(new Date());
                      const hasLesson = folderLessons.some(l => l.date === dateStr && (
                        (l.contentIds && l.contentIds.length > 0) ||
                        l.contentId ||
                        (l.memo && l.memo.trim().length > 0)
                      ));

                      return (
                        <button
                          key={dateStr}
                          onClick={() => setSelectedDate(dateStr)}
                          className={`h-8 w-full rounded-lg text-xs font-bold transition-all relative flex items-center justify-center ${
                            isSelected 
                              ? 'bg-[#8B5E3C] text-white shadow-md shadow-[#8B5E3C]/20' 
                              : isToday 
                                ? 'text-[#8B5E3C] bg-[#FFF5E9]' 
                                : 'text-[#4A3728] hover:bg-[#F3F2EE]'
                          }`}
                        >
                          {date.getDate()}
                          {hasLesson && !isSelected && (
                            <div className="absolute bottom-1 w-1 h-1 bg-[#8B5E3C] rounded-full" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Always-visible Memo Card */}
                <div className="bg-white rounded-[32px] border border-[#E5E3DD] p-6 shadow-sm text-left flex flex-col h-[300px]">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-[#4A3728] flex items-center gap-2">
                      <MessageSquare className="text-[#8B5E3C]" size={18} />
                      오늘의 수업 메모
                    </h2>
                  </div>
                  <textarea
                    value={localMemo}
                    onChange={(e) => setLocalMemo(e.target.value)}
                    onBlur={handleSaveMemo}
                    placeholder="특이사항이나 메모를 자유롭게 남기세요 (자동 저장)"
                    className="flex-1 w-full p-4 bg-[#FBFBFA] border border-[#F3F2EE] rounded-2xl text-sm outline-none focus:border-[#8B5E3C] transition-all resize-none custom-scrollbar"
                  />
                </div>
              </div>
            </motion.div>
          ) : activeTab === 'students' ? (
            <motion.div 
              key="students"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-white rounded-[40px] border border-[#E5E3DD] p-10 shadow-sm text-left"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#F3F2EE] rounded-xl flex items-center justify-center text-[#8B5E3C]">
                    <Users size={20} />
                  </div>
                  <h2 className="text-2xl font-bold">학생 명단 ({students.length}명)</h2>
                </div>
              </div>

              <div className="flex gap-4 mb-8">
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <div className="relative col-span-2">
                    <input 
                      type="text" 
                      value={newStudentName}
                      onChange={(e) => setNewStudentName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddStudent()}
                      placeholder="이름 (필수)"
                      className="w-full pl-10 pr-4 py-3 bg-[#FBFBFA] border border-[#E5E3DD] rounded-2xl focus:outline-none focus:border-[#8B5E3C] transition-all text-sm"
                    />
                    <UserPlus size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A89F94]" />
                  </div>
                  <input 
                    type="text" 
                    value={newStudentAge}
                    onChange={(e) => setNewStudentAge(e.target.value)}
                    placeholder="나이"
                    className="w-full px-4 py-3 bg-[#FBFBFA] border border-[#E5E3DD] rounded-2xl focus:outline-none focus:border-[#8B5E3C] transition-all text-sm"
                  />
                  <input 
                    type="text" 
                    value={newStudentContact}
                    onChange={(e) => setNewStudentContact(e.target.value)}
                    placeholder="연락처"
                    className="w-full px-4 py-3 bg-[#FBFBFA] border border-[#E5E3DD] rounded-2xl focus:outline-none focus:border-[#8B5E3C] transition-all text-sm"
                  />
                  <textarea
                    value={newStudentMemo}
                    onChange={(e) => setNewStudentMemo(e.target.value)}
                    placeholder="기타 메모"
                    rows={2}
                    className="col-span-2 w-full px-4 py-3 bg-[#FBFBFA] border border-[#E5E3DD] rounded-2xl focus:outline-none focus:border-[#8B5E3C] transition-all text-sm resize-none"
                  />
                </div>
                <button 
                  onClick={handleAddStudent}
                  className="px-6 py-4 bg-[#8B5E3C] text-white rounded-2xl font-bold hover:bg-[#724D31] transition-all self-start shadow-md"
                >
                  추가
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {students.map((student, idx) => (
                  <motion.div 
                    key={student.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="bg-[#FBFBFA] rounded-2xl border border-[#F3F2EE] group overflow-hidden"
                  >
                    {/* Card Header */}
                    <div
                      className="flex items-center justify-between p-4 cursor-pointer hover:bg-[#F3F2EE] transition-all"
                      onClick={() => setExpandedStudent(expandedStudent === student.id ? null : student.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#EBD9C1] rounded-full flex items-center justify-center text-[#8B5E3C] font-bold text-xs flex-shrink-0">
                          {student.initials}
                        </div>
                        <div>
                          <span className="font-bold text-[#4A3728] block">{student.name}</span>
                          {(student.age || student.contact) && (
                            <span className="text-xs text-[#A89F94]">{[student.age ? student.age + '세' : null, student.contact].filter(Boolean).join(' · ')}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleRemoveStudent(student.id); }}
                          className="w-7 h-7 flex items-center justify-center rounded-full text-[#A89F94] hover:bg-red-100 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                          title="학생 삭제"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Expanded Detail / Edit Panel */}
                    <AnimatePresence>
                      {expandedStudent === student.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="px-4 pb-4 border-t border-[#F3F2EE] overflow-hidden"
                        >
                          {editingStudent?.id === student.id ? (
                            <div className="pt-4 space-y-2">
                              <input
                                value={editingStudent.name}
                                onChange={(e) => setEditingStudent({ ...editingStudent, name: e.target.value })}
                                placeholder="이름"
                                className="w-full px-3 py-2 border border-[#E5E3DD] rounded-xl text-sm focus:outline-none focus:border-[#8B5E3C]"
                              />
                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  value={editingStudent.age || ''}
                                  onChange={(e) => setEditingStudent({ ...editingStudent, age: e.target.value })}
                                  placeholder="나이"
                                  className="px-3 py-2 border border-[#E5E3DD] rounded-xl text-sm focus:outline-none focus:border-[#8B5E3C]"
                                />
                                <input
                                  value={editingStudent.contact || ''}
                                  onChange={(e) => setEditingStudent({ ...editingStudent, contact: e.target.value })}
                                  placeholder="연락처"
                                  className="px-3 py-2 border border-[#E5E3DD] rounded-xl text-sm focus:outline-none focus:border-[#8B5E3C]"
                                />
                              </div>
                              <textarea
                                value={editingStudent.memo || ''}
                                onChange={(e) => setEditingStudent({ ...editingStudent, memo: e.target.value })}
                                placeholder="기타 메모"
                                rows={2}
                                className="w-full px-3 py-2 border border-[#E5E3DD] rounded-xl text-sm focus:outline-none focus:border-[#8B5E3C] resize-none"
                              />
                              <div className="flex gap-2 pt-1">
                                <button
                                  onClick={() => handleSaveStudentEdit(editingStudent)}
                                  className="flex-1 py-2 bg-[#8B5E3C] text-white font-bold text-sm rounded-xl hover:bg-[#724D31] transition-all"
                                >저장</button>
                                <button
                                  onClick={() => setEditingStudent(null)}
                                  className="px-4 py-2 bg-[#F3F2EE] text-[#8B7E74] font-bold text-sm rounded-xl hover:bg-[#E5E3DD] transition-all"
                                >취소</button>
                              </div>
                            </div>
                          ) : (
                            <div className="pt-4 space-y-2 text-sm">
                              {student.age && <div className="flex items-center gap-2 text-[#8B7E74]"><span className="text-[#A89F94] w-12">나이</span><span className="text-[#4A3728] font-medium">{student.age}세</span></div>}
                              {student.contact && <div className="flex items-center gap-2 text-[#8B7E74]"><span className="text-[#A89F94] w-12">연락처</span><span className="text-[#4A3728] font-medium">{student.contact}</span></div>}
                              {student.memo && <div className="flex items-start gap-2 text-[#8B7E74]"><span className="text-[#A89F94] w-12">메모</span><span className="text-[#4A3728] font-medium">{student.memo}</span></div>}
                              {!student.age && !student.contact && !student.memo && (
                                <p className="text-[#A89F94] italic">추가 정보 없음</p>
                              )}
                              <button
                                onClick={() => setEditingStudent({ ...student })}
                                className="mt-2 px-4 py-1.5 bg-[#F3F2EE] text-[#8B5E3C] font-bold text-xs rounded-xl hover:bg-[#EBD9C1] transition-all"
                              >수정</button>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ) : activeTab === 'settings' ? (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-white rounded-[40px] border border-[#E5E3DD] p-10 shadow-sm text-left"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#F3F2EE] rounded-xl flex items-center justify-center text-[#8B5E3C]">
                    <Settings size={20} />
                  </div>
                  <h2 className="text-2xl font-bold">클래스 설정</h2>
                </div>
                <button
                  onClick={() => {
                    onUpdateFolder?.(folder.id, settingsDraft);
                    alert("설정이 저장되었습니다.");
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#8B5E3C] text-white font-bold text-sm rounded-xl hover:bg-[#724D31] transition-all"
                >
                  <Save size={16} />
                  저장
                </button>
              </div>

              {/* Class Name */}
              <div className="mb-10">
                <div className="flex items-center gap-2 mb-4">
                  <Edit3 size={18} className="text-[#8B5E3C]" />
                  <h3 className="font-bold text-lg text-[#4A3728]">클래스 이름</h3>
                </div>
                <input
                  type="text"
                  value={settingsDraft.name}
                  onChange={(e) => setSettingsDraft({ ...settingsDraft, name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                  className="w-full px-5 py-3.5 border-2 border-[#E5E3DD] rounded-2xl text-lg font-bold text-[#4A3728] focus:outline-none focus:border-[#8B5E3C] transition-all"
                  placeholder="클래스 이름을 입력하세요"
                />
              </div>

              {/* Color Picker */}
              <div className="mb-10">
                <div className="flex items-center gap-2 mb-4">
                  <Palette size={18} className="text-[#8B5E3C]" />
                  <h3 className="font-bold text-lg text-[#4A3728]">테마 컬러</h3>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {FOLDER_COLORS.map(c => {
                    const isSelected = settingsDraft.color === c.value;
                    return (
                      <button
                        key={c.value}
                        onClick={() => setSettingsDraft({ ...settingsDraft, color: c.value })}
                        className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${
                          isSelected
                            ? 'border-current shadow-md scale-[1.02]'
                            : 'border-transparent hover:border-[#E5E3DD]'
                        }`}
                        style={{ 
                          backgroundColor: c.bg,
                          color: c.value,
                          borderColor: isSelected ? c.value : undefined
                        }}
                      >
                        <div 
                          className="w-8 h-8 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: c.value }}
                        >
                          {isSelected && <CheckCircle2 size={16} className="text-white" />}
                        </div>
                        <span className="font-bold text-sm" style={{ color: c.value }}>{c.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Icon Picker */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Star size={18} className="text-[#8B5E3C]" />
                  <h3 className="font-bold text-lg text-[#4A3728]">아이콘</h3>
                </div>
                <div className="grid grid-cols-4 md:grid-cols-6 gap-3">
                  {FOLDER_ICONS.map(ic => {
                    const IconComp = iconMap[ic.icon];
                    const isSelected = settingsDraft.icon === ic.icon;
                    const folderColor = settingsDraft.color;
                    return (
                      <button
                        key={ic.icon}
                        onClick={() => setSettingsDraft({ ...settingsDraft, icon: ic.icon })}
                        className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                          isSelected
                            ? 'shadow-md scale-[1.02]'
                            : 'border-transparent hover:border-[#E5E3DD] bg-[#FBFBFA]'
                        }`}
                        style={{
                          borderColor: isSelected ? folderColor : undefined,
                          backgroundColor: isSelected ? FOLDER_COLORS.find(c => c.value === folderColor)?.bg || '#FFF5E9' : undefined
                        }}
                      >
                        {IconComp && <IconComp size={24} className={isSelected ? '' : 'text-[#A89F94]'} style={isSelected ? { color: folderColor } : undefined} />}
                        <span className={`text-xs font-bold ${isSelected ? '' : 'text-[#A89F94]'}`} style={isSelected ? { color: folderColor } : undefined}>{ic.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Preview */}
              <div className="mt-10 p-6 bg-[#FBFBFA] rounded-2xl border border-[#F3F2EE]">
                <p className="text-xs font-bold text-[#A89F94] mb-3">미리보기</p>
                <div className="flex items-center gap-4">
                  <div 
                    className="w-14 h-14 rounded-2xl flex items-center justify-center"
                    style={{ backgroundColor: FOLDER_COLORS.find(c => c.value === settingsDraft.color)?.bg || '#FFF5E9' }}
                  >
                    {(() => {
                      const IconComp = iconMap[settingsDraft.icon];
                      return IconComp ? <IconComp size={28} style={{ color: settingsDraft.color }} /> : null;
                    })()}
                  </div>
                  <div>
                    <h4 className="font-bold text-lg" style={{ color: settingsDraft.color }}>{settingsDraft.name}</h4>
                    <p className="text-sm text-[#A89F94]">학생 {folder.students?.length || 0}명</p>
                  </div>
                </div>
              </div>

              {/* Danger Zone */}
              <div className="mt-10 p-6 bg-red-50 rounded-2xl border border-red-100">
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle size={18} className="text-red-500" />
                  <h3 className="font-bold text-lg text-red-600">위험 영역</h3>
                </div>
                <p className="text-sm text-red-400 mb-4">클래스를 삭제하면 수업 기록, 학생 명단 등 모든 데이터가 영구적으로 삭제됩니다.</p>
                <button
                  onClick={() => {
                    const msg = "'" + folder.name + "' 클래스를 정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.";
                    if (window.confirm(msg)) {
                      onDeleteFolder?.(folder.id);
                    }
                  }}
                  className="px-6 py-3 bg-red-500 text-white font-bold text-sm rounded-xl hover:bg-red-600 transition-all"
                >
                  클래스 삭제
                </button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </main>
  );
};
