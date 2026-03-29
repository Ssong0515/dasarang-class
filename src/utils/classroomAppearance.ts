import type React from 'react';
import {
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
} from 'lucide-react';

type IconComponent = React.FC<{
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}>;

export const CLASSROOM_COLOR_OPTIONS = [
  { name: '브라운', value: '#8B5E3C', bg: '#FFF5E9' },
  { name: '파랑', value: '#3B82F6', bg: '#EFF6FF' },
  { name: '초록', value: '#22C55E', bg: '#F0FDF4' },
  { name: '보라', value: '#8B5CF6', bg: '#F5F3FF' },
  { name: '핑크', value: '#EC4899', bg: '#FDF2F8' },
  { name: '주황', value: '#F97316', bg: '#FFF7ED' },
  { name: '민트', value: '#14B8A6', bg: '#F0FDFA' },
  { name: '레드', value: '#EF4444', bg: '#FEF2F2' },
] as const;

export const CLASSROOM_ICON_OPTIONS = [
  { name: '책', icon: 'BookOpen' },
  { name: '학습', icon: 'GraduationCap' },
  { name: '코드', icon: 'Code' },
  { name: '음악', icon: 'Music' },
  { name: '미술', icon: 'Brush' },
  { name: '지구', icon: 'Globe' },
  { name: '컴퓨터', icon: 'Cpu' },
  { name: '하트', icon: 'Heart' },
  { name: '번개', icon: 'Zap' },
  { name: '로켓', icon: 'Rocket' },
  { name: '별', icon: 'Star' },
  { name: '아이디어', icon: 'Lightbulb' },
] as const;

export const CLASSROOM_ICON_MAP: Record<string, IconComponent> = {
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

export const DEFAULT_CLASSROOM_COLOR = '#8B5E3C';
export const DEFAULT_CLASSROOM_COLOR_BG = '#FFF5E9';
export const DEFAULT_CLASSROOM_ICON = 'BookOpen';

export const getClassroomColorMeta = (color = DEFAULT_CLASSROOM_COLOR) =>
  CLASSROOM_COLOR_OPTIONS.find((option) => option.value === color) || {
    name: '기본',
    value: color,
    bg: DEFAULT_CLASSROOM_COLOR_BG,
  };

export const getClassroomCardColors = (color?: string) => {
  const colorMeta = getClassroomColorMeta(color || DEFAULT_CLASSROOM_COLOR);

  return {
    color: colorMeta.value,
    backgroundColor: colorMeta.bg,
  };
};

export const getClassroomIconComponent = (icon?: string) =>
  CLASSROOM_ICON_MAP[icon || DEFAULT_CLASSROOM_ICON] || BookOpen;
