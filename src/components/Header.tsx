import React from 'react';
import { Search, Bell, Settings } from 'lucide-react';

interface HeaderProps {
  user: any;
}

export const Header: React.FC<HeaderProps> = ({ user }) => {
  return (
    <header className="h-20 flex items-center justify-between px-8 bg-[#FBFBFA] border-b border-[#E5E3DD]">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest">
        <span className="text-[#A89F94]">다사랑 교실</span>
        <span className="text-[#A89F94]">/</span>
        <span className="text-[#8B5E3C] border-b-2 border-[#8B5E3C] pb-0.5">교실 &gt; 수업 관리</span>
      </div>

      <div className="flex items-center gap-6">
        {/* User Name */}
        <span className="text-sm font-bold text-[#4A3728]">{user.displayName || user.email}</span>

        {/* Notifications */}
        <button className="p-2 text-[#8B7E74] hover:bg-[#F3F2EE] rounded-full transition-colors relative">
          <Bell size={20} />
          <span className="absolute top-2 right-2 w-2 h-2 bg-[#8B5E3C] rounded-full border-2 border-[#FBFBFA]"></span>
        </button>

        {/* Settings */}
        <button className="p-2 text-[#8B7E74] hover:bg-[#F3F2EE] rounded-full transition-colors">
          <Settings size={20} />
        </button>

        {/* Profile */}
        <div className="flex items-center gap-3 pl-4 border-l border-[#E5E3DD]">
          <div className="w-10 h-10 rounded-xl overflow-hidden border-2 border-[#EBD9C1] bg-[#FFF5E9] flex items-center justify-center">
            {user.photoURL ? (
              <img 
                src={user.photoURL} 
                alt="Profile" 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="text-[#8B5E3C] font-bold">{user.email?.[0].toUpperCase()}</span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
