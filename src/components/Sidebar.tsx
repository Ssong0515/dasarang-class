import React from 'react';
import { 
  LayoutGrid, 
  BookOpen, 
  Users, 
  Paperclip, 
  Settings, 
  HelpCircle, 
  LogOut,
  ChevronDown,
  Edit3,
  Library,
  Plus
} from 'lucide-react';
import { LessonFolder, Lesson } from '../types';

interface SidebarProps {
  folders: LessonFolder[];
  lessons: Lesson[];
  selectedLessonId?: string;
  activeTab: 'home' | 'memo' | 'lesson-detail' | 'folder-management' | 'content-library';
  onTabChange: (tab: 'home' | 'memo' | 'lesson-detail' | 'folder-management' | 'content-library') => void;
  onSelectLesson: (lesson: Lesson) => void;
  onManageFolder: (folder: LessonFolder) => void;
  onLogout: () => void;
  onSwitchToStudent: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  folders, 
  lessons, 
  selectedLessonId, 
  activeTab, 
  onTabChange, 
  onSelectLesson, 
  onManageFolder,
  onLogout,
  onSwitchToStudent
}) => {
  return (
    <aside className="w-64 bg-[#FBFBFA] h-screen flex flex-col border-r border-[#E5E3DD] p-8 overflow-y-auto">
      {/* Logo & Brand */}
      <div className="flex flex-col mb-12 cursor-pointer" onClick={() => onTabChange('home')}>
        <h1 className="font-serif font-bold text-[#141414] text-xl leading-tight">다사랑 교실</h1>
        <p className="text-[11px] text-[#8B7E74] font-medium mt-1">관리자 대시보드</p>
      </div>

      {/* Main Nav */}
      <nav className="space-y-2 mb-12">
        <button 
          onClick={() => onTabChange('home')}
          className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl font-bold transition-all ${
            activeTab === 'home' ? 'bg-[#FFF5E9] text-[#8B5E3C]' : 'text-[#8B7E74] hover:bg-[#F3F2EE]'
          }`}
        >
          <LayoutGrid size={20} />
          <span>대시보드</span>
        </button>

        <button 
          onClick={onSwitchToStudent}
          className="w-full flex items-center gap-4 px-4 py-3 text-[#8B7E74] hover:bg-[#F3F2EE] rounded-xl font-bold transition-all"
        >
          <Users size={20} />
          <span>학생 페이지 보기</span>
        </button>

        <button 
          onClick={() => onTabChange('content-library')}
          className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl font-bold transition-all mt-2 ${
            activeTab === 'content-library' ? 'bg-[#FFF5E9] text-[#8B5E3C]' : 'text-[#8B7E74] hover:bg-[#F3F2EE]'
          }`}
        >
          <Library size={20} />
          <span>콘텐츠 라이브러리</span>
        </button>
        
        <div className="pt-8 pb-2">
          <p className="px-4 text-[10px] font-bold text-[#A89F94] uppercase tracking-widest mb-4">수업 폴더 (인원 관리)</p>
          <div className="space-y-1">
            {folders.map(folder => (
              <div key={folder.id} className="space-y-1">
                <button 
                  onClick={() => onManageFolder(folder)}
                  className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl font-bold transition-all group ${
                    activeTab === 'folder-management' && folder.id === folder.id ? 'bg-[#F3F2EE] text-[#8B5E3C]' : 'text-[#8B7E74] hover:bg-[#F3F2EE]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <BookOpen size={18} className="group-hover:text-[#8B5E3C]" />
                    <span className="truncate max-w-[120px]">{folder.name}</span>
                  </div>
                  <Settings size={14} className="opacity-40 hover:opacity-100" />
                </button>
                
                {/* Lessons under folder */}
                <div className="pl-10 space-y-1">
                  {lessons.filter(l => l.folderId === folder.id).sort((a, b) => (a.order || 0) - (b.order || 0)).map(lesson => (
                    <button
                      key={lesson.id}
                      onClick={() => onSelectLesson(lesson)}
                      className={`w-full text-left px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all ${
                        activeTab === 'lesson-detail' && selectedLessonId === lesson.id ? 'text-[#8B5E3C] bg-[#FFF5E9]' : 'text-[#A89F94] hover:text-[#8B5E3C] hover:bg-[#F3F2EE]'
                      }`}
                    >
                      {lesson.order ? `[${lesson.order}] ` : ''}{lesson.title}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <button 
          onClick={() => onTabChange('memo')}
          className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl font-bold transition-all ${
            activeTab === 'memo' ? 'bg-[#FFF5E9] text-[#8B5E3C]' : 'text-[#8B7E74] hover:bg-[#F3F2EE]'
          }`}
        >
          <Paperclip size={20} />
          <span>메모장</span>
        </button>
      </nav>

      <div className="flex-1"></div>

      {/* Footer Nav */}
      <div className="space-y-2 pt-8 border-t border-[#E5E3DD]">
        <button className="w-full flex items-center gap-4 px-4 py-3 text-[#8B7E74] hover:text-[#4A3728] transition-colors font-bold text-sm">
          <HelpCircle size={20} />
          <span>도움말</span>
        </button>
        <button 
          onClick={onLogout}
          className="w-full flex items-center gap-4 px-4 py-3 text-[#8B7E74] hover:text-red-500 transition-colors font-bold text-sm"
        >
          <LogOut size={20} />
          <span>로그아웃</span>
        </button>
      </div>
    </aside>
  );
};
