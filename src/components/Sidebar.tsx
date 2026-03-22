import React from 'react';
import { 
  LayoutGrid, 
  BookOpen, 
  Users, 
  Paperclip, 
  Settings, 
  HelpCircle, 
  LogOut,
  ChevronDown
} from 'lucide-react';
import { LessonFolder } from '../types';

interface SidebarProps {
  folders: LessonFolder[];
  activeTab: 'home' | 'memo' | 'lesson-detail';
  onTabChange: (tab: 'home' | 'memo' | 'lesson-detail') => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ folders, activeTab, onTabChange }) => {
  return (
    <aside className="w-64 bg-[#FBFBFA] h-screen flex flex-col border-r border-[#E5E3DD] p-8 overflow-y-auto">
      {/* Logo & Brand */}
      <div className="flex flex-col mb-12">
        <h1 className="font-serif font-bold text-[#141414] text-xl leading-tight">The Mindful Atelier</h1>
        <p className="text-[11px] text-[#8B7E74] font-medium mt-1">Premium Educator Tool</p>
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
          <span>Dashboard</span>
        </button>
        <button 
          onClick={() => onTabChange('lesson-detail')}
          className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl font-bold transition-all ${
            activeTab === 'lesson-detail' ? 'bg-[#FFF5E9] text-[#8B5E3C]' : 'text-[#8B7E74] hover:bg-[#F3F2EE]'
          }`}
        >
          <BookOpen size={20} />
          <span>Lesson Plans</span>
        </button>
        <button className="w-full flex items-center gap-4 px-4 py-3 text-[#8B7E74] hover:bg-[#F3F2EE] rounded-xl font-bold transition-all">
          <Users size={20} />
          <span>Student Records</span>
        </button>
        <button className="w-full flex items-center gap-4 px-4 py-3 text-[#8B7E74] hover:bg-[#F3F2EE] rounded-xl font-bold transition-all">
          <Paperclip size={20} />
          <span>Resources</span>
        </button>
        <button className="w-full flex items-center gap-4 px-4 py-3 text-[#8B7E74] hover:bg-[#F3F2EE] rounded-xl font-bold transition-all">
          <Settings size={20} />
          <span>Settings</span>
        </button>
      </nav>

      <div className="flex-1"></div>

      {/* Footer Nav */}
      <div className="space-y-2 pt-8 border-t border-[#E5E3DD]">
        <button className="w-full flex items-center gap-4 px-4 py-3 text-[#8B7E74] hover:text-[#4A3728] transition-colors font-bold text-sm">
          <HelpCircle size={20} />
          <span>Help Center</span>
        </button>
        <button className="w-full flex items-center gap-4 px-4 py-3 text-[#8B7E74] hover:text-[#4A3728] transition-colors font-bold text-sm">
          <LogOut size={20} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
};
