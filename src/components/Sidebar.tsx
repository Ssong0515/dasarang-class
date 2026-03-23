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
  Plus,
  GripVertical,
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
import { Reorder } from 'motion/react';
import { LessonFolder, Lesson } from '../types';

const sidebarIconMap: Record<string, React.FC<{ size?: number; className?: string; style?: React.CSSProperties }>> = {
  BookOpen, GraduationCap, Code, Music, Brush, Globe, Cpu, Heart, Zap, Rocket, Star, Lightbulb
};

interface SidebarProps {
  folders: LessonFolder[];
  lessons: Lesson[];
  selectedLessonId?: string;
  activeFolderId?: string;
  activeTab: 'home' | 'memo' | 'lesson-detail' | 'folder-management' | 'content-library';
  onTabChange: (tab: 'home' | 'memo' | 'lesson-detail' | 'folder-management' | 'content-library') => void;
  onSelectLesson: (lesson: Lesson) => void;
  onManageFolder: (folder: LessonFolder) => void;
  onLogout: () => void;
  onSwitchToStudent: () => void;
  onReorderFolders?: (folders: LessonFolder[]) => void;
  onCreateFolder?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  folders, 
  lessons, 
  selectedLessonId, 
  activeFolderId,
  activeTab, 
  onTabChange, 
  onSelectLesson, 
  onManageFolder,
  onLogout,
  onSwitchToStudent,
  onReorderFolders,
  onCreateFolder
}) => {
  const [localFolders, setLocalFolders] = React.useState(folders);
  const [expandedFolders, setExpandedFolders] = React.useState<Record<string, boolean>>({});
  
  React.useEffect(() => {
    // Update localFolders if lengths differ, or if any name/icon/color changed
    const hasChanges = folders.length !== localFolders.length || folders.some((f, i) => {
      const lf = localFolders[i];
      return !lf || f.id !== lf.id || f.name !== lf.name || f.icon !== lf.icon || f.color !== lf.color;
    });
    
    if (hasChanges) {
      setLocalFolders(folders);
    }
  }, [folders, localFolders]);

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  const handleReorder = (newOrder: LessonFolder[]) => {
    setLocalFolders(newOrder);
    if (onReorderFolders) onReorderFolders(newOrder);
  };

  return (
    <aside className="w-64 bg-[#FBFBFA] h-screen flex flex-col border-r border-[#E5E3DD] p-8 overflow-y-auto">
      {/* Logo & Brand */}
      <div className="flex flex-col mb-12 cursor-pointer" onClick={() => onTabChange('home')}>
        <h1 className="font-serif font-bold text-[#141414] text-xl leading-tight">다사랑 교실</h1>
        <p className="text-[11px] text-[#8B7E74] font-medium mt-1">관리자 대시보드</p>
      </div>

      {/* Main Nav */}
      <nav className="space-y-2 mb-12 flex-1">
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
          <span>학생 페이지</span>
        </button>

        <button 
          onClick={() => onTabChange('content-library')}
          className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl font-bold transition-all mt-2 ${
            activeTab === 'content-library' ? 'bg-[#FFF5E9] text-[#8B5E3C]' : 'text-[#8B7E74] hover:bg-[#F3F2EE]'
          }`}
        >
          <Library size={20} />
          <span>콘텐츠</span>
        </button>

        <button 
          onClick={() => onTabChange('memo')}
          className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl font-bold transition-all mt-2 ${
            activeTab === 'memo' ? 'bg-[#FFF5E9] text-[#8B5E3C]' : 'text-[#8B7E74] hover:bg-[#F3F2EE]'
          }`}
        >
          <Paperclip size={20} />
          <span>메모장</span>
        </button>
        
        <div className="pt-8 pb-2">
          <p className="px-4 text-[10px] font-bold text-[#A89F94] uppercase tracking-widest mb-4">수업 폴더 (인원 관리)</p>
          <Reorder.Group axis="y" values={localFolders} onReorder={handleReorder} className="space-y-1">
            {localFolders.map(folder => (
              <Reorder.Item key={folder.id} value={folder} className="space-y-1 relative group/reorder w-full">
                <div className="flex items-center group w-full relative">
                  <div className="absolute -left-6 z-10 cursor-grab active:cursor-grabbing p-1 opacity-0 group-hover/reorder:opacity-40 hover:!opacity-100 transition-opacity" title="드래그하여 순서 변경">
                    <GripVertical size={14} className="text-[#8B7E74]" />
                  </div>
                  <div 
                    className={`flex-1 flex w-full items-center justify-between px-4 py-2.5 rounded-xl font-bold transition-all ${
                      activeTab === 'folder-management' && folder.id === activeFolderId ? 'bg-[#F3F2EE] text-[#8B5E3C]' : 'text-[#8B7E74] hover:bg-[#F3F2EE]'
                    }`}
                  >
                    <div 
                      className="flex items-center gap-3 flex-1 cursor-pointer"
                      onClick={() => onManageFolder(folder)}
                    >
                      {(() => {
                        const SideIcon = sidebarIconMap[folder.icon || 'BookOpen'] || BookOpen;
                        return <SideIcon size={18} className="group-hover:text-[#8B5E3C]" style={folder.color ? { color: folder.color } : undefined} />;
                      })()}
                      <span className="truncate max-w-[120px]">{folder.name}</span>
                    </div>
                    
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                         onClick={(e) => { e.stopPropagation(); toggleFolder(folder.id); }}
                         className="p-1 hover:bg-[#E5E3DD] rounded-md transition-all text-[#8B7E74]"
                      >
                         <ChevronDown size={14} className={`transition-transform duration-200 ${expandedFolders[folder.id] ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  </div>
                </div>
                
                {/* Lessons under folder (Only valid contents) */}
                {expandedFolders[folder.id] && (
                  <div className="pl-10 space-y-1 mt-1">
                    {lessons
                      .filter(l => l.folderId === folder.id && (l.contentId || (l.contentIds && l.contentIds.length > 0)))
                      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                      .map((lesson, index) => (
                      <button
                        key={lesson.id}
                        onClick={() => onSelectLesson(lesson)}
                        onPointerDown={(e) => e.stopPropagation()}
                        className={`w-full text-left px-3 py-2 text-[12px] font-bold rounded-lg transition-all border border-transparent ${
                          activeTab === 'folder-management' && selectedLessonId === lesson.id ? 'text-[#8B5E3C] bg-[#FFF5E9] border-[#EBD9C1]' : 'text-[#A89F94] hover:text-[#8B5E3C] hover:bg-[#F3F2EE]'
                        }`}
                      >
                        <span className="text-[#D0C9C0] font-normal mr-1">[{index + 1}]</span> {lesson.title}
                      </button>
                    ))}
                  </div>
                )}
              </Reorder.Item>
            ))}
          </Reorder.Group>
          {onCreateFolder && (
            <button
              onClick={onCreateFolder}
              className="w-full flex items-center justify-center gap-2 mt-4 py-3 text-sm font-bold text-[#8B5E3C] bg-[#FFF5E9] border border-dashed border-[#8B5E3C]/30 hover:bg-[#F3E8DB] rounded-xl transition-all shadow-sm"
            >
              <Plus size={16} />
              클래스 생성
            </button>
          )}
        </div>
      </nav>

      {/* Footer Nav */}
      <div className="space-y-2 pt-8 border-t border-[#E5E3DD] mt-auto">
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
