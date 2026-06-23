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

/** 이론 수업 슬라이드 한 개 (구글 슬라이드/드라이브 임베드 URL 또는 NotebookLM 등 외부 링크). */
export interface TheorySlide {
  /** 임베드 URL(슬라이드/드라이브) 또는 원본 링크(NotebookLM 등). */
  url: string;
  /** 표시용 라벨(예: "1시수"). 비우면 순서대로 "이론 N"으로 보인다. */
  label?: string;
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
  /** @deprecated 단일 이론 슬라이드(구버전). 지금은 theorySlides 배열을 쓴다. 읽기 호환용으로만 남겨둠. */
  theorySlideUrl?: string;
  /** 이 날짜 이론 수업 슬라이드들 (시수마다 1개씩 추가 가능, 강사 화면 전용). */
  theorySlides?: TheorySlide[];
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

/**
 * 한 반(class)에서 커리큘럼 회차 하나를 실제로 진행하는 인스턴스 상태.
 * 커리큘럼(템플릿)·시간표(일정)는 공유 참고자료일 뿐이고, "이 반이 이 회차를
 * 언제(date) 어떤 진행상태(status)로 했는지"는 전부 반별로 여기에만 저장한다.
 */
export interface ClassroomSessionState {
  /** YYYY-MM-DD. 이 반에서 이 회차를 진행하는 날짜. */
  date?: string;
  /** 이 반에서의 회차 진행 상태. 없으면 'planned'. */
  status?: CurriculumSessionStatus;
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
  /**
   * 이 반만의 회차별 진행 상태. `커리큘럼 회차 id → { date, status }`.
   * 같은 커리큘럼을 여러 반이 공유해도 날짜·상태가 섞이지 않도록 반별로 여기에만 저장한다.
   * 값이 없는 회차는 커리큘럼의 레거시(plannedDate/status)로 폴백한다.
   */
  sessionStates?: Record<string, ClassroomSessionState>;
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
  /**
   * @deprecated 회차 날짜는 이제 반별로 `Classroom.sessionStates[id].date`에 저장한다.
   * (같은 커리큘럼을 여러 반이 공유할 때 시간표별로 날짜가 달라야 하기 때문)
   * 이 필드는 반별 값이 없을 때의 하위호환 폴백 및 GPT 편집 호환용으로만 남는다.
   * YYYY-MM-DD.
   */
  plannedDate?: string;
  contentIds?: string[];
  /**
   * @deprecated 회차 진행 상태도 반별이라 `Classroom.sessionStates[id].status`에 저장한다.
   * 커리큘럼은 템플릿이므로 진행 상태를 갖지 않는다. 폴백/호환용으로만 남는다.
   */
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
