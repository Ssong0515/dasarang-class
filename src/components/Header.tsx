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
  ArrowUpRight,
  Star,
} from 'lucide-react';

type AdminTab =
  | 'home'
  | 'memo'
  | 'classroom-management'
  | 'content-library'
  | 'curriculum-management'
  | 'timetable'
  | 'student-access'
  | 'student-showcase'
  | 'good-lessons';

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
      key: 'good-lessons',
      label: '좋은 수업',
      icon: <Star size={17} />,
      isActive: activeTab === 'good-lessons',
      onClick: () => onTabChange('good-lessons'),
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
  ];

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b border-[#E5E3DD] bg-[#FBFBFA] px-3 sm:gap-3 sm:px-5 md:pl-0">
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

      {/* 로고 + 서비스명 = 홈으로 (펼친 사이드바 너비에 맞춰 정렬) */}
      <div className="flex shrink-0 items-center md:w-64 md:pl-3">
        <button
          type="button"
          onClick={onGoHome}
          title="홈 대시보드로"
          aria-label="홈 대시보드로"
          className="flex items-center gap-2.5 rounded-xl px-3 py-2 transition-all hover:bg-[#F3F2EE]"
        >
          <img src="/logo.svg" alt="다사랑 로고" className="h-9 w-9 shrink-0 rounded-xl" />
          <span className="hidden whitespace-nowrap font-serif text-lg font-bold text-[#4A3728] sm:inline">
            다사랑 클래스
          </span>
        </button>
      </div>

      {/* 상단 네비게이션 (사이드바에서 옮겨온 메뉴들) */}
      <nav className="flex min-w-0 flex-1 items-center justify-start gap-1 overflow-x-auto sm:gap-2">
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

      {/* 학생 페이지로 이동 */}
      <div className="flex shrink-0 items-center gap-2 border-l border-[#E5E3DD] pl-2 sm:pl-3">
        {DEV_BADGE && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-amber-600">
            DEV
          </span>
        )}
        <button
          type="button"
          onClick={onSwitchToStudent}
          title="학생 페이지로 가기"
          aria-label="학생 페이지로 가기"
          className="flex items-center gap-1.5 rounded-xl bg-[#8B5E3C] px-3 py-2 text-sm font-bold text-white transition-all hover:bg-[#724D31] sm:px-4"
        >
          <Users size={17} />
          <span className="hidden whitespace-nowrap sm:inline">학생 페이지</span>
          <ArrowUpRight size={16} className="shrink-0" />
        </button>
      </div>
    </header>
  );
};
