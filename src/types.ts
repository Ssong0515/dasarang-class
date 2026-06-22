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
  slideUrl?: string;
  createdAt: string;
  order?: number;
  sourceDriveFileId?: string;
  convertedDriveFileId?: string;
  sourceModifiedTime?: string;
  syncedAt?: string;
  syncProvider?: 'notebooklm-drive-folder';
}

export type NotebookLmSyncItemStatus = 'created' | 'updated' | 'skipped' | 'failed';

export interface NotebookLmSyncItem {
  fileId: string;
  fileName: string;
  status: NotebookLmSyncItemStatus;
  contentId?: string;
  slideUrl?: string;
  message?: string;
}

export interface NotebookLmFolderSyncResult {
  ok?: boolean;
  folder: {
    id: string;
    name: string;
  };
  summary: {
    scanned: number;
    created: number;
    updated: number;
    skipped: number;
    failed: number;
  };
  items: NotebookLmSyncItem[];
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
  /** 이 날짜 이론 수업용 구글 슬라이드 임베드 URL (강사 화면 전용). 비어 있으면 미설정. */
  theorySlideUrl?: string;
  createdAt: string;
  updatedAt: string;
  curriculumId?: string;
  curriculumSessionId?: string;
}

/**
 * 학생에게 "공개된" 실습 블록 목록. 강사가 수업을 진행하며 공개를 누르면 채워진다.
 * 학생이 읽을 수 있는 유일한 수업 데이터(출석·메모 등 민감정보는 classroomDateRecord에만 둠).
 * 문서 id는 `${classroomId}_${date}`.
 */
export interface PublishedLesson {
  id: string;
  classroomId: string;
  classroomName: string;
  date: string;
  /** 지금 학생 화면에서 풀 수 있는(공개된) 콘텐츠 id 목록 */
  publishedContentIds: string[];
  ownerUid: string;
  updatedAt: string;
  /** 교사가 '수업 종료'를 누른 시각(ISO). 설정되면 학생 화면에 종료 안내가 뜬다. 다시 공개하면 새 문서로 덮여 해제된다. */
  endNoticeAt?: string;
}

export interface Classroom {
  id: string;
  name: string;
  ownerUid: string;
  /** Runtime-only: hydrated from the canonical `students` collection, never persisted. */
  students?: Student[];
  isOpen?: boolean;
  order?: number;
  icon?: string;
  color?: string;
  createdAt?: string;
  driveFolderId?: string;
  driveFolderName?: string;
  curriculumId?: string | null;
  /** calendar.damuna.org의 `classes` 문서 ID. FM 참고 시간표로 연결됨. */
  calendarClassId?: string | null;
  /** 사이드바·홈에서 숨길지 여부 (삭제하지 않고 가리기) */
  hidden?: boolean;
}

/** calendar.damuna.org `classes` 컬렉션의 참고 시간표 요약 (읽기 전용) */
export interface CalendarClassSummary {
  id: string;
  name: string;
  instructor: string;
  /** calendar 앱이 강사명으로 산출하는 대표 색(hex) */
  color: string;
  /** 요일(월=0…토=5) + 시작/종료 시간 */
  schedules: { days: number[]; start: string; end: string }[];
  startDate: string;
  endDate: string;
}

/** 시간표 → 커리큘럼 회차 날짜 자동 배정 결과 */
export interface AssignCurriculumDatesResult {
  classroomId: string;
  calendarClassId: string;
  curriculumId: string;
  availableDates: number;
  eligibleSessions: number;
  assigned: number;
  assignments: { sessionId: string; order: number; plannedDate: string }[];
}

export interface Memo {
  id: string;
  ownerUid: string;
  content: string;
  date: string;
  curriculumId?: string;
  curriculumSessionId?: string;
}

export type CurriculumSessionStatus = 'planned' | 'done' | 'skipped';

export interface CurriculumSession {
  id: string;
  /** 1-based 회차 */
  order: number;
  topic: string;
  details?: string;
  /** YYYY-MM-DD */
  plannedDate?: string;
  contentIds?: string[];
  status: CurriculumSessionStatus;
}

export interface Curriculum {
  id: string;
  ownerUid: string;
  title: string;
  description?: string;
  sessions: CurriculumSession[];
  order?: number;
  createdAt: string;
  updatedAt: string;
}

export type StudentPostStatus = 'pending' | 'approved' | 'hidden';

export interface StudentPost {
  id: string;
  ownerUid: string;
  title: string;
  description?: string;
  studentName: string;
  anonymous?: boolean;
  classroomId: string;
  classroomName: string;
  driveFileId: string;
  fileName: string;
  mimeType: string;
  webViewLink: string;
  imageUrl?: string;
  status: StudentPostStatus;
  createdAt: string;
  approvedAt?: string;
  order?: number;
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

export interface AccessLog {
  id: string;
  email: string;
  uid: string;
  displayName: string;
  loginAt: string;
}

export interface StudentAccess {
  id: string;
  email: string;
  memo?: string;
  ownerUid: string;
  createdAt: string;
  updatedAt: string;
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
