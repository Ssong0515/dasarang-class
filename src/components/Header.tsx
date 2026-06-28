import React from 'react';
import {
  CalendarDays,
  BookOpen,
  StickyNote,
  Library,
  KeyRound,
  Globe,
  Users,
  Menu,
} from 'lucide-react';

type AdminTab =
  | 'home'
  | 'memo'
  | 'classroom-management'
  | 'content-library'
  | 'curriculum-management'
  | 'timetable'
  | 'student-access'
  | 'student-showcase';

interface HeaderProps {
  user: any;
  activeTab?: AdminTab;
  pendingShowcaseCount?: number;
  onTabChange: (tab: AdminTab) => void;
  onSwitchToStudent: () => void;
  onGoHome: () => void;
  /** 모바일 햄버거 → 사이드바(클래스 목록) 드로어 토글 */
  onToggleMobileNav?: () => void;
}

const DEV_BADGE = import.meta.env.DEV;

type NavItem = {
  key: string;
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
  badge?: number;
};

export const Header: React.FC<HeaderProps> = ({
  user,
  activeTab = 'home',
  pendingShowcaseCount = 0,
  onTabChange,
  onSwitchToStudent,
  onGoHome,
  onToggleMobileNav,
}) => {
  // 사이드바에 있던 메뉴(홈 제외)를 상단 바로 옮긴다. 홈은 로고 클릭으로 이동.
  const navItems: NavItem[] = [
    {
      key: 'timetable',
      label: '캘린더',
      icon: <CalendarDays size={17} />,
      isActive: activeTab === 'timetable',
      onClick: () => onTabChange('timetable'),
    },
    {
      key: 'curriculum',
      label: '커리큘럼',
      icon: <BookOpen size={17} />,
      isActive: activeTab === 'curriculum-management',
      onClick: () => onTabChange('curriculum-management'),
    },
    {
      key: 'memo',
      label: '메모',
      icon: <StickyNote size={17} />,
      isActive: activeTab === 'memo',
      onClick: () => onTabChange('memo'),
    },
    {
      key: 'content',
      label: '콘텐츠',
      icon: <Library size={17} />,
      isActive: activeTab === 'content-library',
      onClick: () => onTabChange('content-library'),
    },
    {
      key: 'student-access',
      label: '접근 아이디',
      icon: <KeyRound size={17} />,
      isActive: activeTab === 'student-access',
      onClick: () => onTabChange('student-access'),
    },
    {
      key: 'student-showcase',
      label: '홈페이지 공유',
      icon: <Globe size={17} />,
      isActive: activeTab === 'student-showcase',
      onClick: () => onTabChange('student-showcase'),
      badge: pendingShowcaseCount,
    },
    {
      key: 'student-page',
      label: '학생 페이지',
      icon: <Users size={17} />,
      isActive: false,
      onClick: onSwitchToStudent,
    },
  ];

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b border-[#E5E3DD] bg-[#FBFBFA] px-3 sm:gap-3 sm:px-5">
      {/* 모바일 햄버거 → 클래스 사이드바 드로어 */}
      {onToggleMobileNav && (
        <button
          type="button"
          onClick={onToggleMobileNav}
          title="메뉴"
          aria-label="메뉴 열기"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#8B7E74] transition-all hover:bg-[#F3F2EE] hover:text-[#4A3728] md:hidden"
        >
          <Menu size={20} />
        </button>
      )}

      {/* 로고 = 홈으로 */}
      <button
        type="button"
        onClick={onGoHome}
        title="홈으로"
        aria-label="홈으로"
        className="flex shrink-0 items-center gap-2.5"
      >
        <img src="/logo.svg" alt="다사랑 로고" className="h-9 w-9 rounded-xl" />
      </button>

      {/* 상단 네비게이션 (사이드바에서 옮겨온 메뉴들) */}
      <nav className="flex min-w-0 flex-1 items-center justify-start gap-1 overflow-x-auto sm:justify-evenly">
        {navItems.map((item) => {
          const hasBadge = typeof item.badge === 'number' && item.badge > 0;
          return (
            <button
              key={item.key}
              type="button"
              onClick={item.onClick}
              title={item.label}
              aria-label={item.label}
              className={`relative flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold transition-all ${
                item.isActive
                  ? 'bg-[#FFF5E9] text-[#8B5E3C]'
                  : 'text-[#8B7E74] hover:bg-[#F3F2EE] hover:text-[#4A3728]'
              }`}
            >
              <span className="relative shrink-0">
                {item.icon}
                {hasBadge && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-2 w-2 rounded-full bg-amber-500 ring-2 ring-[#FBFBFA]" />
                )}
              </span>
              <span className="hidden whitespace-nowrap lg:inline">{item.label}</span>
              {hasBadge && (
                <span className="ml-0.5 hidden rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white lg:inline">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* 사용자 */}
      <div className="flex shrink-0 items-center gap-3 border-l border-[#E5E3DD] pl-3">
        {DEV_BADGE && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-amber-600">
            DEV
          </span>
        )}
        <span className="hidden text-sm font-bold text-[#4A3728] sm:inline">
          {user?.displayName || user?.email || (DEV_BADGE ? 'Dev Admin' : '')}
        </span>
        <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border-2 border-[#EBD9C1] bg-[#FFF5E9]">
          {user?.photoURL ? (
            <img
              src={user.photoURL}
              alt="Profile"
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="font-bold text-[#8B5E3C]">
              {user?.email?.[0]?.toUpperCase() ?? (DEV_BADGE ? 'D' : '?')}
            </span>
          )}
        </div>
      </div>
    </header>
  );
};
