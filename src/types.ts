export interface Student {
  id: string;
  name: string;
  initials: string;
  age?: string;
  contact?: string;
  memo?: string;
}

export interface AttendanceRecord {
  studentId: string;
  studentName: string;
  status: 'Present' | 'Absent' | 'Late';
  initials: string;
}

export interface LessonResource {
  name: string;
  type: 'pdf' | 'link';
  info: string;
}

export interface LessonCategory {
  id: string;
  name: string;
  ownerUid: string;
}

export interface LessonContent {
  id: string;
  categoryId: string;
  ownerUid: string;
  title: string;
  html: string;
  createdAt: string;
}

export interface Lesson {
  id: string;
  folderId: string;
  ownerUid: string;
  date: string;
  title: string;
  folderName: string;
  contentId?: string; // Reference to LessonContent
  contentIds?: string[]; // Multiple contents
  content?: string; // Cached or direct HTML content
  order?: number;
  attendance?: AttendanceRecord[];
  resources?: LessonResource[];
  memo?: string;
  summary?: {
    text: string;
    attendanceRate: string;
    engagement: string;
    resourceCount: string;
  };
}

export interface LessonFolder {
  id: string;
  name: string;
  ownerUid: string;
  students?: Student[];
  lessons?: Lesson[];
  isOpen?: boolean;
  order?: number;
  icon?: string;
  color?: string;
}

export interface Memo {
  id: string;
  ownerUid: string;
  content: string;
  date: string;
}
