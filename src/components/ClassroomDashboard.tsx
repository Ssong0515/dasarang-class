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
} from 'lucide-react';
import {
  AttendanceRecord,
  ClassroomDateRecord,
  LessonCategory,
  LessonContent,
  Classroom,
  Student,
} from '../types';
import {
  getAssignedContentIdsForClassroom,
  orderAssignedContentIds,
} from '../utils/classroomContentAssignments';
import { normalizeClassroomDateRecordContentIds } from '../utils/classroomDateRecordContent';
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

interface ClassroomDashboardProps {
  classroom: Classroom;
  classrooms: Classroom[];
  studentsById: Map<string, Student>;
  dateRecords: ClassroomDateRecord[];
  categories: LessonCategory[];
  contents: LessonContent[];
  onSaveStudents: (classroomId: string, students: Student[]) => Promise<void>;
  onMoveStudent: (sourceClassroomId: string, targetClassroomId: string, studentId: string) => Promise<void>;
  onSaveDateRecord: (record: ClassroomDateRecord) => void;
  onDeleteDateRecord: (recordId: string) => void;
  onSaveClassroomContents: (classroomId: string, contentIds: string[]) => Promise<void>;
  onGoToLibrary: () => void;
  onUpdateClassroom?: (classroomId: string, data: Partial<Classroom>) => void;
  onDeleteClassroom?: (classroomId: string) => void;
}

type Tab = 'dashboard' | 'students' | 'settings';
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
  onSaveStudents,
  onMoveStudent,
  onSaveDateRecord,
  onDeleteDateRecord,
  onSaveClassroomContents,
  onGoToLibrary,
  onUpdateClassroom,
  onDeleteClassroom,
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
  const [viewMonth, setViewMonth] = useState(new Date());
  const [settingsDraft, setSettingsDraft] = useState({
    name: classroom.name,
    color: classroom.color || DEFAULT_CLASSROOM_COLOR,
    icon: classroom.icon || DEFAULT_CLASSROOM_ICON,
  });

  const isSavingStudentAction = studentAction !== null;
  const availableMoveClassrooms = classrooms.filter((candidate) => candidate.id !== classroom.id);
  const defaultMoveTargetClassroomId = availableMoveClassrooms[0]?.id || '';
  const classroomDateRecords = useMemo(
    () => dateRecords.filter((record) => record.classroomId === classroom.id),
    [dateRecords, classroom.id]
  );
  const currentDateRecord = useMemo(
    () => classroomDateRecords.find((record) => record.date === selectedDate),
    [classroomDateRecords, selectedDate]
  );
  const isCurrentDateActive = Boolean(currentDateRecord);
  const [isAssignmentCardCollapsed, setIsAssignmentCardCollapsed] = useState(true);
  const activeDateSet = useMemo(
    () => new Set(classroomDateRecords.map((record) => record.date)),
    [classroomDateRecords]
  );
  const assignedContentIds = getAssignedContentIdsForClassroom(classroom);
  const assignedContentIdSet = useMemo(() => new Set(assignedContentIds), [assignedContentIds]);
  const assignedContents = useMemo(
    () => contents.filter((content) => assignedContentIdSet.has(content.id)),
    [contents, assignedContentIdSet]
  );
  const assignedContentsById = useMemo(
    () => new Map(assignedContents.map((content) => [content.id, content])),
    [assignedContents]
  );
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

        return {
          record,
          index,
          isInactiveStudent: globalStudent ? isStudentInactive(globalStudent) : false,
        };
      })
      .sort((left, right) => {
        if (left.isInactiveStudent !== right.isInactiveStudent) {
          return left.isInactiveStudent ? 1 : -1;
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
    });
  }, [classroom.color, classroom.icon, classroom.name]);

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
    setIsAssignmentCardCollapsed(true);
  }, [classroom.id]);

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

  const handleToggleContent = (content: LessonContent) => {
    const nextIds = assignedContentIds.includes(content.id)
      ? assignedContentIds.filter((contentId) => contentId !== content.id)
      : [...assignedContentIds, content.id];

    void onSaveClassroomContents(classroom.id, orderAssignedContentIds(nextIds, contents)).catch((error) => {
      console.error('Failed to save classroom content assignments', error);
    });
  };

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
      contentIds: orderAssignedContentIds(nextIds, assignedContents),
    });
  };

  const handleSaveMemo = () => {
    if (!currentDateRecord) {
      return;
    }

    if (currentDateRecord.memo === localMemo) {
      return;
    }

    onSaveDateRecord({
      ...currentDateRecord,
      memo: localMemo,
    });
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
          <div className="rounded-[40px] border border-[#E5E3DD] bg-white p-8 shadow-sm sm:p-10">
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
                onClick={onGoToLibrary}
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
                className="flex flex-col justify-between gap-5 rounded-[28px] border border-dashed border-[#E5E3DD] bg-[#FBFBFA] px-6 py-6 text-sm text-[#8B7E74] lg:min-h-[272px]"
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

                <div className="flex flex-col gap-3 border-t border-[#E5E3DD] pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-[#8B7E74]">
                    {isCurrentDateActive
                      ? '선택한 날짜 기록용 콘텐츠를 바로 선택할 수 있습니다.'
                      : '학생 페이지에 보일 콘텐츠를 먼저 정리해두세요.'}
                  </p>
                  <button
                    onClick={onGoToLibrary}
                    className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-bold text-[#8B5E3C] shadow-sm transition-all hover:bg-[#FFF5E9]"
                  >
                    라이브러리 열기
                  </button>
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
                  <p className="opacity-80">
                    이미 배정에서 빠졌거나 삭제된 콘텐츠일 수 있습니다. 아래 목록에서는 현재 배정된 콘텐츠만 다시 선택할 수 있습니다.
                  </p>
                </div>
              </div>
            )}

            {currentDateRecordedContents.length > 0 ? (
              <div className="mb-8 flex flex-wrap items-center gap-2 border-b border-[#E5E3DD] pb-8">
                {currentDateRecordedContents.map((content) => (
                  <div key={content.id} className="group relative inline-flex">
                    <button className="cursor-default rounded-full border border-[#CFE0FF] bg-[#EAF2FF] px-5 py-3 pr-10 text-left text-sm font-bold text-[#2F5EA8] shadow-sm">
                      {content.title}
                    </button>
                    <button
                      onClick={() => handleToggleDateRecordContent(content)}
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

            {assignedContents.length > 0 ? (
              <div className="flex flex-wrap gap-3">
                {assignedContents.map((content) => {
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

                return (
                  <button
                    key={dateStr}
                    onClick={() => setSelectedDate(dateStr)}
                    className={`relative flex h-8 w-full items-center justify-center rounded-lg text-xs font-bold transition-all ${
                      isSelected
                        ? 'bg-[#8B5E3C] text-white shadow-md shadow-[#8B5E3C]/20'
                        : isToday
                          ? 'bg-[#FFF5E9] text-[#8B5E3C]'
                          : 'text-[#4A3728] hover:bg-[#F3F2EE]'
                    }`}
                  >
                    {date.getDate()}
                    {isActive && !isSelected && (
                      <div className="absolute bottom-1 h-1 w-1 rounded-full bg-[#8B5E3C]" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {isCurrentDateActive ? (
            <div className="flex h-[300px] flex-col rounded-[32px] border border-[#E5E3DD] bg-white p-6 text-left shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <h2 className="flex items-center gap-2 text-lg font-bold text-[#4A3728]">
                    <MessageSquare className="text-[#8B5E3C]" size={18} />
                    오늘의 수업 메모
                    <DashboardInfoTooltip content={memoTooltipText} label="수업 메모 설명 보기" />
                  </h2>
                  <span className="inline-flex rounded-full bg-[#FFF5E9] px-3 py-1.5 text-xs font-bold text-[#8B5E3C]">
                    {selectedDate}
                  </span>
                </div>
              </div>
              <textarea
                value={localMemo}
                onChange={(event) => setLocalMemo(event.target.value)}
                onBlur={handleSaveMemo}
                placeholder="특이사항이나 운영 메모를 기록하세요."
                className="custom-scrollbar flex-1 w-full resize-none rounded-2xl border border-[#F3F2EE] bg-[#FBFBFA] p-4 text-sm outline-none transition-all focus:border-[#8B5E3C]"
              />
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

        <div className="mt-10 rounded-2xl border border-red-100 bg-red-50 p-6">
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
          <p className="max-w-md text-[#8B7E74]">
            클래스별 콘텐츠 배정과 날짜별 운영 기록을 한 화면에서 관리합니다.
          </p>
          <p className="mt-3 max-w-2xl text-sm text-[#8B7E74]">
            콘텐츠는 학생 페이지 노출 기준이고, 날짜 기록은 활성화한 날에만 별도로 저장됩니다.
          </p>
        </div>

        <div className="mb-8 flex gap-8 border-b border-[#E5E3DD]">
          {[
            { id: 'dashboard', label: '수업 대시보드', icon: ClipboardList },
            { id: 'students', label: '학생 명단 관리', icon: Users },
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
              : renderSettingsTab()}
        </AnimatePresence>
      </div>
    </main>
  );
};
