import React from 'react';
import {
  LogOut,
  Plus,
  GripVertical,
  ChevronLeft,
  ChevronDown,
  EyeOff,
  Menu,
} from 'lucide-react';
import { Reorder } from 'motion/react';
import { Classroom } from '../types';
import { getClassroomIconComponent } from '../utils/classroomAppearance';

const MOBILE_MEDIA_QUERY = '(max-width: 768px)';
const WIDE_MEDIA_QUERY = '(min-width: 1280px)';

type ViewportMode = 'mobile' | 'compactDesktop' | 'wideDesktop';

const getViewportMode = (): ViewportMode => {
  if (typeof window === 'undefined') {
    return 'wideDesktop';
  }

  if (window.matchMedia(MOBILE_MEDIA_QUERY).matches) {
    return 'mobile';
  }

  if (window.matchMedia(WIDE_MEDIA_QUERY).matches) {
    return 'wideDesktop';
  }

  return 'compactDesktop';
};

const getDefaultDesktopCollapsed = (viewportMode: ViewportMode) => {
  return viewportMode === 'compactDesktop';
};

type AdminTab =
  | 'home'
  | 'memo'
  | 'classroom-management'
  | 'content-library'
  | 'curriculum-management'
  | 'timetable'
  | 'student-access'
  | 'student-showcase';

interface SidebarProps {
  classrooms: Classroom[];
  activeClassroomId?: string;
  activeTab: AdminTab;
  onManageClassroom: (classroom: Classroom) => void;
  onLogout: () => void;
  onReorderClassrooms?: (classrooms: Classroom[]) => void;
  onCreateClassroom?: () => void;
  isStudentView?: boolean;
}

type SidebarNavButtonProps = {
  icon: React.ReactNode;
  label: string;
  isCollapsed: boolean;
  isActive?: boolean;
  extraClassName?: string;
  onClick: () => void;
};

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
  classrooms,
  activeClassroomId,
  activeTab,
  onManageClassroom,
  onLogout,
  onReorderClassrooms,
  onCreateClassroom,
  isStudentView = false,
}) => {
  const [localClassrooms, setLocalClassrooms] = React.useState(classrooms);
  const [showHidden, setShowHidden] = React.useState(false);
  const [viewportMode, setViewportMode] = React.useState<ViewportMode>(getViewportMode);
  const [isDesktopCollapsed, setIsDesktopCollapsed] = React.useState(() =>
    getDefaultDesktopCollapsed(getViewportMode())
  );

  const isCollapsed = viewportMode === 'mobile' || isDesktopCollapsed;
  const showToggleButton = viewportMode !== 'mobile';

  React.useEffect(() => {
    const hasChanges =
      classrooms.length !== localClassrooms.length ||
      classrooms.some((classroom, index) => {
        const localClassroom = localClassrooms[index];
        return (
          !localClassroom ||
          classroom.id !== localClassroom.id ||
          classroom.name !== localClassroom.name ||
          classroom.icon !== localClassroom.icon ||
          classroom.color !== localClassroom.color ||
          classroom.hidden !== localClassroom.hidden
        );
      });

    if (hasChanges) {
      setLocalClassrooms(classrooms);
    }
  }, [classrooms, localClassrooms]);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const mobileMediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
    const wideMediaQuery = window.matchMedia(WIDE_MEDIA_QUERY);
    const handleViewportChange = () => {
      setViewportMode(getViewportMode());
    };

    handleViewportChange();

    if (
      typeof mobileMediaQuery.addEventListener === 'function' &&
      typeof wideMediaQuery.addEventListener === 'function'
    ) {
      mobileMediaQuery.addEventListener('change', handleViewportChange);
      wideMediaQuery.addEventListener('change', handleViewportChange);
      return () => {
        mobileMediaQuery.removeEventListener('change', handleViewportChange);
        wideMediaQuery.removeEventListener('change', handleViewportChange);
      };
    }

    mobileMediaQuery.addListener(handleViewportChange);
    wideMediaQuery.addListener(handleViewportChange);
    return () => {
      mobileMediaQuery.removeListener(handleViewportChange);
      wideMediaQuery.removeListener(handleViewportChange);
    };
  }, []);

  React.useEffect(() => {
    setIsDesktopCollapsed(getDefaultDesktopCollapsed(viewportMode));
  }, [viewportMode]);

  const visibleClassrooms = localClassrooms.filter((classroom) => !classroom.hidden);
  const hiddenClassrooms = localClassrooms.filter((classroom) => classroom.hidden);

  const handleReorder = (newVisibleOrder: Classroom[]) => {
    const nextOrder = [...newVisibleOrder, ...hiddenClassrooms];
    setLocalClassrooms(nextOrder);
    onReorderClassrooms?.(nextOrder);
  };

  const handleToggleSidebar = () => {
    if (viewportMode === 'mobile') {
      return;
    }

    setIsDesktopCollapsed((prev) => !prev);
  };

  return (
    <aside
      className={`flex h-full shrink-0 flex-col overflow-y-auto border-r border-[#E5E3DD] bg-[#FBFBFA] transition-[width,padding] duration-300 ${
        isCollapsed ? 'w-[88px] px-4 py-6' : 'w-64 px-6 py-6'
      }`}
    >
      {showToggleButton && (
        <div className={`flex items-center ${isCollapsed ? 'justify-center mb-6' : 'justify-between mb-5'}`}>
          {isCollapsed ? (
            <button
              type="button"
              onClick={handleToggleSidebar}
              title="사이드바 펼치기"
              aria-label="사이드바 펼치기"
              className="flex h-10 w-10 items-center justify-center rounded-xl text-[#8B7E74] transition-all hover:bg-[#F3F2EE] hover:text-[#4A3728]"
            >
              <Menu size={20} />
            </button>
          ) : (
            <>
              <span className="px-1 text-[11px] font-bold uppercase tracking-widest text-[#A89F94]">
                클래스
              </span>
              <button
                type="button"
                onClick={handleToggleSidebar}
                title="사이드바 접기"
                aria-label="사이드바 접기"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#E5E3DD] bg-white text-[#8B7E74] transition-all hover:border-[#D8D2C8] hover:text-[#4A3728]"
              >
                <ChevronLeft size={18} />
              </button>
            </>
          )}
        </div>
      )}

      <nav className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1">
          <Reorder.Group axis="y" values={visibleClassrooms} onReorder={handleReorder} className="space-y-1">
            {visibleClassrooms.map((classroom) => {
              const SideIcon = getClassroomIconComponent(classroom.icon);
              const isActive =
                !isStudentView && activeTab === 'classroom-management' && classroom.id === activeClassroomId;

              return (
                <Reorder.Item
                  key={classroom.id}
                  value={classroom}
                  dragListener={!isCollapsed}
                  className="relative group/reorder w-full"
                >
                  <div className="flex items-center group w-full relative">
                    {!isCollapsed && (
                      <div
                        className="absolute -left-5 z-10 cursor-grab active:cursor-grabbing p-1 opacity-0 group-hover/reorder:opacity-40 hover:!opacity-100 transition-opacity"
                        title="드래그하여 순서 변경"
                      >
                        <GripVertical size={14} className="text-[#8B7E74]" />
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => onManageClassroom(classroom)}
                      title={classroom.name}
                      aria-label={classroom.name}
                      className={`flex w-full items-center rounded-xl font-bold transition-all ${
                        isCollapsed ? 'justify-center px-3 py-3.5' : 'gap-3 px-4 py-2.5'
                      } ${
                        isActive ? 'bg-[#F3F2EE] text-[#8B5E3C]' : 'text-[#8B7E74] hover:bg-[#F3F2EE]'
                      }`}
                    >
                      <SideIcon
                        size={18}
                        className="shrink-0 group-hover:text-[#8B5E3C]"
                        style={classroom.color ? { color: classroom.color } : undefined}
                      />
                      {!isCollapsed && <span className="truncate max-w-[140px]">{classroom.name}</span>}
                    </button>
                  </div>
                </Reorder.Item>
              );
            })}
          </Reorder.Group>

          {onCreateClassroom && (
            <button
              type="button"
              onClick={onCreateClassroom}
              title="클래스 생성"
              aria-label="클래스 생성"
              className={`mt-4 flex w-full items-center rounded-xl border border-dashed border-[#8B5E3C]/30 bg-[#FFF5E9] font-bold text-[#8B5E3C] shadow-sm transition-all hover:bg-[#F3E8DB] ${
                isCollapsed ? 'justify-center px-3 py-3.5' : 'justify-center gap-2 py-3 text-sm'
              }`}
            >
              <Plus size={16} />
              {!isCollapsed && <span>클래스 생성</span>}
            </button>
          )}

          {!isCollapsed && hiddenClassrooms.length > 0 && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowHidden((prev) => !prev)}
                className="flex w-full items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold text-[#A2906F] transition-all hover:bg-[#F3F2EE]"
              >
                <EyeOff size={14} />
                <span className="flex-1 text-left">숨긴 클래스 ({hiddenClassrooms.length})</span>
                <ChevronDown
                  size={14}
                  className={`transition-transform ${showHidden ? 'rotate-180' : ''}`}
                />
              </button>
              {showHidden && (
                <div className="mt-1 space-y-1">
                  {hiddenClassrooms.map((classroom) => {
                    const SideIcon = getClassroomIconComponent(classroom.icon);
                    return (
                      <button
                        key={classroom.id}
                        type="button"
                        onClick={() => onManageClassroom(classroom)}
                        title={`${classroom.name} (숨김)`}
                        className="flex w-full items-center gap-3 rounded-xl px-4 py-2 font-bold text-[#A2906F] opacity-70 transition-all hover:bg-[#F3F2EE] hover:opacity-100"
                      >
                        <SideIcon
                          size={16}
                          className="shrink-0"
                          style={classroom.color ? { color: classroom.color } : undefined}
                        />
                        <span className="truncate max-w-[140px] text-sm">{classroom.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className={`mt-auto border-t border-[#E5E3DD] ${isCollapsed ? 'pt-5 space-y-2' : 'pt-6 space-y-2'}`}>
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
