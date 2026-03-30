import type { Student } from '../types';

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getTrimmedString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const getOptionalTrimmedString = (value: unknown) => {
  const trimmed = getTrimmedString(value);
  return trimmed || undefined;
};

export const getStudentInitials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '??';

export const normalizeStudentRecord = (
  value: Partial<Student> | null | undefined,
  fallback?: Partial<Student>
): Student => {
  const name = getTrimmedString(value?.name) || getTrimmedString(fallback?.name);
  const updatedAt =
    getTrimmedString(value?.updatedAt) ||
    getTrimmedString(fallback?.updatedAt) ||
    new Date(0).toISOString();
  const createdAt =
    getTrimmedString(value?.createdAt) ||
    getTrimmedString(fallback?.createdAt) ||
    updatedAt;
  const initials =
    getTrimmedString(value?.initials) ||
    getTrimmedString(fallback?.initials) ||
    getStudentInitials(name);

  return {
    id: getTrimmedString(value?.id) || getTrimmedString(fallback?.id),
    ownerUid: getTrimmedString(value?.ownerUid) || getTrimmedString(fallback?.ownerUid),
    classroomId:
      getTrimmedString(value?.classroomId) ||
      getTrimmedString(fallback?.classroomId),
    name,
    initials,
    order:
      typeof value?.order === 'number' && Number.isFinite(value.order)
        ? value.order
        : typeof fallback?.order === 'number' && Number.isFinite(fallback.order)
          ? fallback.order
          : 0,
    createdAt,
    updatedAt,
    age: getOptionalTrimmedString(value?.age) ?? getOptionalTrimmedString(fallback?.age),
    contact:
      getOptionalTrimmedString(value?.contact) ?? getOptionalTrimmedString(fallback?.contact),
    memo: getOptionalTrimmedString(value?.memo) ?? getOptionalTrimmedString(fallback?.memo),
    inactiveAt:
      getOptionalTrimmedString(value?.inactiveAt) ??
      getOptionalTrimmedString(fallback?.inactiveAt),
    deletedAt:
      getOptionalTrimmedString(value?.deletedAt) ??
      getOptionalTrimmedString(fallback?.deletedAt),
  };
};

export const isStudentInactive = (student: Student) =>
  typeof student.inactiveAt === 'string' && student.inactiveAt.trim().length > 0;

export const isStudentDeleted = (student: Student) =>
  typeof student.deletedAt === 'string' && student.deletedAt.trim().length > 0;

export const getVisibleStudents = (students: Student[] = []) =>
  students.filter((student) => !isStudentDeleted(student));

export const sortStudents = (students: Student[] = []) =>
  [...students].sort((left, right) => {
    if (left.classroomId !== right.classroomId) {
      return left.classroomId.localeCompare(right.classroomId);
    }

    if (left.order !== right.order) {
      return left.order - right.order;
    }

    const createdAtDiff =
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    if (createdAtDiff !== 0) {
      return createdAtDiff;
    }

    return left.name.localeCompare(right.name);
  });

export const splitStudentsByStatus = (students: Student[] = []) => {
  const activeStudents: Student[] = [];
  const inactiveStudents: Student[] = [];

  for (const student of students) {
    if (isStudentDeleted(student)) {
      continue;
    }

    if (isStudentInactive(student)) {
      inactiveStudents.push(student);
    } else {
      activeStudents.push(student);
    }
  }

  return {
    activeStudents,
    inactiveStudents,
  };
};

export const getStudentCounts = (students: Student[] = []) => {
  const { activeStudents, inactiveStudents } = splitStudentsByStatus(students);

  return {
    activeCount: activeStudents.length,
    inactiveCount: inactiveStudents.length,
    totalCount: activeStudents.length + inactiveStudents.length,
  };
};

export const formatStudentInactiveDate = (inactiveAt?: string) => {
  if (!inactiveAt) {
    return '';
  }

  const parsedDate = new Date(inactiveAt);
  if (Number.isNaN(parsedDate.getTime())) {
    return inactiveAt.slice(0, 10) || inactiveAt;
  }

  return formatLocalDate(parsedDate);
};

export const sanitizeStudentForStorage = (student: Student): Student => {
  const nextStudent: Student = {
    id: student.id,
    ownerUid: student.ownerUid,
    classroomId: student.classroomId,
    name: student.name,
    initials: student.initials,
    order: student.order,
    createdAt: student.createdAt,
    updatedAt: student.updatedAt,
  };

  const age = student.age?.trim();
  const contact = student.contact?.trim();
  const memo = student.memo?.trim();
  const inactiveAt = student.inactiveAt?.trim();
  const deletedAt = student.deletedAt?.trim();

  if (age) {
    nextStudent.age = age;
  }

  if (contact) {
    nextStudent.contact = contact;
  }

  if (memo) {
    nextStudent.memo = memo;
  }

  if (inactiveAt) {
    nextStudent.inactiveAt = inactiveAt;
  }

  if (deletedAt) {
    nextStudent.deletedAt = deletedAt;
  }

  return nextStudent;
};
