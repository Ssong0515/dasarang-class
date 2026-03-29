export interface Student {
  id: string;
  ownerUid: string;
  folderId: string;
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

export interface FolderDateRecord {
  id: string;
  folderId: string;
  ownerUid: string;
  date: string;
  folderName: string;
  contentIds: string[];
  attendance: AttendanceRecord[];
  memo: string;
  createdAt: string;
  updatedAt: string;
}

export interface LessonFolder {
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
