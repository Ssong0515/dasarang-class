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
  Search
} from 'lucide-react';
import { LessonFolder, Student, Lesson, LessonCategory, LessonContent, AttendanceRecord } from '../types';
import { LessonDetail } from './LessonDetail';

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
}

type Tab = 'dashboard' | 'students';

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
  onGoToLibrary
}) => {
  const getLocalDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [selectedDate, setSelectedDate] = useState(initialLesson?.date || getLocalDateString(new Date()));
  const [students, setStudents] = useState<Student[]>(folder.students || []);
  const [newStudentName, setNewStudentName] = useState('');
  const [isEditing, setIsEditing] = useState(!!initialLesson);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(initialLesson || null);

  // Sync with initialLesson if it changes
  useEffect(() => {
    if (initialLesson) {
      setSelectedDate(initialLesson.date);
      setEditingLesson(initialLesson);
      setIsEditing(true);
    }
  }, [initialLesson]);

  // Reset editing state when date changes
  useEffect(() => {
    if (!initialLesson || initialLesson.date !== selectedDate) {
      setIsEditing(false);
      setEditingLesson(null);
    }
  }, [selectedDate]);

  const folderLessons = lessons.filter(l => l.folderId === folder.id);
  const currentLesson = folderLessons.find(l => l.date === selectedDate);

  const handleStartCreate = (content?: LessonContent) => {
    const newLesson: Lesson = {
      id: 'new-' + Date.now(),
      folderId: folder.id,
      folderName: folder.name,
      ownerUid: '', // Will be set on save
      date: selectedDate,
      title: content ? content.title : '새로운 수업',
      content: content ? content.html : '<h1>수업 내용을 입력하세요</h1>',
      order: (folderLessons.length + 1),
      attendance: (folder.students || []).map(s => ({
        studentId: s.id,
        studentName: s.name,
        initials: s.initials,
        status: 'Present'
      })),
      resources: [],
      memo: '',
      contentId: content?.id,
      summary: {
        text: '수업 요약이 아직 작성되지 않았습니다.',
        attendanceRate: '0%',
        engagement: 'N/A',
        resourceCount: '0'
      }
    };
    setEditingLesson(newLesson);
    setIsEditing(true);
  };

  const handleStartEdit = (lesson: Lesson, content?: LessonContent) => {
    if (content) {
      setEditingLesson({
        ...lesson,
        title: content.title,
        content: content.html,
        contentId: content.id
      });
    } else {
      setEditingLesson(lesson);
    }
    setIsEditing(true);
  };

  const handleSaveInline = (lesson: Lesson) => {
    onSaveLesson(lesson);
    setIsEditing(false);
    setEditingLesson(null);
  };

  const handleAddStudent = () => {
    if (!newStudentName.trim()) return;
    const initials = newStudentName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const newStudent: Student = {
      id: 'std-' + Date.now(),
      name: newStudentName.trim(),
      initials: initials || '??'
    };
    setStudents([...students, newStudent]);
    setNewStudentName('');
  };

  const handleRemoveStudent = (id: string) => {
    setStudents(students.filter(s => s.id !== id));
  };

  const getAttendanceStats = (lesson: Lesson) => {
    if (!lesson.attendance) return { present: 0, absent: 0, late: 0, total: 0 };
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
        {/* Header & Calendar Section */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 mb-12">
          <div className="xl:col-span-2">
            <div className="flex items-center gap-3 mb-2">
              <span className="px-3 py-1 bg-[#FFF5E9] text-[#8B5E3C] text-[10px] font-bold uppercase tracking-widest rounded-full">
                클래스 관리
              </span>
            </div>
            <h1 className="text-5xl font-serif font-bold text-[#4A3728] mb-4">{folder.name}</h1>
            <p className="text-[#8B7E74] max-w-md">
              날짜를 선택하여 해당 날짜의 수업 내용과 출석 현황을 확인하세요. 
              수업이 없는 날은 새로 만들 수 있습니다.
            </p>
          </div>

          {/* Monthly Calendar Card */}
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
                const hasLesson = folderLessons.some(l => l.date === dateStr);

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
        </div>

        {/* Tabs */}
        <div className="flex gap-8 border-b border-[#E5E3DD] mb-8">
          {[
            { id: 'dashboard', label: '수업 대시보드', icon: ClipboardList },
            { id: 'students', label: '학생 명단 관리', icon: Users },
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
          {isEditing && editingLesson ? (
            <motion.div
              key="editor"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="relative"
            >
              <button 
                onClick={() => {
                  setIsEditing(false);
                  setEditingLesson(null);
                }}
                className="absolute -top-16 right-0 px-4 py-2 bg-[#F3F2EE] text-[#8B7E74] rounded-xl font-bold text-xs hover:bg-[#EAE8E2] transition-all flex items-center gap-2"
              >
                <ChevronLeft size={14} />
                <span>대시보드로 돌아가기</span>
              </button>
              <LessonDetail 
                lesson={editingLesson}
                folders={folders}
                contents={contents}
                onSave={handleSaveInline}
              />
            </motion.div>
          ) : activeTab === 'dashboard' ? (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              {currentLesson ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Left: Attendance & Info */}
                  <div className="lg:col-span-2 space-y-8">
                    {/* Attendance Summary */}
                    <div className="bg-white rounded-[32px] border border-[#E5E3DD] p-8 shadow-sm text-left">
                      <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold text-[#4A3728] flex items-center gap-2">
                          <CheckCircle2 className="text-[#8B5E3C]" size={20} />
                          출석 현황
                        </h2>
                        <button 
                          onClick={() => handleStartEdit(currentLesson)}
                          className="text-xs font-bold text-[#8B5E3C] hover:underline"
                        >
                          상세 체크하기
                        </button>
                      </div>
                      <div className="flex items-center justify-between p-6 bg-[#FBFBFA] rounded-2xl border border-[#F3F2EE]">
                        <div className="text-center">
                          <p className="text-[10px] font-bold text-[#8B7E74] uppercase mb-1">출석</p>
                          <p className="text-3xl font-serif font-bold text-green-600">{getAttendanceStats(currentLesson).present}</p>
                        </div>
                        <div className="w-px h-12 bg-[#E5E3DD]"></div>
                        <div className="text-center">
                          <p className="text-[10px] font-bold text-[#8B7E74] uppercase mb-1">지각</p>
                          <p className="text-3xl font-serif font-bold text-orange-500">{getAttendanceStats(currentLesson).late}</p>
                        </div>
                        <div className="w-px h-12 bg-[#E5E3DD]"></div>
                        <div className="text-center">
                          <p className="text-[10px] font-bold text-[#8B7E74] uppercase mb-1">결석</p>
                          <p className="text-3xl font-serif font-bold text-red-500">{getAttendanceStats(currentLesson).absent}</p>
                        </div>
                      </div>
                    </div>

                    {/* Lesson Memo & Content */}
                    <div className="bg-white rounded-[32px] border border-[#E5E3DD] p-8 shadow-sm text-left">
                      <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold text-[#4A3728] flex items-center gap-2">
                          <MessageSquare className="text-[#8B5E3C]" size={20} />
                          오늘의 수업 메모
                        </h2>
                        <button 
                          onClick={() => handleStartEdit(currentLesson)}
                          className="p-2 hover:bg-[#F3F2EE] rounded-xl text-[#8B5E3C] transition-all"
                        >
                          <Edit3 size={18} />
                        </button>
                      </div>
                      <div className="p-6 bg-[#FBFBFA] rounded-2xl border border-[#F3F2EE] min-h-[120px]">
                        <h3 className="font-bold text-[#8B5E3C] mb-3 text-lg">{currentLesson.title}</h3>
                        <p className="text-[#4A3728] whitespace-pre-wrap leading-relaxed">
                          {currentLesson.memo || '작성된 수업 메모가 없습니다.'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Right: Content Library Quick Access */}
                  <div className="space-y-8">
                    <div className="bg-white rounded-[32px] border border-[#E5E3DD] p-8 shadow-sm h-full flex flex-col text-left">
                      <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold text-[#4A3728] flex items-center gap-2">
                          <FileText className="text-[#8B5E3C]" size={20} />
                          콘텐츠 저장소
                        </h2>
                        <button 
                          onClick={onGoToLibrary}
                          className="p-2 hover:bg-[#F3F2EE] rounded-xl text-[#8B5E3C] transition-all"
                        >
                          <Library size={18} />
                        </button>
                      </div>
                      
                      <div className="flex-1 space-y-3 overflow-y-auto max-h-[400px] pr-2 custom-scrollbar">
                        {contents.length > 0 ? (
                          contents.map(content => (
                            <div 
                              key={content.id}
                              className="p-4 bg-[#FBFBFA] rounded-2xl border border-[#F3F2EE] hover:border-[#8B5E3C] transition-all group cursor-pointer"
                              onClick={() => {
                                if (currentLesson) {
                                  handleStartEdit(currentLesson, content);
                                } else {
                                  handleStartCreate(content);
                                }
                              }}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[9px] font-bold text-[#8B5E3C] bg-[#FFF5E9] px-2 py-0.5 rounded-full uppercase">
                                  {categories.find(c => c.id === content.categoryId)?.name || '기타'}
                                </span>
                              </div>
                              <h3 className="text-sm font-bold text-[#4A3728] group-hover:text-[#8B5E3C] transition-colors truncate">
                                {content.title}
                              </h3>
                            </div>
                          ))
                        ) : (
                          <div className="py-8 text-center border-2 border-dashed border-[#F3F2EE] rounded-2xl">
                            <p className="text-[10px] text-[#8B7E74]">저장된 콘텐츠가 없습니다.</p>
                          </div>
                        )}
                      </div>
                      
                      <button 
                        onClick={onGoToLibrary}
                        className="mt-6 w-full py-3 bg-[#F3F2EE] text-[#8B5E3C] rounded-xl font-bold text-xs hover:bg-[#EBD9C1] transition-all"
                      >
                        라이브러리에서 가져오기
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-32 text-center bg-white rounded-[40px] border border-[#E5E3DD] shadow-sm">
                  <div className="w-20 h-20 bg-[#FBFBFA] rounded-full flex items-center justify-center mx-auto mb-6">
                    <Calendar size={40} className="text-[#E5E3DD]" />
                  </div>
                  <h2 className="text-2xl font-serif font-bold text-[#4A3728] mb-2">{selectedDate}</h2>
                  <p className="text-[#8B7E74] mb-8">이 날짜에 등록된 수업이 없습니다.</p>
                  <button 
                    onClick={handleStartCreate}
                    className="flex items-center gap-2 px-8 py-4 bg-[#8B5E3C] text-white rounded-2xl font-bold hover:bg-[#724D31] transition-all shadow-lg shadow-[#8B5E3C]/20 mx-auto"
                  >
                    <Plus size={20} />
                    <span>새 수업 만들기</span>
                  </button>
                </div>
              )}
            </motion.div>
          ) : (
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
                <button 
                  onClick={() => onSaveStudents(folder.id, students)}
                  className="flex items-center gap-2 px-6 py-3 bg-[#8B5E3C] text-white rounded-2xl font-bold hover:bg-[#724D31] transition-all shadow-lg shadow-[#8B5E3C]/20"
                >
                  <Save size={20} />
                  <span>명단 저장</span>
                </button>
              </div>

              <div className="flex gap-4 mb-8">
                <div className="flex-1 relative">
                  <input 
                    type="text" 
                    value={newStudentName}
                    onChange={(e) => setNewStudentName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddStudent()}
                    placeholder="학생 이름을 입력하세요"
                    className="w-full pl-12 pr-4 py-4 bg-[#FBFBFA] border border-[#E5E3DD] rounded-2xl focus:outline-none focus:border-[#8B5E3C] transition-all"
                  />
                  <UserPlus size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A89F94]" />
                </div>
                <button 
                  onClick={handleAddStudent}
                  className="px-8 py-4 bg-[#F3F2EE] text-[#8B5E3C] rounded-2xl font-bold hover:bg-[#EBD9C1] transition-all"
                >
                  추가
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {students.map((student, idx) => (
                  <motion.div 
                    key={student.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="flex items-center justify-between p-4 bg-[#FBFBFA] rounded-2xl border border-[#F3F2EE] group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-[#EBD9C1] rounded-full flex items-center justify-center text-[#8B5E3C] font-bold text-xs">
                        {student.initials}
                      </div>
                      <span className="font-bold text-[#4A3728]">{student.name}</span>
                    </div>
                    <button 
                      onClick={() => handleRemoveStudent(student.id)}
                      className="p-2 text-[#A89F94] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 size={18} />
                    </button>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
};
