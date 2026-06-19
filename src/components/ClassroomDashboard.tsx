import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users,
  Save,
  UserPlus,
  Calendar,
  FileText,
  ClipboardList,
  MessageSquare,
  Clock,
  CheckCircle2,
  AlertCircle,
  Edit3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  X,
  Settings,
  Palette,
  Star,
  Power,
  UserMinus,
  Undo2,
  HelpCircle,
  FolderOpen,
  ExternalLink,
  Loader2,
  CalendarClock,
  ListChecks,
  Link2,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Presentation,
  Lock,
  Unlock,
} from 'lucide-react';
import {
  AssignCurriculumDatesResult,
  AttendanceRecord,
  CalendarClassSummary,
  ClassroomDateRecord,
  Curriculum,
  CurriculumSession,
  LessonCategory,
  LessonContent,
  Classroom,
  PublishedLesson,
  Student,
} from '../types';
import {
  normalizeClassroomDateRecordContentIds,
  orderClassroomDateRecordContentIds,
} from '../utils/classroomDateRecordContent';
import {
  CLASSROOM_COLOR_OPTIONS,
  CLASSROOM_ICON_OPTIONS,
  DEFAULT_CLASSROOM_COLOR,
  DEFAULT_CLASSROOM_ICON,
  getClassroomColorMeta,
  getClassroomIconComponent,
} from '../utils/classroomAppearance';
import {
  formatStudentInactiveDate,
  getStudentCounts,
  getStudentInitials,
  isStudentInactive,
  sanitizeStudentForStorage,
  splitStudentsByStatus,
} from '../utils/students';
import { isAttendanceExcluded } from '../utils/attendance';
import { openDriveFolderPicker } from '../utils/drivePicker';

interface ClassroomDashboardProps {
  classroom: Classroom;
  classrooms: Classroom[];
  studentsById: Map<string, Student>;
  dateRecords: ClassroomDateRecord[];
  categories: LessonCategory[];
  contents: LessonContent[];
  curriculums?: Curriculum[];
  publishedLessons?: PublishedLesson[];
  userEmail?: string;
  onSaveStudents: (classroomId: string, students: Student[]) => Promise<void>;
  onMoveStudent: (sourceClassroomId: string, targetClassroomId: string, studentId: string) => Promise<void>;
  onSaveDateRecord: (record: ClassroomDateRecord) => void;
  onDeleteDateRecord: (recordId: string) => void;
  onUpdatePublishedLesson?: (
    classroomId: string,
    classroomName: string,
    date: string,
    publishedContentIds: string[]
  ) => Promise<void>;
  onGenerateMemoDraft: (
    date: string,
    existingMemo?: string
  ) => Promise<string>;
  onUpdateClassroom?: (classroomId: string, data: Partial<Classroom>) => void;
  onDeleteClassroom?: (classroomId: string) => void;
  onListCalendarClasses?: () => Promise<CalendarClassSummary[]>;
  onAssignCurriculumDates?: (
    classroomId: string,
    options?: { calendarClassId?: string; overwrite?: boolean }
  ) => Promise<AssignCurriculumDatesResult>;
  onSaveCurriculumSessions?: (curriculumId: string, sessions: CurriculumSession[]) => Promise<void>;
  onNavigateToContent?: (contentId: string) => void;
}

type Tab = 'dashboard' | 'students' | 'curriculum' | 'settings';

const DOW_LABELS = ['월', '화', '수', '목', '금', '토'];
const SESSION_STATUS_LABELS: Record<CurriculumSession['status'], string> = {
  planned: '예정',
  done: '완료',
  skipped: '건너뜀',
};

const formatSchedule = (schedule: CalendarClassSummary['schedules'][number]) => {
  const days = (schedule.days || []).map((day) => DOW_LABELS[day] ?? '?').join('·');
  const time = schedule.start && schedule.end ? ` ${schedule.start}~${schedule.end}` : '';
  return `${days}${time}`;
};
type StudentAction = 'add' | 'edit' | 'delete' | 'move' | 'deactivate' | 'reactivate';

const getLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDaysInMonth = (date: Date) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const days: Array<Date | null> = [];
  for (let index = 0; index < firstDay; index += 1) {
    days.push(null);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push(new Date(year, month, day));
  }
  return days;
};

const getAttendanceStats = (record?: ClassroomDateRecord) => {
  if (!record) {
    return { present: 0, absent: 0, late: 0, total: 0 };
  }

  const includedAttendance = record.attendance.filter((attendance) => !isAttendanceExcluded(attendance));
  const total = includedAttendance.length;
  const present = includedAttendance.filter((attendance) => attendance.status === 'Present').length;
  const absent = includedAttendance.filter((attendance) => attendance.status === 'Absent').length;
  const late = includedAttendance.filter((attendance) => attendance.status === 'Late').length;
  return { present, absent, late, total };
};

const getRecordTimestamp = (record: Pick<ClassroomDateRecord, 'updatedAt' | 'createdAt'>) => {
  const updatedAt = new Date(record.updatedAt || '').getTime();
  if (Number.isFinite(updatedAt)) {
    return updatedAt;
  }

  const createdAt = new Date(record.createdAt || '').getTime();
  if (Number.isFinite(createdAt)) {
    return createdAt;
  }

  return 0;
};

const DashboardInfoTooltip: React.FC<{
  content: string;
  label?: string;
}> = ({ content, label = '설명 보기' }) => (
  <div className="group/tooltip relative flex shrink-0 items-center">
    <button
      type="button"
      aria-label={label}
      className="flex h-6 w-6 items-center justify-center rounded-full border border-[#E5E3DD] bg-[#FBFBFA] text-[#8B7E74] transition-all hover:border-[#D8D2C8] hover:bg-white hover:text-[#4A3728] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EBD9C1]"
    >
      <HelpCircle size={14} />
    </button>
    <div
      role="tooltip"
      className="pointer-events-none absolute left-0 top-full z-30 mt-3 w-64 -translate-y-1 rounded-2xl bg-[#4A3728] px-4 py-3 text-xs leading-relaxed text-white opacity-0 shadow-xl transition-all duration-150 group-hover/tooltip:translate-y-0 group-hover/tooltip:opacity-100 group-focus-within/tooltip:translate-y-0 group-focus-within/tooltip:opacity-100"
    >
      {content}
    </div>
  </div>
);

export const ClassroomDashboard: React.FC<ClassroomDashboardProps> = ({
  classroom,
  classrooms,
  studentsById: allStudentsById,
  dateRecords,
  categories,
  contents,
  curriculums,
  publishedLessons,
  userEmail,
  onSaveStudents,
  onMoveStudent,
  onSaveDateRecord,
  onDeleteDateRecord,
  onUpdatePublishedLesson,
  onGenerateMemoDraft,
  onUpdateClassroom,
  onDeleteClassroom,
  onListCalendarClasses,
  onAssignCurriculumDates,
  onSaveCurriculumSessions,
  onNavigateToContent,
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [selectedCategory, setSelectedCategory] = useState<string>(categories[0]?.id || '');
  const [selectedDate, setSelectedDate] = useState(getLocalDateString(new Date()));
  const [students, setStudents] = useState<Student[]>(classroom.students || []);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentAge, setNewStudentAge] = useState('');
  const [newStudentContact, setNewStudentContact] = useState('');
  const [newStudentMemo, setNewStudentMemo] = useState('');
  const [isStudentCreateFormOpen, setIsStudentCreateFormOpen] = useState(false);
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [studentSaveError, setStudentSaveError] = useState<string | null>(null);
  const [studentAction, setStudentAction] = useState<StudentAction | null>(null);
  const [studentMoveTargets, setStudentMoveTargets] = useState<Record<string, string>>({});
  const [localMemo, setLocalMemo] = useState('');

  const [generationMessage, setGenerationMessage] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [isGeneratingMemoDraft, setIsGeneratingMemoDraft] = useState(false);
  const [viewMonth, setViewMonth] = useState(new Date());
  const [settingsDraft, setSettingsDraft] = useState({
    name: classroom.name,
    color: classroom.color || DEFAULT_CLASSROOM_COLOR,
    icon: classroom.icon || DEFAULT_CLASSROOM_ICON,
    driveFolderId: classroom.driveFolderId || '',
    driveFolderName: classroom.driveFolderName || '',
  });
  const [isPickerLoading, setIsPickerLoading] = useState(false);

  const [calendarClasses, setCalendarClasses] = useState<CalendarClassSummary[]>([]);
  const [calendarClassesLoading, setCalendarClassesLoading] = useState(false);
  const [calendarClassesError, setCalendarClassesError] = useState<string | null>(null);
  const [isAssigningDates, setIsAssigningDates] = useState(false);
  const [assignMessage, setAssignMessage] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);

  const isSavingStudentAction = studentAction !== null;
  const availableMoveClassrooms = classrooms.filter((candidate) => candidate.id !== classroom.id);
  const defaultMoveTargetClassroomId = availableMoveClassrooms[0]?.id || '';
  const classroomDateRecords = useMemo(
    () => dateRecords.filter((record) => record.classroomId === classroom.id),
    [dateRecords, classroom.id]
  );
  const currentDateRecord = useMemo(
    () =>
      [...classroomDateRecords]
        .filter((record) => record.date === selectedDate)
        .sort((left, right) => getRecordTimestamp(right) - getRecordTimestamp(left))[0],
    [classroomDateRecords, selectedDate]
  );
  const isCurrentDateActive = Boolean(currentDateRecord);
  const isMemoDirty = (currentDateRecord?.memo || '') !== localMemo;
  const [isAssignmentCardCollapsed, setIsAssignmentCardCollapsed] = useState(true);
  const activeDateSet = useMemo(
    () => new Set(classroomDateRecords.map((record) => record.date)),
    [classroomDateRecords]
  );
  const memoDateSet = useMemo(
    () => new Set(classroomDateRecords.filter((record) => record.memo?.trim()).map((record) => record.date)),
    [classroomDateRecords]
  );
  // 이 교실에 연결된 커리큘럼의 예정 회차 (날짜 → 회차 목록)
  const plannedSessionsByDate = useMemo(() => {
    const map = new Map<string, CurriculumSession[]>();
    const linkedCurriculum = (curriculums || []).find(
      (curriculum) => curriculum.id === classroom.curriculumId
    );
    for (const session of linkedCurriculum?.sessions || []) {
      if (!session.plannedDate) continue;
      const sessionsOnDate = map.get(session.plannedDate) || [];
      sessionsOnDate.push(session);
      map.set(session.plannedDate, sessionsOnDate);
    }
    return map;
  }, [curriculums, classroom.curriculumId]);
  const categorizedContents = useMemo(
    () => contents.filter((content) => content.categoryId !== null),
    [contents]
  );
  const assignedContentIds = useMemo(
    () => categorizedContents.map((content) => content.id),
    [categorizedContents]
  );
  const assignedContentIdSet = useMemo(() => new Set(assignedContentIds), [assignedContentIds]);
  const assignedContents = useMemo(
    () => categorizedContents.filter((content) => assignedContentIdSet.has(content.id)),
    [categorizedContents, assignedContentIdSet]
  );
  const assignedContentsById = useMemo(
    () => new Map(contents.map((content) => [content.id, content])),
    [contents]
  );
  const contentsByCategory = useMemo(() => {
    const grouped = new Map<string, LessonContent[]>();
    for (const content of assignedContents) {
      const catId = content.categoryId!;
      if (!grouped.has(catId)) grouped.set(catId, []);
      grouped.get(catId)!.push(content);
    }
    return categories
      .filter((cat) => grouped.has(cat.id))
      .map((cat) => ({ category: cat, catContents: grouped.get(cat.id)! }));
  }, [assignedContents, categories]);
  const currentDateRecordContentIds = currentDateRecord
    ? normalizeClassroomDateRecordContentIds(currentDateRecord)
    : [];
  const currentDateRecordedContents = currentDateRecordContentIds
    .map((contentId) => assignedContentsById.get(contentId))
    .filter((content): content is LessonContent => Boolean(content));
  const currentDateRecordedContentIdSet = new Set(
    currentDateRecordedContents.map((content) => content.id)
  );
  const missingCurrentDateContentCount = Math.max(
    currentDateRecordContentIds.length - currentDateRecordedContents.length,
    0
  );

  // 이 날짜에 학생에게 공개된 실습 블록 목록 (실시간 게이팅의 기준)
  const currentPublishedLesson = useMemo(
    () =>
      (publishedLessons || []).find(
        (lesson) => lesson.classroomId === classroom.id && lesson.date === selectedDate
      ),
    [publishedLessons, classroom.id, selectedDate]
  );
  const publishedContentIdSet = useMemo(
    () => new Set(currentPublishedLesson?.publishedContentIds || []),
    [currentPublishedLesson]
  );
  // 수업기록에 담긴 콘텐츠를 강사용 슬라이드(PPT)와 학생용 실습(HTML)으로 분류한다.
  // 슬라이드는 강사 화면 전용이라 공개 대상이 아니고, HTML 실습만 학생에게 공개한다.
  const recordedSlideContents = currentDateRecordedContents.filter((content) =>
    Boolean(content.slideUrl?.trim())
  );
  const recordedPracticeContents = currentDateRecordedContents.filter(
    (content) => Boolean(content.html?.trim()) && !content.slideUrl?.trim()
  );
  const publishedPracticeCount = recordedPracticeContents.filter((content) =>
    publishedContentIdSet.has(content.id)
  ).length;
  const calendarDays = getDaysInMonth(viewMonth);
  const weekDays = ['일', '월', '화', '수', '목', '금', '토'];
  const previewColorMeta = getClassroomColorMeta(settingsDraft.color);
  const previewIconColor = previewColorMeta.value;
  const previewIconBg = previewColorMeta.bg;
  const { activeStudents, inactiveStudents } = useMemo(
    () => splitStudentsByStatus(students),
    [students]
  );
  const { activeCount, inactiveCount } = useMemo(
    () => getStudentCounts(students),
    [students]
  );
  const attendanceStats = useMemo(
    () => getAttendanceStats(currentDateRecord),
    [currentDateRecord]
  );
  const sortedAttendanceRecords = useMemo(() => {
    if (!currentDateRecord) {
      return [];
    }

    return currentDateRecord.attendance
      .map((record, index) => {
        const globalStudent = allStudentsById.get(record.studentId);
        const isExcluded = isAttendanceExcluded(record);

        return {
          record,
          index,
          isExcluded,
          isInactiveStudent: globalStudent ? isStudentInactive(globalStudent) : false,
        };
      })
      .sort((left, right) => {
        const leftGroup = left.isExcluded ? 2 : left.isInactiveStudent ? 1 : 0;
        const rightGroup = right.isExcluded ? 2 : right.isInactiveStudent ? 1 : 0;

        if (leftGroup !== rightGroup) {
          return leftGroup - rightGroup;
        }

        return left.index - right.index;
      })
      .map(({ record }) => record);
  }, [allStudentsById, currentDateRecord]);

  useEffect(() => {
    setSettingsDraft({
      name: classroom.name,
      color: classroom.color || DEFAULT_CLASSROOM_COLOR,
      icon: classroom.icon || DEFAULT_CLASSROOM_ICON,
      driveFolderId: classroom.driveFolderId || '',
      driveFolderName: classroom.driveFolderName || '',
    });
  }, [classroom.color, classroom.icon, classroom.name, classroom.driveFolderId, classroom.driveFolderName]);

  useEffect(() => {
    setStudents(classroom.students || []);
  }, [classroom.students]);

  useEffect(() => {
    setStudentMoveTargets((previousTargets) => {
      const nextTargets: Record<string, string> = {};

      for (const student of students) {
        const previousTarget = previousTargets[student.id];
        if (
          previousTarget &&
          previousTarget !== classroom.id &&
          classrooms.some((candidate) => candidate.id === previousTarget && candidate.id !== classroom.id)
        ) {
          nextTargets[student.id] = previousTarget;
        } else {
          nextTargets[student.id] = defaultMoveTargetClassroomId;
        }
      }

      return nextTargets;
    });
  }, [students, classrooms, classroom.id, defaultMoveTargetClassroomId]);

  useEffect(() => {
    if (categories.length === 0) {
      if (selectedCategory !== '') {
        setSelectedCategory('');
      }
      return;
    }

    if (!categories.some((category) => category.id === selectedCategory)) {
      setSelectedCategory(categories[0].id);
    }
  }, [categories, selectedCategory]);

  useEffect(() => {
    setLocalMemo(currentDateRecord?.memo || '');
  }, [currentDateRecord?.id, currentDateRecord?.updatedAt, selectedDate]);

  useEffect(() => {
    setGenerationMessage(null);
    setGenerationError(null);
  }, [classroom.id, selectedDate]);

  useEffect(() => {
    setIsAssignmentCardCollapsed(true);
  }, [classroom.id]);

  useEffect(() => {
    setAssignMessage(null);
    setAssignError(null);
  }, [classroom.id]);

  useEffect(() => {
    if (activeTab !== 'curriculum' || !onListCalendarClasses) {
      return;
    }
    let cancelled = false;
    setCalendarClassesLoading(true);
    setCalendarClassesError(null);
    onListCalendarClasses()
      .then((items) => {
        if (!cancelled) setCalendarClasses(items);
      })
      .catch((error) => {
        if (!cancelled) {
          setCalendarClassesError(
            error instanceof Error ? error.message : '참고 시간표를 불러오지 못했습니다.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setCalendarClassesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, onListCalendarClasses]);

  const linkedCurriculum = useMemo(
    () => (curriculums || []).find((curriculum) => curriculum.id === classroom.curriculumId) || null,
    [curriculums, classroom.curriculumId]
  );

  const linkedCalendarClass = useMemo(
    () => calendarClasses.find((calendarClass) => calendarClass.id === classroom.calendarClassId) || null,
    [calendarClasses, classroom.calendarClassId]
  );

  const sortedCurriculumSessions = useMemo(
    () => [...(linkedCurriculum?.sessions || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [linkedCurriculum]
  );

  const [sessionDrafts, setSessionDrafts] = useState<CurriculumSession[]>([]);
  const [isSavingSessions, setIsSavingSessions] = useState(false);
  const [sessionSaveError, setSessionSaveError] = useState<string | null>(null);

  // 연결된 커리큘럼이 바뀌거나 외부(자동 배정·GPT)에서 갱신되면 편집 초안을 다시 맞춘다
  useEffect(() => {
    setSessionDrafts(sortedCurriculumSessions.map((session) => ({ ...session })));
    setSessionSaveError(null);
  }, [linkedCurriculum?.id, linkedCurriculum?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const normalizeSessionsForCompare = (sessions: CurriculumSession[]) =>
    JSON.stringify(
      sessions.map((session, index) => ({
        topic: session.topic || '',
        details: session.details || '',
        plannedDate: session.plannedDate || '',
        status: session.status,
        order: index + 1,
      }))
    );
  const isSessionsDirty =
    normalizeSessionsForCompare(sessionDrafts) !== normalizeSessionsForCompare(sortedCurriculumSessions);

  const updateSessionDraft = (id: string, patch: Partial<CurriculumSession>) => {
    setSessionDrafts((drafts) =>
      drafts.map((session) => (session.id === id ? { ...session, ...patch } : session))
    );
  };

  const addSessionDraft = () => {
    setSessionDrafts((drafts) => [
      ...drafts,
      {
        id:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `session-${Date.now()}`,
        order: drafts.length + 1,
        topic: '',
        status: 'planned',
      },
    ]);
  };

  const removeSessionDraft = (id: string) => {
    setSessionDrafts((drafts) => drafts.filter((session) => session.id !== id));
  };

  const moveSessionDraft = (id: string, direction: -1 | 1) => {
    setSessionDrafts((drafts) => {
      const index = drafts.findIndex((session) => session.id === id);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= drafts.length) {
        return drafts;
      }
      const next = [...drafts];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleSaveSessionDrafts = async () => {
    if (!onSaveCurriculumSessions || !linkedCurriculum || isSavingSessions) {
      return;
    }
    if (sessionDrafts.some((session) => !session.topic.trim())) {
      setSessionSaveError('주제가 비어 있는 회차가 있습니다. 모든 회차에 주제를 입력하세요.');
      return;
    }
    setSessionSaveError(null);
    setIsSavingSessions(true);
    try {
      await onSaveCurriculumSessions(
        linkedCurriculum.id,
        sessionDrafts.map((session) => ({ ...session, topic: session.topic.trim() }))
      );
    } catch {
      setSessionSaveError('회차를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsSavingSessions(false);
    }
  };

  const resetSessionDrafts = () => {
    setSessionDrafts(sortedCurriculumSessions.map((session) => ({ ...session })));
    setSessionSaveError(null);
  };

  const handleAssignCurriculumDatesClick = async () => {
    if (!onAssignCurriculumDates || isAssigningDates) {
      return;
    }
    setAssignMessage(null);
    setAssignError(null);
    setIsAssigningDates(true);
    try {
      const result = await onAssignCurriculumDates(classroom.id);
      setAssignMessage(
        `회차 ${result.assigned}개에 날짜를 배정했습니다. (수업 날짜 ${result.availableDates}개 / 대상 회차 ${result.eligibleSessions}개)`
      );
    } catch (error) {
      setAssignError(
        error instanceof Error ? error.message : '회차 날짜 배정에 실패했습니다.'
      );
    } finally {
      setIsAssigningDates(false);
    }
  };

  const createInitialAttendance = (): AttendanceRecord[] =>
    students.map((student) => ({
      studentId: student.id,
      status: 'Present',
      isExcluded: isStudentInactive(student) ? true : undefined,
    }));

  const createDateRecord = (): ClassroomDateRecord => {
    const timestamp = new Date().toISOString();
    return {
      id: `${classroom.id}_${selectedDate}`,
      classroomId: classroom.id,
      classroomName: classroom.name,
      ownerUid: '',
      date: selectedDate,
      contentIds: [],
      attendance: createInitialAttendance(),
      memo: '',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  };

  const handleActivateDate = () => {
    if (currentDateRecord) {
      return;
    }

    onSaveDateRecord(createDateRecord());
  };

  const handleDeactivateDate = () => {
    if (!currentDateRecord) {
      return;
    }

    const confirmed = window.confirm(
      `${selectedDate} 날짜를 비활성화하면 수업기록, 수업메모, 출석체크가 모두 삭제됩니다. 계속할까요?`
    );

    if (!confirmed) {
      return;
    }

    onDeleteDateRecord(currentDateRecord.id);
  };

  const toggleAssignmentCard = () => {
    setIsAssignmentCardCollapsed((current) => !current);
  };

  const handleToggleContent = (_content: LessonContent) => {};

  const handleToggleDateRecordContent = (content: LessonContent) => {
    if (!currentDateRecord) {
      return;
    }

    const currentIds = normalizeClassroomDateRecordContentIds(currentDateRecord).filter((contentId) =>
      assignedContentsById.has(contentId)
    );
    const nextIds = currentIds.includes(content.id)
      ? currentIds.filter((contentId) => contentId !== content.id)
      : [...currentIds, content.id];

    onSaveDateRecord({
      ...currentDateRecord,
      contentIds: orderClassroomDateRecordContentIds(nextIds, assignedContents),
    });
  };

  // 실습 블록 하나를 학생에게 공개/잠금 토글 — Firestore 반영 즉시 학생 화면이 실시간으로 열린다.
  const handleTogglePublishContent = (content: LessonContent) => {
    if (!onUpdatePublishedLesson) {
      return;
    }
    const current = currentPublishedLesson?.publishedContentIds || [];
    const next = current.includes(content.id)
      ? current.filter((contentId) => contentId !== content.id)
      : [...current, content.id];
    void onUpdatePublishedLesson(classroom.id, classroom.name, selectedDate, next);
  };

  const handlePublishAllPractice = () => {
    if (!onUpdatePublishedLesson) {
      return;
    }
    void onUpdatePublishedLesson(
      classroom.id,
      classroom.name,
      selectedDate,
      recordedPracticeContents.map((content) => content.id)
    );
  };

  const handleUnpublishAll = () => {
    if (!onUpdatePublishedLesson) {
      return;
    }
    void onUpdatePublishedLesson(classroom.id, classroom.name, selectedDate, []);
  };

  const handleSaveMemo = () => {
    if (!currentDateRecord) {
      return;
    }

    if (currentDateRecord.memo === localMemo) {
      return;
    }

    setGenerationError(null);
    setGenerationMessage('메모를 저장했습니다.');

    onSaveDateRecord({
      ...currentDateRecord,
      memo: localMemo,
    });
  };

  const handleGenerateMemoDraftClick = async () => {
    if (!currentDateRecord || isGeneratingMemoDraft) {
      return;
    }

    setGenerationMessage(null);
    setGenerationError(null);
    setIsGeneratingMemoDraft(true);
    let nextGenerationMessage: string | null = null;
    let nextGenerationError: string | null = null;

    try {
      const generatedMemo = await onGenerateMemoDraft(classroom.id, selectedDate, localMemo.trim());
      setLocalMemo(generatedMemo);
      nextGenerationMessage = '수업 메모가 생성되었습니다. 저장 버튼으로 확정하세요.';
    } catch (error) {
      setGenerationError(
        error instanceof Error ? error.message : '수업 메모 생성에 실패했습니다.'
      );
      nextGenerationError =
        error instanceof Error ? error.message : '수업 메모 생성에 실패했습니다.';
    } finally {
      if (nextGenerationMessage) {
        setGenerationMessage(nextGenerationMessage);
      }
      if (nextGenerationError) {
        setGenerationError(nextGenerationError);
      }
      setIsGeneratingMemoDraft(false);
    }
  };

  const updateAttendance = (studentId: string, status: 'Present' | 'Absent' | 'Late') => {
    if (!currentDateRecord) {
      return;
    }

    const nextAttendance = currentDateRecord.attendance.map((attendance) =>
      attendance.studentId === studentId && !isAttendanceExcluded(attendance)
        ? { ...attendance, status }
        : attendance
    );

    onSaveDateRecord({
      ...currentDateRecord,
      attendance: nextAttendance,
    });
  };

  const toggleAttendanceExclusion = (studentId: string) => {
    if (!currentDateRecord) {
      return;
    }

    const nextAttendance = currentDateRecord.attendance.map((attendance) => {
      if (attendance.studentId !== studentId) {
        return attendance;
      }

      if (isAttendanceExcluded(attendance)) {
        const { isExcluded: _isExcluded, ...includedAttendance } = attendance;
        return includedAttendance;
      }

      return {
        ...attendance,
        isExcluded: true,
      };
    });

    onSaveDateRecord({
      ...currentDateRecord,
      attendance: nextAttendance,
    });
  };

  const normalizeStudent = (student: Student): Student => {
    const name = student.name.trim();

    return sanitizeStudentForStorage({
      ...student,
      name,
      initials: getStudentInitials(name),
      updatedAt: new Date().toISOString(),
      age: student.age?.trim() || undefined,
      contact: student.contact?.trim() || undefined,
      memo: student.memo?.trim() || undefined,
    });
  };

  const persistStudents = async (
    nextStudents: Student[],
    action: Exclude<StudentAction, 'move'>,
    errorMessage: string
  ) => {
    setStudentSaveError(null);
    setStudentAction(action);

    try {
      await onSaveStudents(classroom.id, nextStudents);
      setStudents(nextStudents);
      return true;
    } catch {
      setStudentSaveError(errorMessage);
      return false;
    } finally {
      setStudentAction(null);
    }
  };

  const handleAddStudent = async () => {
    const name = newStudentName.trim();

    if (isSavingStudentAction) {
      return;
    }

    if (!name) {
      setStudentSaveError('학생 이름은 필수입니다.');
      return;
    }

    const nextStudent = normalizeStudent({
      id: `std-${Date.now()}`,
      ownerUid: '',
      classroomId: classroom.id,
      name,
      initials: '',
      order: students.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      age: newStudentAge,
      contact: newStudentContact,
      memo: newStudentMemo,
    });

    const saved = await persistStudents(
      [...students, nextStudent],
      'add',
      '학생을 추가하지 못했습니다. 잠시 후 다시 시도해주세요.'
    );

    if (!saved) {
      return;
    }

    setNewStudentName('');
    setNewStudentAge('');
    setNewStudentContact('');
    setNewStudentMemo('');
    setIsStudentCreateFormOpen(false);
  };

  const handleRemoveStudent = async (student: Student) => {
    if (isSavingStudentAction) {
      return;
    }

    if (!window.confirm(`'${student.name}' 학생을 삭제할까요?`)) {
      return;
    }

    const saved = await persistStudents(
      students.filter((currentStudent) => currentStudent.id !== student.id),
      'delete',
      '학생을 삭제하지 못했습니다. 잠시 후 다시 시도해주세요.'
    );

    if (!saved) {
      return;
    }

    if (expandedStudent === student.id) {
      setExpandedStudent(null);
    }
    if (editingStudent?.id === student.id) {
      setEditingStudent(null);
    }
  };

  const handleSaveStudentEdit = async (student: Student) => {
    if (isSavingStudentAction) {
      return;
    }

    const normalizedStudent = normalizeStudent(student);
    if (!normalizedStudent.name) {
      setStudentSaveError('학생 이름은 필수입니다.');
      return;
    }

    const saved = await persistStudents(
      students.map((currentStudent) =>
        currentStudent.id === normalizedStudent.id ? normalizedStudent : currentStudent
      ),
      'edit',
      '학생 정보를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.'
    );

    if (saved) {
      setEditingStudent(null);
    }
  };

  const handleDeactivateStudent = async (student: Student) => {
    if (isSavingStudentAction || isStudentInactive(student)) {
      return;
    }

    const confirmed = window.confirm(
      `'${student.name}' 학생을 비활성 처리할까요? 앞으로 새로 생성하는 출석 체크 대상에서 제외됩니다.`
    );
    if (!confirmed) {
      return;
    }

    const nextStudent = normalizeStudent({
      ...student,
      inactiveAt: new Date().toISOString(),
    });

    await persistStudents(
      students.map((currentStudent) =>
        currentStudent.id === student.id ? nextStudent : currentStudent
      ),
      'deactivate',
      '학생을 비활성 처리하지 못했습니다. 잠시 후 다시 시도해주세요.'
    );
  };

  const handleReactivateStudent = async (student: Student) => {
    if (isSavingStudentAction || !isStudentInactive(student)) {
      return;
    }

    const confirmed = window.confirm(
      `'${student.name}' 학생을 다시 활성화할까요? 이후 새로 생성하는 출석 체크 대상에 다시 포함됩니다.`
    );
    if (!confirmed) {
      return;
    }

    const { inactiveAt: _inactiveAt, ...reactivatedStudent } = student;
    const nextStudent = normalizeStudent(reactivatedStudent);

    await persistStudents(
      students.map((currentStudent) =>
        currentStudent.id === student.id ? nextStudent : currentStudent
      ),
      'reactivate',
      '학생을 다시 활성화하지 못했습니다. 잠시 후 다시 시도해주세요.'
    );
  };

  const handleMoveStudentToClassroom = async (student: Student) => {
    if (isSavingStudentAction) {
      return;
    }

    const targetClassroomId = studentMoveTargets[student.id] || defaultMoveTargetClassroomId;
    if (!targetClassroomId) {
      setStudentSaveError('이동할 클래스를 선택해주세요.');
      return;
    }
    if (targetClassroomId === classroom.id) {
      setStudentSaveError('같은 클래스로는 이동할 수 없습니다.');
      return;
    }

    const targetClassroom = availableMoveClassrooms.find((candidate) => candidate.id === targetClassroomId);
    if (!targetClassroom) {
      setStudentSaveError('이동할 클래스 정보를 찾을 수 없습니다.');
      return;
    }

    if (!window.confirm(`'${student.name}' 학생을 '${targetClassroom.name}' 클래스로 이동할까요?`)) {
      return;
    }

    setStudentSaveError(null);
    setStudentAction('move');
    try {
      await onMoveStudent(classroom.id, targetClassroomId, student.id);
      setStudents((currentStudents) =>
        currentStudents.filter((currentStudent) => currentStudent.id !== student.id)
      );
      setExpandedStudent((currentExpandedStudent) =>
        currentExpandedStudent === student.id ? null : currentExpandedStudent
      );
      setEditingStudent((currentEditingStudent) =>
        currentEditingStudent?.id === student.id ? null : currentEditingStudent
      );
      setStudentMoveTargets((currentTargets) => {
        const nextTargets = { ...currentTargets };
        delete nextTargets[student.id];
        return nextTargets;
      });
    } catch (error) {
      if (error instanceof Error && error.message && !error.message.startsWith('{')) {
        setStudentSaveError(error.message);
      } else {
        setStudentSaveError('학생 이동에 실패했습니다. 잠시 후 다시 시도해주세요.');
      }
    } finally {
      setStudentAction(null);
    }
  };

  const renderDashboardTab = () => {
    const assignmentTooltipText =
      '학생 페이지에는 여기에서 배정한 콘텐츠만 보입니다. 날짜를 바꿔도 이 목록은 달라지지 않습니다.';
    const dateStatusTooltipText =
      '날짜를 활성화해야 수업기록, 수업메모, 출석체크를 남길 수 있습니다.';
    const lessonRecordTooltipText =
      '학생 페이지 노출과는 별개로, 이 날짜에 실제 진행한 콘텐츠만 기록합니다.';
    const attendanceTooltipText =
      '활성화된 날짜에만 출석 상태를 저장합니다. 비활성 학생은 기본적으로 오늘 제외 상태로 시작하며, 학생별로 오늘만 제외하거나 다시 포함할 수 있습니다.';
    const calendarTooltipText = '날짜를 선택한 뒤 활성화하면 아래 기록 영역이 열립니다.';
    const memoTooltipText = '활성화된 날짜에만 메모가 저장됩니다.';
    const waitingTooltipText =
      '이 날짜는 아직 비활성 상태입니다. 활성화 버튼을 누르면 수업기록, 수업메모, 출석체크가 열리고 캘린더에도 표시됩니다.';
    const assignmentPreviewContents = assignedContents.slice(0, 3);
    const remainingAssignedContentCount = Math.max(
      assignedContents.length - assignmentPreviewContents.length,
      0
    );
    const excludedAttendanceCount =
      currentDateRecord?.attendance.filter((attendance) => isAttendanceExcluded(attendance)).length || 0;

    return (
      <motion.div
        key="dashboard"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="grid grid-cols-1 gap-8 lg:grid-cols-3"
      >
        <div className="space-y-6 lg:col-span-2">
          <div className="hidden rounded-[40px] border border-[#E5E3DD] bg-white p-8 shadow-sm sm:p-10">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <h2 className="flex items-center gap-2 text-xl font-bold text-[#4A3728]">
                <FileText className="text-[#8B5E3C]" size={20} />
                클래스별 콘텐츠 배정
                <DashboardInfoTooltip
                  content={assignmentTooltipText}
                  label="클래스별 콘텐츠 배정 설명 보기"
                />
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#8B7E74]">
                <span className="rounded-full bg-[#F3F2EE] px-3 py-1.5 text-[#8B5E3C]">
                  {assignedContents.length}개 배정
                </span>
                <span className="rounded-full bg-[#FBF4EA] px-3 py-1.5 text-[#8B5E3C]">
                  학생 페이지 노출 기준
                </span>
                <span className="rounded-full bg-[#EEF7F0] px-3 py-1.5 text-[#2D7A4D]">
                  {isCurrentDateActive ? '날짜 기록 선택 가능' : '날짜 활성화 후 기록 가능'}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                onClick={toggleAssignmentCard}
                className="inline-flex items-center gap-2 rounded-xl border border-[#E5E3DD] px-4 py-2 text-sm font-bold text-[#4A3728] transition-all hover:bg-[#F3F2EE]"
              >
                {isAssignmentCardCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                {isAssignmentCardCollapsed ? '펼치기' : '접기'}
              </button>
              <button
                onClick={() => undefined}
                className="rounded-xl border border-[#E5E3DD] px-4 py-2 text-sm font-bold text-[#8B5E3C] transition-all hover:bg-[#FFF5E9]"
              >
                라이브러리 열기
              </button>
            </div>
          </div>
          <AnimatePresence initial={false} mode="wait">
            {isAssignmentCardCollapsed ? (
              <motion.div
                key="assignment-card-collapsed"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="rounded-[28px] border border-dashed border-[#E5E3DD] bg-[#FBFBFA] px-6 py-6 text-sm text-[#8B7E74]"
              >
                <div className="flex flex-wrap gap-2">
                  {assignmentPreviewContents.length > 0 ? (
                    <>
                      {assignmentPreviewContents.map((content) => (
                        <span
                          key={content.id}
                          className="rounded-full bg-white px-4 py-2 text-sm font-bold text-[#4A3728] shadow-sm"
                        >
                          {content.title}
                        </span>
                      ))}
                      {remainingAssignedContentCount > 0 && (
                        <span className="rounded-full bg-[#F3F2EE] px-4 py-2 text-sm font-bold text-[#8B7E74]">
                          +{remainingAssignedContentCount}개 더
                        </span>
                      )}
                    </>
                  ) : (
                    <div className="w-full rounded-2xl border border-dashed border-[#E5E3DD] bg-white px-4 py-6 text-center text-sm text-[#8B7E74]">
                      아직 배정된 콘텐츠가 없습니다.
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="assignment-card-expanded"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                {assignedContents.length > 0 && (
                  <div className="mb-8 flex flex-wrap items-center gap-2 border-b border-[#E5E3DD] pb-8">
                    {assignedContents.map((content) => (
                      <div key={content.id} className="group relative inline-flex">
                        <button className="cursor-default rounded-full bg-[#8B5E3C] px-5 py-3 pr-10 text-left text-sm font-bold text-white shadow-md">
                          {content.title}
                        </button>
                        <button
                          onClick={() => handleToggleContent(content)}
                          className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-white/80 opacity-0 transition-all hover:bg-[#D9534F] hover:text-white group-hover:opacity-100"
                          title="콘텐츠 배정 해제"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {categories.length > 0 ? (
                  <>
                    <div className="mb-6 flex flex-wrap gap-2 border-b border-[#E5E3DD] pb-4">
                      {categories.map((category) => (
                        <button
                          key={category.id}
                          onClick={() => setSelectedCategory(category.id)}
                          className={`rounded-xl px-4 py-2 text-sm font-bold transition-all ${
                            selectedCategory === category.id
                              ? 'bg-[#8B5E3C] text-white shadow-md'
                              : 'bg-[#F3F2EE] text-[#8B7E74] hover:bg-[#EBD9C1] hover:text-[#8B5E3C]'
                          }`}
                        >
                          {category.name}
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-3">
                      {contents
                        .filter(
                          (content) =>
                            content.categoryId !== null && content.categoryId === selectedCategory
                        )
                        .map((content) => {
                          const isSelected = assignedContentIds.includes(content.id);
                          return (
                            <button
                              key={content.id}
                              onClick={() => handleToggleContent(content)}
                              disabled={isSelected}
                              className={`rounded-full px-5 py-3 text-left text-sm font-bold transition-all ${
                                isSelected
                                  ? 'cursor-default border border-transparent bg-[#F3F2EE] text-[#D0C9C0] shadow-inner opacity-80'
                                  : 'border border-[#EBD9C1] bg-[#FFF5E9] text-[#8B5E3C] hover:-translate-y-0.5 hover:bg-[#EBD9C1] hover:shadow-md'
                              }`}
                            >
                              {content.title}
                            </button>
                          );
                        })}

                      {contents.filter(
                        (content) =>
                          content.categoryId !== null && content.categoryId === selectedCategory
                      ).length === 0 && (
                        <p className="py-4 text-sm text-[#8B7E74]">이 카테고리에 등록된 콘텐츠가 없습니다.</p>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="rounded-[28px] border border-dashed border-[#E5E3DD] bg-[#FBFBFA] px-6 py-8 text-sm text-[#8B7E74]">
                    먼저 콘텐츠 라이브러리에서 카테고리와 콘텐츠를 만들어주세요.
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="rounded-[32px] border border-[#E5E3DD] bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-3">
              <h2 className="flex items-center gap-2 text-xl font-bold text-[#4A3728]">
                <Clock className="text-[#8B5E3C]" size={20} />
                날짜 상태
                <DashboardInfoTooltip
                  content={dateStatusTooltipText}
                  label="날짜 상태 설명 보기"
                />
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#FFF5E9] px-4 py-2 text-xs font-bold text-[#8B5E3C]">
                  {selectedDate}
                </span>
                <span
                  className={`rounded-full px-4 py-2 text-xs font-bold ${
                    isCurrentDateActive
                      ? 'bg-[#EEF7F0] text-[#2D7A4D]'
                      : 'bg-[#F3F2EE] text-[#8B7E74]'
                  }`}
                >
                  {isCurrentDateActive ? '활성' : '비활성'}
                </span>
                <span className="text-sm text-[#8B7E74]">
                  {isCurrentDateActive
                    ? '수업기록, 메모, 출석 체크가 열려 있습니다.'
                    : '활성화 전에는 기록 영역이 열리지 않습니다.'}
                </span>
              </div>
            </div>
            <button
              onClick={isCurrentDateActive ? handleDeactivateDate : handleActivateDate}
              className={`inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3 text-sm font-bold transition-all ${
                isCurrentDateActive
                  ? 'bg-[#FDECEC] text-[#B42318] hover:bg-[#FAD4D1]'
                  : 'bg-[#8B5E3C] text-white hover:bg-[#724D31]'
              }`}
            >
              <Power size={16} />
              {isCurrentDateActive ? '비활성화' : '활성화'}
            </button>
          </div>
        </div>

        {isCurrentDateActive && (
          <div className="rounded-[40px] border border-[#E5E3DD] bg-white p-8 shadow-sm sm:p-10">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-3">
                <h2 className="flex items-center gap-2 text-xl font-bold text-[#4A3728]">
                  <Clock className="text-[#8B5E3C]" size={20} />
                  날짜별 수업기록
                  <DashboardInfoTooltip
                    content={lessonRecordTooltipText}
                    label="날짜별 수업기록 설명 보기"
                  />
                </h2>
                <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                  <span className="rounded-full bg-[#EAF2FF] px-3 py-1.5 text-[#2F5EA8]">
                    기록됨
                  </span>
                  <span className="rounded-full bg-[#F2FBF3] px-3 py-1.5 text-[#2F7A4D]">
                    선택 가능
                  </span>
                  <span className="rounded-full bg-[#FFF5E9] px-3 py-1.5 text-[#8B5E3C]">
                    {selectedDate}
                  </span>
                </div>
              </div>
            </div>

            {missingCurrentDateContentCount > 0 && (
              <div className="mb-8 flex items-center gap-3 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-amber-800">
                <AlertCircle size={20} />
                <div className="text-sm">
                  <p className="font-bold">현재 기록에 포함된 콘텐츠 중 일부를 찾을 수 없습니다.</p>
                  <p className="hidden opacity-80">
                    이미 배정에서 빠졌거나 삭제된 콘텐츠일 수 있습니다. 아래 목록에서는 현재 배정된 콘텐츠만 다시 선택할 수 있습니다.
                  </p>
                  <p className="opacity-80">
                    이 기록에 포함된 콘텐츠 중 일부는 삭제되었거나 현재 목록에서 찾을 수 없습니다. 남아 있는 콘텐츠는 그대로 유지되고, 아래에서는 지금 보이는 콘텐츠만 추가로 선택할 수 있습니다.
                  </p>
                </div>
              </div>
            )}

            {currentDateRecordedContents.length > 0 ? (
              <div className="mb-8 flex flex-wrap items-center gap-2 border-b border-[#E5E3DD] pb-8">
                {currentDateRecordedContents.map((content) => (
                  <div key={content.id} className="group relative inline-flex">
                    <button
                      onClick={() => onNavigateToContent?.(content.id)}
                      className="cursor-pointer rounded-full border border-[#CFE0FF] bg-[#EAF2FF] px-5 py-3 pr-10 text-left text-sm font-bold text-[#2F5EA8] shadow-sm hover:bg-[#D6E6FF] hover:border-[#A3C4FF] transition-all"
                    >
                      {content.title}
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        handleToggleDateRecordContent(content);
                      }}
                      className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/70 text-[#2F5EA8] opacity-0 transition-all hover:bg-[#D9534F] hover:text-white group-hover:opacity-100"
                      title="기록에서 제거"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mb-8 rounded-[28px] border border-dashed border-[#E5E3DD] bg-[#FBFBFA] px-6 py-8 text-sm text-[#8B7E74]">
                아직 이 날짜에 기록된 수업 콘텐츠가 없습니다. 아래에서 실제 진행한 콘텐츠를 선택해주세요.
              </div>
            )}

            {onUpdatePublishedLesson && (recordedPracticeContents.length > 0 || recordedSlideContents.length > 0) && (
              <div className="mb-8 rounded-[28px] border border-[#E5E3DD] bg-[#FBFBFA] p-6">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h3 className="flex items-center gap-2 text-base font-bold text-[#4A3728]">
                      <Presentation className="text-[#8B5E3C]" size={18} />
                      수업 진행 · 학생 공개
                    </h3>
                    <p className="text-xs text-[#8B7E74]">
                      이론(슬라이드)은 강사 화면 전용입니다. 실습을 공개하면 학생 화면에서 즉시 잠금이 풀립니다.
                    </p>
                  </div>
                  {recordedPracticeContents.length > 0 && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handlePublishAllPractice}
                        disabled={publishedPracticeCount === recordedPracticeContents.length}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#EEF7F0] px-3 py-2 text-xs font-bold text-[#2D7A4D] transition-all hover:bg-[#DCEFE2] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Unlock size={14} />
                        전체 공개
                      </button>
                      <button
                        onClick={handleUnpublishAll}
                        disabled={publishedPracticeCount === 0}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#FDECEC] px-3 py-2 text-xs font-bold text-[#B42318] transition-all hover:bg-[#FAD4D1] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Lock size={14} />
                        전체 잠금
                      </button>
                    </div>
                  )}
                </div>

                {recordedSlideContents.length > 0 && (
                  <div className="mb-4">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[#8B7E74]">
                      이론 슬라이드 (강사 화면 전용)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {recordedSlideContents.map((content) => (
                        <a
                          key={content.id}
                          href={content.slideUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E3DD] bg-white px-4 py-2.5 text-sm font-bold text-[#4A3728] shadow-sm transition-all hover:border-[#8B5E3C]"
                        >
                          <Presentation size={14} className="text-[#8B5E3C]" />
                          {content.title}
                          <ExternalLink size={12} className="text-[#8B7E74]" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {recordedPracticeContents.length > 0 ? (
                  <div>
                    <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#8B7E74]">
                      실습 (학생 화면)
                      <span className="rounded-full bg-[#EEF7F0] px-2 py-0.5 text-[10px] text-[#2D7A4D]">
                        {publishedPracticeCount}/{recordedPracticeContents.length} 공개됨
                      </span>
                    </p>
                    <div className="space-y-2">
                      {recordedPracticeContents.map((content) => {
                        const isPublished = publishedContentIdSet.has(content.id);
                        return (
                          <div
                            key={content.id}
                            className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition-all ${
                              isPublished
                                ? 'border-[#BFE3CC] bg-[#F2FBF3]'
                                : 'border-[#E5E3DD] bg-white'
                            }`}
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              {isPublished ? (
                                <Eye size={16} className="shrink-0 text-[#2D7A4D]" />
                              ) : (
                                <Lock size={16} className="shrink-0 text-[#8B7E74]" />
                              )}
                              <span className="truncate text-sm font-bold text-[#4A3728]">
                                {content.title}
                              </span>
                            </div>
                            <button
                              onClick={() => handleTogglePublishContent(content)}
                              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                                isPublished
                                  ? 'bg-[#FDECEC] text-[#B42318] hover:bg-[#FAD4D1]'
                                  : 'bg-[#8B5E3C] text-white hover:bg-[#724D31]'
                              }`}
                            >
                              {isPublished ? (
                                <>
                                  <EyeOff size={14} />
                                  잠그기
                                </>
                              ) : (
                                <>
                                  <Eye size={14} />
                                  공개
                                </>
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="rounded-2xl border border-dashed border-[#E5E3DD] bg-white px-4 py-5 text-center text-sm text-[#8B7E74]">
                    공개할 실습(HTML) 콘텐츠가 아직 없습니다. 위에서 실습 콘텐츠를 수업기록에 추가해주세요.
                  </p>
                )}
              </div>
            )}

            {assignedContents.length > 0 ? (
              <div className="space-y-5">
                {contentsByCategory.map(({ category, catContents }) => (
                  <div key={category.id}>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[#8B7E74]">
                      {category.name}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {catContents.map((content) => {
                        const isRecorded = currentDateRecordedContentIdSet.has(content.id);
                        return (
                          <button
                            key={content.id}
                            onClick={() => handleToggleDateRecordContent(content)}
                            className={`rounded-full border px-5 py-3 text-left text-sm font-bold transition-all ${
                              isRecorded
                                ? 'border-[#CFE0FF] bg-[#EAF2FF] text-[#2F5EA8] shadow-sm'
                                : 'border-[#D7EBD9] bg-[#F2FBF3] text-[#2F7A4D] hover:-translate-y-0.5 hover:bg-[#E3F6E6] hover:shadow-sm'
                            }`}
                          >
                            {content.title}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[28px] border border-dashed border-[#E5E3DD] bg-[#FBFBFA] px-6 py-8 text-sm text-[#8B7E74]">
                먼저 클래스에 학생 페이지용 콘텐츠를 배정해주세요.
              </div>
            )}
          </div>
        )}

        {isCurrentDateActive && (
          <div className="rounded-[32px] border border-[#E5E3DD] bg-white p-8 text-left shadow-sm">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-3">
                <h2 className="flex items-center gap-2 text-xl font-bold text-[#4A3728]">
                  <CheckCircle2 className="text-[#8B5E3C]" size={20} />
                  출석 체크 ({attendanceStats.present}명 출석)
                  <DashboardInfoTooltip
                    content={attendanceTooltipText}
                    label="출석 체크 설명 보기"
                  />
                </h2>
                <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                  <span className="rounded-full bg-[#F3F2EE] px-3 py-1.5 text-[#8B7E74]">
                    대상 {attendanceStats.total}명
                  </span>
                  {attendanceStats.absent > 0 && (
                    <span className="rounded-full bg-[#FDECEC] px-3 py-1.5 text-[#B42318]">
                      결 {attendanceStats.absent}
                    </span>
                  )}
                  {attendanceStats.late > 0 && (
                    <span className="rounded-full bg-[#FFF4D9] px-3 py-1.5 text-[#7A6A2D]">
                      지 {attendanceStats.late}
                    </span>
                  )}
                  {excludedAttendanceCount > 0 && (
                    <span className="rounded-full bg-[#F3F2EE] px-3 py-1.5 text-[#8B7E74]">
                      제외 {excludedAttendanceCount}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="custom-scrollbar max-h-[400px] space-y-2 overflow-y-auto pr-2">
              {sortedAttendanceRecords.map((record) => {
                const sourceStudent = allStudentsById.get(record.studentId);
                const isInactiveStudent = sourceStudent ? isStudentInactive(sourceStudent) : false;
                const isExcluded = isAttendanceExcluded(record);
                const displayInitials = sourceStudent?.initials || '??';
                const displayName = sourceStudent?.name || '알 수 없는 학생';
                const helperText =
                  isInactiveStudent && isExcluded
                    ? '비활성 학생, 출석 제외'
                    : isInactiveStudent
                      ? '비활성 학생'
                      : isExcluded
                        ? '출석 제외'
                        : null;

                return (
                  <div
                    key={record.studentId}
                    className={`flex flex-col gap-3 rounded-2xl border p-3.5 transition-all sm:flex-row sm:items-center sm:gap-4 ${
                      isExcluded
                        ? 'border-dashed border-[#D8D1C8] bg-[#F5F2EE] opacity-80'
                        : isInactiveStudent
                          ? 'border-[#E5E3DD] bg-[#F8F7F4] opacity-85'
                          : 'border-[#F3F2EE] bg-[#FBFBFA]'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          isExcluded || isInactiveStudent
                            ? 'bg-[#E5E3DD] text-[#8B7E74]'
                            : 'bg-[#EBD9C1] text-[#8B5E3C]'
                        }`}
                      >
                        {displayInitials}
                      </div>
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="max-w-full text-sm font-bold text-[#4A3728]">
                            {displayName}
                          </span>
                          {isInactiveStudent && (
                            <span className="rounded-full bg-[#E5E3DD] px-2.5 py-1 text-[10px] font-bold text-[#6B625A]">
                              비활성
                            </span>
                          )}
                          {isExcluded && (
                            <span className="rounded-full bg-[#FFF4D9] px-2.5 py-1 text-[10px] font-bold text-[#7A6A2D]">
                              제외
                            </span>
                          )}
                        </div>
                        {helperText && (
                          <p className="mt-1 truncate text-xs text-[#8B7E74]">{helperText}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <div className="flex gap-1">
                        {(['Present', 'Absent', 'Late'] as const).map((status) => {
                          const fullLabel =
                            status === 'Present' ? '출석' : status === 'Absent' ? '결석' : '지각';

                          return (
                            <button
                              key={status}
                              onClick={() => updateAttendance(record.studentId, status)}
                              disabled={isExcluded}
                              title={fullLabel}
                              aria-label={`${displayName} ${fullLabel}`}
                              className={`rounded-lg px-3 py-1.5 text-[10px] font-bold transition-all ${
                                isExcluded
                                  ? 'cursor-not-allowed border border-[#E5E3DD] bg-[#F7F4EF] text-[#B3ABA2]'
                                  : record.status === status
                                    ? status === 'Present'
                                      ? 'bg-[#D1F3E0] text-[#2D7A4D]'
                                      : status === 'Absent'
                                        ? 'bg-[#F3D1D1] text-[#7A2D2D]'
                                        : 'bg-[#F3EBD1] text-[#7A6A2D]'
                                    : 'border border-[#E5E3DD] bg-white text-[#8B7E74] hover:bg-[#F3F2EE]'
                              }`}
                            >
                              {fullLabel}
                            </button>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleAttendanceExclusion(record.studentId)}
                        title={isExcluded ? '다시 포함' : '제외'}
                        aria-label={`${displayName} ${isExcluded ? '다시 포함' : '제외'}`}
                        className={`inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-[10px] font-bold transition-all ${
                          isExcluded
                            ? 'bg-[#EEF7F0] text-[#2D7A4D] hover:bg-[#DDEFE2]'
                            : 'bg-[#FDECEC] text-[#B42318] hover:bg-[#FAD4D1]'
                        }`}
                      >
                        {isExcluded ? '다시 포함' : <X size={12} />}
                      </button>
                    </div>
                  </div>
                );
              })}

              {(!currentDateRecord || currentDateRecord.attendance.length === 0) && (
                <div className="py-6 text-center text-sm text-[#8B7E74]">
                  현재 날짜 기록에 저장된 학생 출석 정보가 없습니다.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

        <div className="space-y-6">
          <div className="rounded-[32px] border border-[#E5E3DD] bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-start justify-between gap-3">
              <div className="space-y-2">
                <h3 className="flex items-center gap-2 text-lg font-bold text-[#4A3728]">
                  <Calendar className="text-[#8B5E3C]" size={18} />
                  {viewMonth.getFullYear()}년 {viewMonth.getMonth() + 1}월
                  <DashboardInfoTooltip content={calendarTooltipText} label="캘린더 설명 보기" />
                </h3>
                <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                  <span className="rounded-full bg-[#FFF5E9] px-3 py-1.5 text-[#8B5E3C]">
                    {selectedDate}
                  </span>
                  <span
                    className={`rounded-full px-3 py-1.5 ${
                      isCurrentDateActive
                        ? 'bg-[#EEF7F0] text-[#2D7A4D]'
                        : 'bg-[#F3F2EE] text-[#8B7E74]'
                    }`}
                  >
                    {isCurrentDateActive ? '활성 날짜' : '비활성 날짜'}
                  </span>
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() =>
                    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))
                  }
                  className="rounded-lg p-1.5 text-[#8B7E74] transition-all hover:bg-[#F3F2EE]"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() =>
                    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))
                  }
                  className="rounded-lg p-1.5 text-[#8B7E74] transition-all hover:bg-[#F3F2EE]"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            <div className="mb-2 grid grid-cols-7 gap-1">
              {weekDays.map((day) => (
                <div key={day} className="py-1 text-center text-[10px] font-bold text-[#A89F94]">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((date, idx) => {
                if (!date) {
                  return <div key={`empty-${idx}`} className="h-8" />;
                }

                const dateStr = getLocalDateString(date);
                const isSelected = dateStr === selectedDate;
                const isToday = dateStr === getLocalDateString(new Date());
                const isActive = activeDateSet.has(dateStr);
                const hasMemo = memoDateSet.has(dateStr);
                const plannedSessions = plannedSessionsByDate.get(dateStr);

                return (
                  <button
                    key={dateStr}
                    onClick={() => setSelectedDate(dateStr)}
                    title={
                      plannedSessions
                        ? plannedSessions.map((session) => `${session.order}회차 ${session.topic}`).join(', ')
                        : undefined
                    }
                    className={`relative flex h-8 w-full items-center justify-center rounded-lg text-xs font-bold transition-all ${
                      isSelected
                        ? 'bg-[#8B5E3C] text-white shadow-md shadow-[#8B5E3C]/20'
                        : isToday
                          ? 'bg-[#FFF5E9] text-[#8B5E3C]'
                          : 'text-[#4A3728] hover:bg-[#F3F2EE]'
                    }`}
                  >
                    {date.getDate()}
                    <span className="absolute bottom-1 flex items-center gap-0.5">
                      {isActive && (
                        <span
                          className={`h-1.5 w-1.5 rounded-full transition-all ${
                            hasMemo
                              ? isSelected ? 'bg-white' : 'bg-[#8B5E3C]'
                              : isSelected ? 'border border-white' : 'border border-[#8B5E3C]'
                          }`}
                        />
                      )}
                      {plannedSessions && (
                        <span
                          className={`h-1.5 w-1.5 rounded-full border border-dashed transition-all ${
                            isSelected ? 'border-white/80' : 'border-[#C4956A]'
                          }`}
                        />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            {plannedSessionsByDate.size > 0 && (
              <p className="mt-2 text-right text-[10px] text-[#A89F94]">점선 ○ = 커리큘럼 예정일</p>
            )}
          </div>

          {isCurrentDateActive ? (
            <div className="rounded-[32px] border border-[#E5E3DD] bg-white p-6 text-left shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <h2 className="flex items-center gap-2 text-lg font-bold text-[#4A3728]">
                    <MessageSquare className="text-[#8B5E3C]" size={18} />
                    오늘의 수업 메모
                    <DashboardInfoTooltip content={memoTooltipText} label="수업 메모 설명 보기" />
                  </h2>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleSaveMemo}
                    disabled={!isMemoDirty}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#8B5E3C] px-4 py-2 text-[0px] font-bold text-white transition-all hover:bg-[#724D31] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="inline-flex items-center gap-2 text-xs leading-none">
                      <Save size={14} />
                      저장
                    </span>
                    {isGeneratingMemoDraft ? '메모 초안 생성 중...' : '메모 초안 생성'}
                  </button>
                </div>
              </div>
              <textarea
                value={localMemo}
                onChange={(event) => {
                  const nextMemo = event.target.value;
                  setLocalMemo(nextMemo);
                  setGenerationMessage(null);
                }}
                placeholder="특이사항이나 운영 메모를 기록하세요."
                className="custom-scrollbar min-h-[140px] w-full resize-none rounded-2xl border border-[#F3F2EE] bg-[#FBFBFA] p-4 text-sm outline-none transition-all focus:border-[#8B5E3C]"
              />
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => void handleGenerateMemoDraftClick()}
                  disabled={isGeneratingMemoDraft}
                  className="rounded-xl border border-[#E5E3DD] px-4 py-2 text-xs font-bold text-[#4A3728] transition-all hover:bg-[#F3F2EE] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isGeneratingMemoDraft ? '메모 초안 생성 중...' : '메모 초안 생성'}
                </button>
              </div>

              {generationMessage && (
                <p className="mt-3 text-xs font-medium text-[#2D7A4D]">{generationMessage}</p>
              )}
              {generationError && (
                <p className="mt-3 text-xs font-medium text-[#B42318]">{generationError}</p>
              )}
            </div>
          ) : (
            <div className="rounded-[32px] border border-[#E5E3DD] bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-start gap-2 text-[#8B5E3C]">
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                <div className="space-y-2">
                  <h2 className="flex items-center gap-2 text-lg font-bold text-[#4A3728]">
                    기록 대기 상태
                    <DashboardInfoTooltip
                      content={waitingTooltipText}
                      label="기록 대기 상태 설명 보기"
                    />
                  </h2>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                    <span className="rounded-full bg-[#FFF5E9] px-3 py-1.5 text-[#8B5E3C]">
                      {selectedDate}
                    </span>
                    <span className="rounded-full bg-[#F3F2EE] px-3 py-1.5 text-[#8B7E74]">
                      비활성
                    </span>
                    <span className="rounded-full bg-[#FBFBFA] px-3 py-1.5 text-[#8B7E74]">
                      활성화 전
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    );
  };

  const renderStudentCard = (student: Student, index: number) => {
    const inactive = isStudentInactive(student);
    const inactiveDate = formatStudentInactiveDate(student.inactiveAt);

    return (
      <motion.div
        key={student.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05 }}
        className={`group overflow-hidden rounded-2xl border ${
          inactive ? 'border-[#E5E3DD] bg-[#F8F7F4]' : 'border-[#F3F2EE] bg-[#FBFBFA]'
        }`}
      >
        <div
          className={`flex cursor-pointer items-center justify-between p-4 transition-all ${
            inactive ? 'hover:bg-[#F1EFEA]' : 'hover:bg-[#F3F2EE]'
          }`}
          onClick={() => setExpandedStudent(expandedStudent === student.id ? null : student.id)}
        >
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold ${
                inactive ? 'bg-[#E5E3DD] text-[#8B7E74]' : 'bg-[#EBD9C1] text-[#8B5E3C]'
              }`}
            >
              {student.initials}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="block font-bold text-[#4A3728]">{student.name}</span>
                {inactive && (
                  <span className="rounded-full bg-[#E5E3DD] px-2.5 py-1 text-[10px] font-bold text-[#6B625A]">
                    비활성
                  </span>
                )}
              </div>
              {(student.age || student.contact || inactiveDate) && (
                <span className="text-xs text-[#A89F94]">
                  {[student.age, student.contact, inactiveDate ? `비활성 ${inactiveDate}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={(event) => {
              event.stopPropagation();
              void handleRemoveStudent(student);
            }}
            disabled={isSavingStudentAction}
            className="rounded-full p-1 text-[#A89F94] opacity-0 transition-all hover:bg-red-100 hover:text-red-500 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
            title="학생 삭제"
          >
            <X size={14} />
          </button>
        </div>

        <AnimatePresence>
          {expandedStudent === student.id && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-t border-[#F3F2EE] px-4 pb-4"
            >
              {editingStudent?.id === student.id ? (
                <div className="space-y-2 pt-4">
                  <input
                    value={editingStudent.name}
                    onChange={(event) =>
                      setEditingStudent({ ...editingStudent, name: event.target.value })
                    }
                    disabled={isSavingStudentAction}
                    placeholder="이름"
                    className="w-full rounded-xl border border-[#E5E3DD] px-3 py-2 text-sm focus:border-[#8B5E3C] focus:outline-none"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={editingStudent.age || ''}
                      onChange={(event) =>
                        setEditingStudent({ ...editingStudent, age: event.target.value })
                      }
                      disabled={isSavingStudentAction}
                      placeholder="나이"
                      className="rounded-xl border border-[#E5E3DD] px-3 py-2 text-sm focus:border-[#8B5E3C] focus:outline-none"
                    />
                    <input
                      value={editingStudent.contact || ''}
                      onChange={(event) =>
                        setEditingStudent({ ...editingStudent, contact: event.target.value })
                      }
                      disabled={isSavingStudentAction}
                      placeholder="연락처"
                      className="rounded-xl border border-[#E5E3DD] px-3 py-2 text-sm focus:border-[#8B5E3C] focus:outline-none"
                    />
                  </div>
                  <textarea
                    value={editingStudent.memo || ''}
                    onChange={(event) =>
                      setEditingStudent({ ...editingStudent, memo: event.target.value })
                    }
                    disabled={isSavingStudentAction}
                    placeholder="기타 메모"
                    rows={2}
                    className="w-full resize-none rounded-xl border border-[#E5E3DD] px-3 py-2 text-sm focus:border-[#8B5E3C] focus:outline-none"
                  />
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => void handleSaveStudentEdit(editingStudent)}
                      disabled={isSavingStudentAction || !editingStudent.name.trim()}
                      className="flex-1 rounded-xl bg-[#8B5E3C] py-2 text-sm font-bold text-white transition-all hover:bg-[#724D31] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {studentAction === 'edit' ? '저장 중...' : '저장'}
                    </button>
                    <button
                      onClick={() => setEditingStudent(null)}
                      disabled={isSavingStudentAction}
                      className="rounded-xl bg-[#F3F2EE] px-4 py-2 text-sm font-bold text-[#8B7E74] transition-all hover:bg-[#E5E3DD]"
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 pt-4 text-sm">
                  {student.age && (
                    <div className="flex items-center gap-2 text-[#8B7E74]">
                      <span className="w-16 text-[#A89F94]">나이</span>
                      <span className="font-medium text-[#4A3728]">{student.age}</span>
                    </div>
                  )}
                  {student.contact && (
                    <div className="flex items-center gap-2 text-[#8B7E74]">
                      <span className="w-16 text-[#A89F94]">연락처</span>
                      <span className="font-medium text-[#4A3728]">{student.contact}</span>
                    </div>
                  )}
                  {student.memo && (
                    <div className="flex items-start gap-2 text-[#8B7E74]">
                      <span className="w-16 text-[#A89F94]">메모</span>
                      <span className="font-medium text-[#4A3728]">{student.memo}</span>
                    </div>
                  )}
                  {inactiveDate && (
                    <div className="flex items-center gap-2 text-[#8B7E74]">
                      <span className="w-16 text-[#A89F94]">비활성일</span>
                      <span className="font-medium text-[#4A3728]">{inactiveDate}</span>
                    </div>
                  )}
                  {!student.age && !student.contact && !student.memo && !inactiveDate && (
                    <p className="italic text-[#A89F94]">추가 정보 없음</p>
                  )}

                  <div className="mt-4 border-t border-[#F3F2EE] pt-4">
                    <p className="mb-2 text-[11px] font-bold tracking-wide text-[#A89F94]">클래스 이동</p>
                    {availableMoveClassrooms.length > 0 ? (
                      <div className="flex gap-2">
                        <select
                          value={studentMoveTargets[student.id] || defaultMoveTargetClassroomId}
                          onChange={(event) =>
                            setStudentMoveTargets((currentTargets) => ({
                              ...currentTargets,
                              [student.id]: event.target.value,
                            }))
                          }
                          disabled={isSavingStudentAction}
                          className="flex-1 rounded-xl border border-[#E5E3DD] bg-white px-3 py-2 text-sm text-[#4A3728] outline-none focus:border-[#8B5E3C]"
                        >
                          {availableMoveClassrooms.map((targetClassroom) => (
                            <option key={targetClassroom.id} value={targetClassroom.id}>
                              {targetClassroom.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => void handleMoveStudentToClassroom(student)}
                          disabled={isSavingStudentAction || !(studentMoveTargets[student.id] || defaultMoveTargetClassroomId)}
                          className="rounded-xl bg-[#FFF5E9] px-4 py-2 text-xs font-bold text-[#8B5E3C] transition-all hover:bg-[#EBD9C1] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {studentAction === 'move' ? '이동 중...' : '클래스 이동'}
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-[#A89F94]">이동 가능한 다른 클래스가 없습니다.</p>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      disabled={isSavingStudentAction}
                      onClick={() => setEditingStudent({ ...student })}
                      className="rounded-xl bg-[#F3F2EE] px-4 py-1.5 text-xs font-bold text-[#8B5E3C] transition-all hover:bg-[#EBD9C1]"
                    >
                      수정
                    </button>
                    {inactive ? (
                      <button
                        disabled={isSavingStudentAction}
                        onClick={() => void handleReactivateStudent(student)}
                        className="inline-flex items-center gap-1 rounded-xl bg-[#EEF7F0] px-4 py-1.5 text-xs font-bold text-[#2D7A4D] transition-all hover:bg-[#DDEFE2] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Undo2 size={12} />
                        {studentAction === 'reactivate' ? '활성화 중...' : '다시 활성화'}
                      </button>
                    ) : (
                      <button
                        disabled={isSavingStudentAction}
                        onClick={() => void handleDeactivateStudent(student)}
                        className="inline-flex items-center gap-1 rounded-xl bg-[#F3F2EE] px-4 py-1.5 text-xs font-bold text-[#8B7E74] transition-all hover:bg-[#E5E3DD] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <UserMinus size={12} />
                        {studentAction === 'deactivate' ? '처리 중...' : '비활성 처리'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  const renderStudentSection = (
    title: string,
    description: string,
    sectionStudents: Student[],
    emptyMessage: string,
    variant: 'active' | 'inactive'
  ) => (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-[#4A3728]">{title}</h3>
          <p className="mt-1 text-sm text-[#8B7E74]">{description}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${
            variant === 'active'
              ? 'bg-[#FFF5E9] text-[#8B5E3C]'
              : 'bg-[#F3F2EE] text-[#8B7E74]'
          }`}
        >
          {sectionStudents.length}명
        </span>
      </div>

      {sectionStudents.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {sectionStudents.map((student, index) => renderStudentCard(student, index))}
        </div>
      ) : (
        <div className="rounded-[28px] border border-dashed border-[#E5E3DD] bg-[#FBFBFA] px-6 py-8 text-sm text-[#8B7E74]">
          {emptyMessage}
        </div>
      )}
    </section>
  );

  const renderStudentsTab = () => (
    <motion.div
      key="students"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="rounded-[40px] border border-[#E5E3DD] bg-white p-10 text-left shadow-sm"
    >
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F3F2EE] text-[#8B5E3C]">
            <Users size={20} />
          </div>
          <div>
            <h2 className="text-2xl font-bold">학생 명단 ({activeCount}명)</h2>
            <p className="mt-1 text-sm text-[#8B7E74]">새 출석 체크에는 활성 학생만 포함됩니다.</p>
          </div>
        </div>
        {inactiveCount > 0 && (
          <span className="rounded-full bg-[#F3F2EE] px-3 py-1 text-xs font-bold text-[#8B7E74]">
            비활성 {inactiveCount}명
          </span>
        )}
      </div>

      <div className="mb-8">
        {!isStudentCreateFormOpen && (
          <button
            type="button"
            onClick={() => setIsStudentCreateFormOpen(true)}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#8B5E3C] px-6 py-3.5 font-bold text-white shadow-md transition-all hover:bg-[#724D31]"
          >
            <UserPlus size={16} />
            신규 등록
          </button>
        )}

        <AnimatePresence initial={false}>
          {isStudentCreateFormOpen && (
            <motion.div
              key="student-create-form"
              initial={{ opacity: 0, height: 0, y: -8 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="rounded-[28px] border border-[#E5E3DD] bg-[#FBFBFA] p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-[#4A3728]">신규 학생 등록</h3>
                    <p className="mt-1 text-sm text-[#8B7E74]">
                      필요한 정보만 입력하고 신규 등록을 눌러 학생 명단에 추가하세요.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsStudentCreateFormOpen(false)}
                    disabled={isSavingStudentAction}
                    className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-[#8B7E74] transition-all hover:bg-[#F3F2EE] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    접기
                  </button>
                </div>

                <div className="flex gap-4">
                  <div className="grid flex-1 grid-cols-2 gap-3">
                    <div className="relative col-span-2">
                      <input
                        type="text"
                        value={newStudentName}
                        onChange={(event) => setNewStudentName(event.target.value)}
                        disabled={isSavingStudentAction}
                        placeholder="이름 (필수)"
                        className="w-full rounded-2xl border border-[#E5E3DD] bg-white py-3 pl-10 pr-4 text-sm transition-all focus:border-[#8B5E3C] focus:outline-none"
                      />
                      <UserPlus size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A89F94]" />
                    </div>
                    <input
                      type="text"
                      value={newStudentAge}
                      onChange={(event) => setNewStudentAge(event.target.value)}
                      disabled={isSavingStudentAction}
                      placeholder="나이"
                      className="rounded-2xl border border-[#E5E3DD] bg-white px-4 py-3 text-sm transition-all focus:border-[#8B5E3C] focus:outline-none"
                    />
                    <input
                      type="text"
                      value={newStudentContact}
                      onChange={(event) => setNewStudentContact(event.target.value)}
                      disabled={isSavingStudentAction}
                      placeholder="연락처"
                      className="rounded-2xl border border-[#E5E3DD] bg-white px-4 py-3 text-sm transition-all focus:border-[#8B5E3C] focus:outline-none"
                    />
                    <div className="col-span-2">
                      <textarea
                        value={newStudentMemo}
                        onChange={(event) => setNewStudentMemo(event.target.value)}
                        disabled={isSavingStudentAction}
                        placeholder="학생 메모"
                        rows={3}
                        className="w-full resize-none rounded-2xl border border-[#E5E3DD] bg-white px-4 py-3 text-sm transition-all focus:border-[#8B5E3C] focus:outline-none"
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => void handleAddStudent()}
                    disabled={isSavingStudentAction || !newStudentName.trim()}
                    className="self-start rounded-2xl bg-[#8B5E3C] px-6 py-4 font-bold text-white shadow-md transition-all hover:bg-[#724D31] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-[#8B5E3C]"
                  >
                    {studentAction === 'add' ? '저장 중...' : '신규 등록'}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {studentSaveError && <p className="mb-6 text-sm font-medium text-red-500">{studentSaveError}</p>}

      <div className="space-y-10">
        {renderStudentSection(
          '활성 학생',
          '현재 출석 체크 대상에 포함되는 학생입니다.',
          activeStudents,
          '현재 활성 학생이 없습니다.',
          'active'
        )}
        {renderStudentSection(
          '비활성 학생',
          '보류 중이거나 현재 출석 체크에서 제외할 학생입니다. 기존 출석 기록은 그대로 남습니다.',
          inactiveStudents,
          '비활성 처리된 학생이 없습니다.',
          'inactive'
        )}
      </div>
    </motion.div>
  );

  const renderCurriculumTab = () => {
    const canAssign = Boolean(classroom.calendarClassId && classroom.curriculumId && onAssignCurriculumDates);

    return (
      <motion.div
        key="curriculum"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="space-y-6"
      >
        {/* 연결 설정 */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-[32px] border border-[#E5E3DD] bg-white p-6 shadow-sm sm:p-8">
            <h3 className="mb-2 flex items-center gap-2 text-lg font-bold text-[#4A3728]">
              <CalendarClock className="text-[#8B5E3C]" size={18} />
              참고 시간표 연결
            </h3>
            <p className="mb-4 text-sm text-[#8B7E74]">
              calendar.damuna.org에 FM으로 짜둔 시간표를 고르면, 그 수업 날짜로 회차 일정을 자동 배정할 수 있습니다.
            </p>
            {calendarClassesError ? (
              <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                {calendarClassesError}
              </div>
            ) : (
              <select
                value={classroom.calendarClassId || ''}
                disabled={calendarClassesLoading || !onUpdateClassroom}
                onChange={(event) =>
                  onUpdateClassroom?.(classroom.id, { calendarClassId: event.target.value || null })
                }
                className="w-full rounded-2xl border border-[#E5E3DD] bg-[#FBFBFA] px-4 py-3 text-sm font-medium text-[#4A3728] focus:border-[#8B5E3C] focus:outline-none disabled:opacity-60"
              >
                <option value="">{calendarClassesLoading ? '불러오는 중...' : '연결 안 함'}</option>
                {calendarClasses.map((calendarClass) => (
                  <option key={calendarClass.id} value={calendarClass.id}>
                    {calendarClass.name}
                    {calendarClass.instructor ? ` (${calendarClass.instructor})` : ''}
                  </option>
                ))}
              </select>
            )}
            {linkedCalendarClass && (
              <div className="mt-4 space-y-2 rounded-2xl bg-[#FBF4EA] px-4 py-3 text-sm text-[#8B5E3C]">
                {linkedCalendarClass.schedules.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {linkedCalendarClass.schedules.map((schedule, index) => (
                      <span key={index} className="rounded-full bg-white px-3 py-1.5 font-bold shadow-sm">
                        {formatSchedule(schedule)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p>등록된 반복 일정이 없습니다.</p>
                )}
                {(linkedCalendarClass.startDate || linkedCalendarClass.endDate) && (
                  <p className="text-xs text-[#A2906F]">
                    기간: {linkedCalendarClass.startDate || '제한 없음'} ~ {linkedCalendarClass.endDate || '제한 없음'}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="rounded-[32px] border border-[#E5E3DD] bg-white p-6 shadow-sm sm:p-8">
            <h3 className="mb-2 flex items-center gap-2 text-lg font-bold text-[#4A3728]">
              <Link2 className="text-[#8B5E3C]" size={18} />
              커리큘럼 연결
            </h3>
            <p className="mb-4 text-sm text-[#8B7E74]">
              이 클래스에서 진행할 커리큘럼을 연결하세요. 회차별 주제와 진행 상태를 여기에서 관리합니다.
            </p>
            <select
              value={classroom.curriculumId || ''}
              disabled={!onUpdateClassroom}
              onChange={(event) =>
                onUpdateClassroom?.(classroom.id, { curriculumId: event.target.value || null })
              }
              className="w-full rounded-2xl border border-[#E5E3DD] bg-[#FBFBFA] px-4 py-3 text-sm font-medium text-[#4A3728] focus:border-[#8B5E3C] focus:outline-none disabled:opacity-60"
            >
              <option value="">연결 안 함</option>
              {(curriculums || []).map((curriculum) => (
                <option key={curriculum.id} value={curriculum.id}>
                  {curriculum.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 자동 배정 */}
        <div className="rounded-[32px] border border-[#E5E3DD] bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-[#4A3728]">시간표로 회차 날짜 자동 배정</h3>
              <p className="text-sm text-[#8B7E74]">
                참고 시간표의 실제 수업 날짜를 1회차부터 순서대로 채웁니다. 완료·건너뜀 회차는 제외됩니다.
              </p>
            </div>
            <button
              onClick={handleAssignCurriculumDatesClick}
              disabled={!canAssign || isAssigningDates}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#8B5E3C] px-6 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-[#724D31] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-[#8B5E3C]"
            >
              {isAssigningDates ? <Loader2 size={16} className="animate-spin" /> : <CalendarClock size={16} />}
              {isAssigningDates ? '배정 중...' : '날짜 자동 배정'}
            </button>
          </div>
          {!canAssign && (
            <p className="mt-3 text-xs text-[#A2906F]">
              참고 시간표와 커리큘럼을 모두 연결해야 배정할 수 있습니다.
            </p>
          )}
          {assignMessage && (
            <div className="mt-4 rounded-2xl border border-[#D7EBD9] bg-[#F2FBF3] px-4 py-3 text-sm font-medium text-[#2F7A4D]">
              {assignMessage}
            </div>
          )}
          {assignError && (
            <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
              {assignError}
            </div>
          )}
        </div>

        {/* 회차 편집 */}
        <div className="rounded-[32px] border border-[#E5E3DD] bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-lg font-bold text-[#4A3728]">
              <ListChecks className="text-[#8B5E3C]" size={18} />
              커리큘럼 회차
              {linkedCurriculum && (
                <span className="rounded-full bg-[#F3F2EE] px-3 py-1 text-xs font-bold text-[#8B7E74]">
                  {sessionDrafts.length}회차
                </span>
              )}
            </h3>
            {linkedCurriculum && onSaveCurriculumSessions && (
              <div className="flex items-center gap-2">
                {isSessionsDirty && (
                  <button
                    onClick={resetSessionDrafts}
                    disabled={isSavingSessions}
                    className="rounded-xl border border-[#E5E3DD] px-4 py-2 text-sm font-bold text-[#8B7E74] transition-all hover:bg-[#F3F2EE] disabled:opacity-60"
                  >
                    되돌리기
                  </button>
                )}
                <button
                  onClick={handleSaveSessionDrafts}
                  disabled={!isSessionsDirty || isSavingSessions}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#8B5E3C] px-4 py-2 text-sm font-bold text-white shadow-md transition-all hover:bg-[#724D31] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-[#8B5E3C]"
                >
                  {isSavingSessions ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {isSavingSessions ? '저장 중...' : '회차 저장'}
                </button>
              </div>
            )}
          </div>

          {sessionSaveError && (
            <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
              {sessionSaveError}
            </div>
          )}

          {!linkedCurriculum ? (
            <div className="rounded-[24px] border border-dashed border-[#E5E3DD] bg-[#FBFBFA] px-6 py-8 text-center text-sm text-[#8B7E74]">
              연결된 커리큘럼이 없습니다. 위에서 커리큘럼을 먼저 연결하세요. (전체 커리큘럼 생성은 ChatGPT/Claude로)
            </div>
          ) : (
            <div className="space-y-2">
              {sessionDrafts.map((session, index) => (
                <div
                  key={session.id}
                  className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#F3F2EE] bg-[#FBFBFA] px-3 py-3 sm:flex-nowrap"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EBD9C1] text-xs font-bold text-[#8B5E3C]">
                    {index + 1}
                  </span>
                  <input
                    value={session.topic}
                    onChange={(event) => updateSessionDraft(session.id, { topic: event.target.value })}
                    placeholder="회차 주제"
                    className="min-w-0 flex-1 rounded-xl border border-[#E5E3DD] bg-white px-3 py-2 text-sm font-medium text-[#4A3728] focus:border-[#8B5E3C] focus:outline-none"
                  />
                  <input
                    type="date"
                    value={session.plannedDate || ''}
                    onChange={(event) =>
                      updateSessionDraft(session.id, { plannedDate: event.target.value })
                    }
                    className="shrink-0 rounded-xl border border-[#E5E3DD] bg-white px-3 py-2 text-sm font-medium text-[#2F5EA8] focus:border-[#8B5E3C] focus:outline-none"
                  />
                  <select
                    value={session.status}
                    onChange={(event) =>
                      updateSessionDraft(session.id, {
                        status: event.target.value as CurriculumSession['status'],
                      })
                    }
                    className="shrink-0 rounded-xl border border-[#E5E3DD] bg-white px-3 py-2 text-sm font-bold text-[#8B7E74] focus:border-[#8B5E3C] focus:outline-none"
                  >
                    {(Object.keys(SESSION_STATUS_LABELS) as CurriculumSession['status'][]).map((status) => (
                      <option key={status} value={status}>
                        {SESSION_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => moveSessionDraft(session.id, -1)}
                      disabled={index === 0}
                      title="위로"
                      className="rounded-lg p-1.5 text-[#8B7E74] transition-all hover:bg-[#F3F2EE] disabled:opacity-30"
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button
                      onClick={() => moveSessionDraft(session.id, 1)}
                      disabled={index === sessionDrafts.length - 1}
                      title="아래로"
                      className="rounded-lg p-1.5 text-[#8B7E74] transition-all hover:bg-[#F3F2EE] disabled:opacity-30"
                    >
                      <ChevronDown size={16} />
                    </button>
                    <button
                      onClick={() => removeSessionDraft(session.id)}
                      title="회차 삭제"
                      className="rounded-lg p-1.5 text-[#B42318] transition-all hover:bg-[#FDECEC]"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}

              <button
                onClick={addSessionDraft}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[#E5E3DD] bg-[#FBFBFA] px-4 py-3 text-sm font-bold text-[#8B5E3C] transition-all hover:border-[#EBD9C1] hover:bg-[#FFF5E9]"
              >
                <Plus size={16} />
                회차 추가
              </button>
            </div>
          )}
        </div>
      </motion.div>
    );
  };

  const renderSettingsTab = () => {
    const PreviewIcon = getClassroomIconComponent(settingsDraft.icon);

    return (
      <motion.div
        key="settings"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="rounded-[40px] border border-[#E5E3DD] bg-white p-10 text-left shadow-sm"
      >
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F3F2EE] text-[#8B5E3C]">
              <Settings size={20} />
            </div>
            <h2 className="text-2xl font-bold">클래스 설정</h2>
          </div>
          <button
            onClick={() => {
              onUpdateClassroom?.(classroom.id, settingsDraft);
              window.alert('클래스 설정이 저장되었습니다.');
            }}
            className="flex items-center gap-2 rounded-xl bg-[#8B5E3C] px-5 py-2.5 text-sm font-bold text-white transition-all hover:bg-[#724D31]"
          >
            <Save size={16} />
            저장
          </button>
        </div>

        <div className="mb-10">
          <div className="mb-4 flex items-center gap-2">
            <Edit3 size={18} className="text-[#8B5E3C]" />
            <h3 className="text-lg font-bold text-[#4A3728]">클래스 이름</h3>
          </div>
          <input
            type="text"
            value={settingsDraft.name}
            onChange={(event) => setSettingsDraft({ ...settingsDraft, name: event.target.value })}
            className="w-full rounded-2xl border-2 border-[#E5E3DD] px-5 py-3.5 text-lg font-bold text-[#4A3728] transition-all focus:border-[#8B5E3C] focus:outline-none"
            placeholder="클래스 이름을 입력하세요."
          />
        </div>

        <div className="mb-10">
          <div className="mb-4 flex items-center gap-2">
            <Palette size={18} className="text-[#8B5E3C]" />
            <h3 className="text-lg font-bold text-[#4A3728]">대표 컬러</h3>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {CLASSROOM_COLOR_OPTIONS.map((color) => {
              const isSelected = settingsDraft.color === color.value;
              return (
                <button
                  key={color.value}
                  onClick={() => setSettingsDraft({ ...settingsDraft, color: color.value })}
                  className={`flex items-center gap-3 rounded-2xl border-2 p-4 transition-all ${
                    isSelected ? 'scale-[1.02] shadow-md' : 'border-transparent hover:border-[#E5E3DD]'
                  }`}
                  style={{
                    backgroundColor: color.bg,
                    color: color.value,
                    borderColor: isSelected ? color.value : undefined,
                  }}
                >
                  <div className="h-8 w-8 rounded-full" style={{ backgroundColor: color.value }} />
                  <span className="text-sm font-bold">{color.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-4 flex items-center gap-2">
            <Star size={18} className="text-[#8B5E3C]" />
            <h3 className="text-lg font-bold text-[#4A3728]">아이콘</h3>
          </div>
          <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
            {CLASSROOM_ICON_OPTIONS.map((iconInfo) => {
              const IconComp = getClassroomIconComponent(iconInfo.icon);
              const isSelected = settingsDraft.icon === iconInfo.icon;
              return (
                <button
                  key={iconInfo.icon}
                  onClick={() => setSettingsDraft({ ...settingsDraft, icon: iconInfo.icon })}
                  className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-4 transition-all ${
                    isSelected ? 'scale-[1.02] shadow-md' : 'border-transparent hover:border-[#E5E3DD]'
                  }`}
                  style={{
                    borderColor: isSelected ? settingsDraft.color : undefined,
                    backgroundColor: isSelected ? previewIconBg : '#FBFBFA',
                  }}
                >
                  {IconComp && (
                    <IconComp
                      size={24}
                      style={isSelected ? { color: settingsDraft.color } : undefined}
                      className={isSelected ? '' : 'text-[#A89F94]'}
                    />
                  )}
                  <span
                    className={`text-xs font-bold ${isSelected ? '' : 'text-[#A89F94]'}`}
                    style={isSelected ? { color: settingsDraft.color } : undefined}
                  >
                    {iconInfo.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-10">
          <div className="mb-4 flex items-center gap-2">
            <FolderOpen size={18} className="text-[#8B5E3C]" />
            <h3 className="text-lg font-bold text-[#4A3728]">Google Drive 폴더</h3>
          </div>
          <p className="mb-3 text-sm text-[#A89F94]">
            이 클래스 관련 파일을 저장할 Google Drive 폴더를 연결하세요.
          </p>
          {settingsDraft.driveFolderId ? (
            <div className="flex items-center gap-3 rounded-2xl border-2 border-[#E5E3DD] bg-[#FBFBFA] p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF5E9]">
                <FolderOpen size={20} className="text-[#8B5E3C]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-[#4A3728]">
                  {settingsDraft.driveFolderName || '연결됨'}
                </p>
                <p className="truncate text-xs text-[#A89F94]">{settingsDraft.driveFolderId}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <a
                  href={`https://drive.google.com/drive/folders/${settingsDraft.driveFolderId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 rounded-xl border border-[#E5E3DD] px-3 py-1.5 text-xs font-bold text-[#8B5E3C] transition-all hover:bg-[#FFF5E9]"
                >
                  <ExternalLink size={12} />
                  열기
                </a>
                <button
                  type="button"
                  onClick={() =>
                    setSettingsDraft({ ...settingsDraft, driveFolderId: '', driveFolderName: '' })
                  }
                  className="flex items-center gap-1 rounded-xl border border-[#E5E3DD] px-3 py-1.5 text-xs font-bold text-[#A89F94] transition-all hover:border-red-200 hover:text-red-400"
                >
                  <X size={12} />
                  해제
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={isPickerLoading || !import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID}
              onClick={async () => {
                const clientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID;
                const apiKey = import.meta.env.VITE_GOOGLE_PICKER_API_KEY;
                if (!clientId) return;
                setIsPickerLoading(true);
                try {
                  const folder = await openDriveFolderPicker(apiKey, clientId, userEmail);
                  if (folder) {
                    setSettingsDraft({
                      ...settingsDraft,
                      driveFolderId: folder.id,
                      driveFolderName: folder.name,
                    });
                  }
                } catch (err) {
                  console.error('Drive Picker error:', err);
                } finally {
                  setIsPickerLoading(false);
                }
              }}
              className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-[#E5E3DD] px-6 py-4 text-sm font-bold text-[#A89F94] transition-all hover:border-[#8B5E3C] hover:text-[#8B5E3C] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPickerLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <FolderOpen size={18} />
              )}
              {isPickerLoading ? '폴더 선택 중...' : 'Google Drive 폴더 선택'}
            </button>
          )}
          {!import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID && (
            <p className="mt-2 text-xs text-amber-500">
              VITE_GOOGLE_OAUTH_CLIENT_ID 환경변수가 설정되지 않았습니다.
            </p>
          )}
        </div>

        <div className="mt-10 rounded-2xl border border-[#F3F2EE] bg-[#FBFBFA] p-6">
          <p className="mb-3 text-xs font-bold text-[#A89F94]">미리보기</p>
          <div className="flex items-center gap-4">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{ backgroundColor: previewIconBg }}
            >
              <PreviewIcon size={28} style={{ color: previewIconColor }} />
            </div>
            <div>
              <h4 className="text-lg font-bold" style={{ color: previewIconColor }}>
                {settingsDraft.name}
              </h4>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[#A89F94]">
                <span>학생 {activeCount}명</span>
                {inactiveCount > 0 && (
                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-[#8B7E74]">
                    비활성 {inactiveCount}명
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 rounded-2xl border border-[#E5E3DD] bg-white p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h3 className="flex items-center gap-2 text-lg font-bold text-[#4A3728]">
                {classroom.hidden ? (
                  <EyeOff size={18} className="text-[#8B7E74]" />
                ) : (
                  <Eye size={18} className="text-[#8B5E3C]" />
                )}
                클래스 표시
              </h3>
              <p className="text-sm text-[#8B7E74]">
                {classroom.hidden
                  ? '현재 사이드바·홈 목록에서 숨겨져 있습니다. 데이터는 그대로 보존됩니다.'
                  : '가리면 사이드바·홈 목록에서 숨겨집니다. (삭제 아님 — 언제든 다시 표시 가능)'}
              </p>
            </div>
            <button
              onClick={() => onUpdateClassroom?.(classroom.id, { hidden: !classroom.hidden })}
              className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl px-6 py-3 text-sm font-bold transition-all ${
                classroom.hidden
                  ? 'bg-[#8B5E3C] text-white hover:bg-[#724D31]'
                  : 'border border-[#E5E3DD] text-[#8B7E74] hover:bg-[#F3F2EE]'
              }`}
            >
              {classroom.hidden ? <Eye size={16} /> : <EyeOff size={16} />}
              {classroom.hidden ? '다시 표시' : '클래스 가리기'}
            </button>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-red-100 bg-red-50 p-6">
          <div className="mb-3 flex items-center gap-2">
            <AlertCircle size={18} className="text-red-500" />
            <h3 className="text-lg font-bold text-red-600">위험 영역</h3>
          </div>
          <p className="mb-4 text-sm text-red-400">
            클래스를 삭제하면 활성 날짜 기록과 학생 명단이 함께 삭제됩니다.
          </p>
          <button
            onClick={() => {
              const message = `'${classroom.name}' 클래스를 정말 삭제할까요? 이 작업은 되돌릴 수 없습니다.`;
              if (window.confirm(message)) {
                onDeleteClassroom?.(classroom.id);
              }
            }}
            className="rounded-xl bg-red-500 px-6 py-3 text-sm font-bold text-white transition-all hover:bg-red-600"
          >
            클래스 삭제
          </button>
        </div>
      </motion.div>
    );
  };

  return (
    <main className="flex-1 overflow-y-auto bg-[#FBFBFA] p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <div className="mb-2 flex items-center gap-3">
            <span className="rounded-full bg-[#FFF5E9] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#8B5E3C]">
              클래스 관리
            </span>
          </div>
          <h1 className="mb-4 text-5xl font-serif font-bold text-[#4A3728]">{classroom.name}</h1>
          <p className="hidden max-w-md text-[#8B7E74]">
            클래스별 콘텐츠 배정과 날짜별 운영 기록을 한 화면에서 관리합니다.
          </p>
          <p className="hidden mt-3 max-w-2xl text-sm text-[#8B7E74]">
            콘텐츠는 학생 페이지 노출 기준이고, 날짜 기록은 활성화한 날에만 별도로 저장됩니다.
          </p>
          <p className="max-w-md text-[#8B7E74]">
            날짜별 수업 기록과 실제 진행한 콘텐츠, 출석, 메모를 한 화면에서 관리합니다.
          </p>
          <p className="mt-3 max-w-2xl text-sm text-[#8B7E74]">
            학생 페이지에는 강사가 '공개'한 실습만 실시간으로 열리고, 날짜 기록에서는 그날 실제 진행한 수업만 별도로 남길 수 있습니다.
          </p>
        </div>

        <div className="mb-8 flex gap-8 border-b border-[#E5E3DD]">
          {[
            { id: 'dashboard', label: '수업 대시보드', icon: ClipboardList },
            { id: 'students', label: '학생 명단 관리', icon: Users },
            { id: 'curriculum', label: '커리큘럼·시간표', icon: CalendarClock },
            { id: 'settings', label: '클래스 설정', icon: Settings },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={`relative flex items-center gap-2 pb-4 text-sm font-bold transition-all ${
                activeTab === tab.id ? 'text-[#8B5E3C]' : 'text-[#8B7E74] hover:text-[#4A3728]'
              }`}
            >
              <tab.icon size={18} />
              {tab.label}
              {activeTab === tab.id && (
                <motion.div
                  layoutId="activeClassroomTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#8B5E3C]"
                />
              )}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'dashboard'
            ? renderDashboardTab()
            : activeTab === 'students'
              ? renderStudentsTab()
              : activeTab === 'curriculum'
                ? renderCurriculumTab()
                : renderSettingsTab()}
        </AnimatePresence>
      </div>
    </main>
  );
};
