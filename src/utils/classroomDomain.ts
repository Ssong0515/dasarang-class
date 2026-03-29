import type { Classroom, ClassroomDateRecord, Student } from '../types';

export const CLASSROOMS_COLLECTION = 'classrooms';
export const LEGACY_CLASSROOMS_COLLECTION = 'folders';
export const CLASSROOM_DATE_RECORDS_COLLECTION = 'classroomDateRecords';
export const LEGACY_CLASSROOM_DATE_RECORDS_COLLECTION = 'folderDateRecords';
export const STUDENTS_COLLECTION = 'students';
export const DAILY_REVIEWS_COLLECTION = 'dailyReviews';

const getTrimmedString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

export const getClassroomId = (
  value: { classroomId?: unknown; folderId?: unknown } | null | undefined
) => getTrimmedString(value?.classroomId) || getTrimmedString(value?.folderId);

export const getClassroomName = (
  value: { classroomName?: unknown; folderName?: unknown } | null | undefined
) => getTrimmedString(value?.classroomName) || getTrimmedString(value?.folderName);

export const toDualWriteStudentData = (student: Student) => ({
  ...student,
  classroomId: student.classroomId,
  folderId: student.classroomId,
});

export const toLegacyStudentData = (student: Student) => {
  const { classroomId, ...restStudent } = student;

  return {
    ...restStudent,
    folderId: classroomId,
  };
};

export const toDualWriteClassroomDateRecordData = (record: ClassroomDateRecord) => ({
  ...record,
  classroomId: record.classroomId,
  classroomName: record.classroomName,
  folderId: record.classroomId,
  folderName: record.classroomName,
});

export const toLegacyClassroomDateRecordData = (record: ClassroomDateRecord) => {
  const { classroomId, classroomName, ...restRecord } = record;

  return {
    ...restRecord,
    folderId: classroomId,
    folderName: classroomName,
  };
};

export const toClassroomData = (classroom: Classroom) => ({
  ...classroom,
});

export const mergeClassroomCollections = <T extends { id: string }>(
  nextItems: T[],
  legacyItems: T[]
) => {
  const mergedItems = new Map<string, T>();
  const getUpdatedAtTime = (item: T) => {
    const updatedAt = (item as { updatedAt?: unknown }).updatedAt;
    if (typeof updatedAt !== 'string' || updatedAt.trim().length === 0) {
      return Number.NaN;
    }

    return new Date(updatedAt).getTime();
  };

  const setMergedItem = (item: T) => {
    const existingItem = mergedItems.get(item.id);
    if (!existingItem) {
      mergedItems.set(item.id, item);
      return;
    }

    const existingUpdatedAt = getUpdatedAtTime(existingItem);
    const nextUpdatedAt = getUpdatedAtTime(item);
    const hasComparableTimestamps =
      Number.isFinite(existingUpdatedAt) && Number.isFinite(nextUpdatedAt);

    if (hasComparableTimestamps) {
      mergedItems.set(item.id, nextUpdatedAt >= existingUpdatedAt ? item : existingItem);
      return;
    }

    mergedItems.set(item.id, item);
  };

  legacyItems.forEach((item) => {
    setMergedItem(item);
  });

  nextItems.forEach((item) => {
    setMergedItem(item);
  });

  return [...mergedItems.values()];
};
