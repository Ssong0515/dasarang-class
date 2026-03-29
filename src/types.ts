export interface Student {
  id: string;
  ownerUid: string;
  classroomId: string;
  name: string;
  initials: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  age?: string;
  contact?: string;
  memo?: string;
  inactiveAt?: string;
  deletedAt?: string;
  // Legacy compatibility during the classroom domain migration.
  folderId?: string;
}

export interface AttendanceRecord {
  studentId: string;
  status: 'Present' | 'Absent' | 'Late';
  isExcluded?: boolean;
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
  order?: number;
}

export interface LessonContent {
  id: string;
  categoryId: string | null;
  ownerUid: string;
  title: string;
  description: string;
  html: string;
  createdAt: string;
  order?: number;
}

export interface ClassroomDateRecord {
  id: string;
  classroomId: string;
  ownerUid: string;
  date: string;
  classroomName: string;
  contentIds: string[];
  attendance: AttendanceRecord[];
  memo: string;
  createdAt: string;
  updatedAt: string;
  // Legacy compatibility during the classroom domain migration.
  folderId?: string;
  folderName?: string;
}

export interface Classroom {
  id: string;
  name: string;
  ownerUid: string;
  students?: Student[];
  assignedContentIds?: string[];
  isOpen?: boolean;
  order?: number;
  icon?: string;
  color?: string;
  createdAt?: string;
}

export interface Memo {
  id: string;
  ownerUid: string;
  content: string;
  date: string;
}

export type LessonFolder = Classroom;
export type FolderDateRecord = ClassroomDateRecord;
