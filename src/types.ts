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
}

export interface Classroom {
  id: string;
  name: string;
  ownerUid: string;
  /** Runtime-only: hydrated from the canonical `students` collection, never persisted. */
  students?: Student[];
  assignedContentIds?: string[];
  isOpen?: boolean;
  order?: number;
  icon?: string;
  color?: string;
  createdAt?: string;
  driveFolderId?: string;
  driveFolderName?: string;
}

export interface Memo {
  id: string;
  ownerUid: string;
  content: string;
  date: string;
}

export interface DailyReview {
  id: string;
  date: string;
  ownerUid: string;
  summary: string;
  sourceRecordIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type GeneratedMemoDraftStyle = 'activity' | 'guidance' | 'check';

export interface GeneratedMemoDraftOption {
  style: GeneratedMemoDraftStyle;
  label: string;
  memo: string;
}

export interface ClassroomLoadDiagnostics {
  status: 'idle' | 'loading' | 'success' | 'empty' | 'error';
  snapshotCount?: number;
  oneShotCount?: number;
  snapshotCompleted?: boolean;
  oneShotCompleted?: boolean;
  configuredDatabaseId?: string;
  resolvedDatabaseId?: string;
  lastError?: string;
  countMismatch?: boolean;
  studentSchemaIssueCount?: number;
  studentSchemaIssueMessage?: string;
}
