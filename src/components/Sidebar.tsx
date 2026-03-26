import React from 'react';
import {
  LayoutGrid,
  BookOpen,
  Users,
  Paperclip,
  HelpCircle,
  LogOut,
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
  Lightbulb,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Reorder } from 'motion/react';
import { LessonFolder } from '../types';

const MOBILE_MEDIA_QUERY = '(max-width: 768px)';

const sidebarIconMap: Record<
  string,
  React.FC<{ size?: number; className?: string; style?: React.CSSProperties }>
> = {
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
  Lightbulb,
};

const getIsMobileViewport = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
};

interface SidebarProps {
  folders: LessonFolder[];
  activeFolderId?: string;
  activeTab: 'home' | 'memo' | 'lesson-detail' | 'folder-management' | 'content-library';
  onTabChange: (tab: 'home' | 'memo' | 'lesson-detail' | 'folder-management' | 'content-library') => void;
  onManageFolder: (folder: LessonFolder) => void;
  onLogout: () => void;
  onSwitchToStudent: () => void;
  onReorderFolders?: (folders: LessonFolder[]) => void;
  onCreateFolder?: () => void;
}

type SidebarNavButtonProps = {
  icon: React.ReactNode;
  label: string;
  isCollapsed: boolean;
  isActive?: boolean;
  extraClassName?: string;
  onClick: () => void;
};

const SidebarNavButton: React.FC<SidebarNavButtonProps> = ({
  icon,
  label,
  isCollapsed,
  isActive = false,
  extraClassName = '',
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    title={label}
    aria-label={label}
    className={`w-full flex items-center rounded-xl font-bold transition-all ${
      isCollapsed ? 'justify-center px-3 py-3.5' : 'gap-4 px-4 py-3'
    } ${
      isActive ? 'bg-[#FFF5E9] text-[#8B5E3C]' : 'text-[#8B7E74] hover:bg-[#F3F2EE]'
    } ${extraClassName}`}
  >
    {icon}
    {!isCollapsed && <span>{label}</span>}
  </button>
);

const SidebarFooterButton: React.FC<SidebarNavButtonProps> = ({
  icon,
  label,
  isCollapsed,
  isActive = false,
  extraClassName = '',
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    title={label}
    aria-label={label}
    className={`w-full flex items-center rounded-xl font-bold text-sm transition-colors ${
      isCollapsed ? 'justify-center px-3 py-3.5' : 'gap-4 px-4 py-3'
    } ${
      isActive ? 'bg-[#FFF5E9] text-[#8B5E3C]' : 'text-[#8B7E74] hover:text-[#4A3728] hover:bg-[#F3F2EE]'
    } ${extraClassName}`}
  >
    {icon}
    {!isCollapsed && <span>{label}</span>}
  </button>
);

export const Sidebar: React.FC<SidebarProps> = ({
  folders,
  activeFolderId,
  activeTab,
  onTabChange,
  onManageFolder,
  onLogout,
  onSwitchToStudent,
  onReorderFolders,
  onCreateFolder,
}) => {
  const [localFolders, setLocalFolders] = React.useState(folders);
  const [isDesktopCollapsed, setIsDesktopCollapsed] = React.useState(false);
  const [isMobileViewport, setIsMobileViewport] = React.useState(getIsMobileViewport);

  const isCollapsed = isMobileViewport || isDesktopCollapsed;
  const showToggleButton = !isMobileViewport;
  const showBrand = !isCollapsed;
  const showHeader = showBrand || showToggleButton;

  React.useEffect(() => {
    const hasChanges =
      folders.length !== localFolders.length ||
      folders.some((folder, index) => {
        const localFolder = localFolders[index];
        return (
          !localFolder ||
          folder.id !== localFolder.id ||
          folder.name !== localFolder.name ||
          folder.icon !== localFolder.icon ||
          folder.color !== localFolder.color
        );
      });

    if (hasChanges) {
      setLocalFolders(folders);
    }
  }, [folders, localFolders]);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
    const handleViewportChange = (event: MediaQueryListEvent) => {
      setIsMobileViewport(event.matches);
    };

    setIsMobileViewport(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleViewportChange);
      return () => mediaQuery.removeEventListener('change', handleViewportChange);
    }

    mediaQuery.addListener(handleViewportChange);
    return () => mediaQuery.removeListener(handleViewportChange);
  }, []);

  const handleReorder = (newOrder: LessonFolder[]) => {
    setLocalFolders(newOrder);
    onReorderFolders?.(newOrder);
  };

  const handleToggleSidebar = () => {
    if (isMobileViewport) {
      return;
    }

    setIsDesktopCollapsed((prev) => !prev);
  };

  return (
    <aside
      className={`flex h-screen shrink-0 flex-col overflow-y-auto border-r border-[#E5E3DD] bg-[#FBFBFA] transition-[width,padding] duration-300 ${
        isCollapsed ? 'w-[88px] px-4 py-6' : 'w-64 p-8'
      }`}
    >
      {showHeader && (
        <div className={`flex items-start ${isCollapsed ? 'justify-end mb-8' : 'justify-between gap-3 mb-12'}`}>
          {showBrand && (
            <div className="flex flex-col cursor-pointer" onClick={() => onTabChange('home')}>
              <h1 className="font-serif font-bold text-[#141414] text-xl leading-tight">다사랑 교실</h1>
              <p className="text-[11px] text-[#8B7E74] font-medium mt-1">관리자 대시보드</p>
            </div>
          )}

          {showToggleButton && (
            <button
              type="button"
              onClick={handleToggleSidebar}
              title={isCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
              aria-label={isCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E5E3DD] bg-white text-[#8B7E74] transition-all hover:border-[#D8D2C8] hover:text-[#4A3728]"
            >
              {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </button>
          )}
        </div>
      )}

      <nav className="flex min-h-0 flex-1 flex-col">
        <div className="space-y-2">
          <SidebarNavButton
            icon={<LayoutGrid size={20} />}
            label="대시보드"
            isCollapsed={isCollapsed}
            isActive={activeTab === 'home'}
            onClick={() => onTabChange('home')}
          />

          <SidebarNavButton
            icon={<Library size={20} />}
            label="콘텐츠"
            isCollapsed={isCollapsed}
            isActive={activeTab === 'content-library'}
            extraClassName="mt-2"
            onClick={() => onTabChange('content-library')}
          />

          <SidebarNavButton
            icon={<Paperclip size={20} />}
            label="메모장"
            isCollapsed={isCollapsed}
            isActive={activeTab === 'memo'}
            extraClassName="mt-2"
            onClick={() => onTabChange('memo')}
          />

          <SidebarNavButton
            icon={<Users size={20} />}
            label="학생 페이지"
            isCollapsed={isCollapsed}
            extraClassName="mt-2"
            onClick={onSwitchToStudent}
          />
        </div>

        <div className={`border-t border-[#E5E3DD] ${isCollapsed ? 'mt-5 pt-5' : 'mt-6 pt-8'} flex-1`}>
          <Reorder.Group axis="y" values={localFolders} onReorder={handleReorder} className="space-y-1">
            {localFolders.map((folder) => {
              const SideIcon = sidebarIconMap[folder.icon || 'BookOpen'] || BookOpen;
              const isActive = activeTab === 'folder-management' && folder.id === activeFolderId;

              return (
                <Reorder.Item
                  key={folder.id}
                  value={folder}
                  dragListener={!isCollapsed}
                  className="relative group/reorder w-full"
                >
                  <div className="flex items-center group w-full relative">
                    {!isCollapsed && (
                      <div
                        className="absolute -left-6 z-10 cursor-grab active:cursor-grabbing p-1 opacity-0 group-hover/reorder:opacity-40 hover:!opacity-100 transition-opacity"
                        title="드래그하여 순서 변경"
                      >
                        <GripVertical size={14} className="text-[#8B7E74]" />
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => onManageFolder(folder)}
                      title={folder.name}
                      aria-label={folder.name}
                      className={`flex w-full items-center rounded-xl font-bold transition-all ${
                        isCollapsed ? 'justify-center px-3 py-3.5' : 'gap-3 px-4 py-2.5'
                      } ${
                        isActive ? 'bg-[#F3F2EE] text-[#8B5E3C]' : 'text-[#8B7E74] hover:bg-[#F3F2EE]'
                      }`}
                    >
                      <SideIcon
                        size={18}
                        className="shrink-0 group-hover:text-[#8B5E3C]"
                        style={folder.color ? { color: folder.color } : undefined}
                      />
                      {!isCollapsed && <span className="truncate max-w-[120px]">{folder.name}</span>}
                    </button>
                  </div>
                </Reorder.Item>
              );
            })}
          </Reorder.Group>

          {onCreateFolder && (
            <button
              type="button"
              onClick={onCreateFolder}
              title="폴더 생성"
              aria-label="폴더 생성"
              className={`mt-4 flex w-full items-center rounded-xl border border-dashed border-[#8B5E3C]/30 bg-[#FFF5E9] font-bold text-[#8B5E3C] shadow-sm transition-all hover:bg-[#F3E8DB] ${
                isCollapsed ? 'justify-center px-3 py-3.5' : 'justify-center gap-2 py-3 text-sm'
              }`}
            >
              <Plus size={16} />
              {!isCollapsed && <span>폴더 생성</span>}
            </button>
          )}
        </div>

        <div className={`mt-auto border-t border-[#E5E3DD] ${isCollapsed ? 'pt-5 space-y-2' : 'pt-8 space-y-2'}`}>
          <SidebarFooterButton
            icon={<HelpCircle size={20} />}
            label="사용 안내"
            isCollapsed={isCollapsed}
            onClick={() => {}}
          />
          <SidebarFooterButton
            icon={<LogOut size={20} />}
            label="로그아웃"
            isCollapsed={isCollapsed}
            extraClassName="hover:text-red-500"
            onClick={onLogout}
          />
        </div>
      </nav>
    </aside>
  );
};
