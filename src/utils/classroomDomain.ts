import type { ClassroomDateRecord } from '../types';

export const CLASSROOMS_COLLECTION = 'classrooms';
export const CLASSROOM_DATE_RECORDS_COLLECTION = 'classroomDateRecords';
export const STUDENTS_COLLECTION = 'students';
export const DAILY_REVIEWS_COLLECTION = 'dailyReviews';

export const getClassroomDateRecordId = (classroomId: string, date: string) =>
  `${classroomId.trim()}_${date.trim()}`;

export const getClassroomDateRecordTimestamp = (
  record: Pick<ClassroomDateRecord, 'updatedAt' | 'createdAt'>
) => {
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

export const isCanonicalClassroomDateRecordId = (
  record: Pick<ClassroomDateRecord, 'id' | 'classroomId' | 'date'>
) => record.id === getClassroomDateRecordId(record.classroomId, record.date);

const hasMemoText = (record: ClassroomDateRecord) => record.memo.trim().length > 0;

const getContentCount = (record: ClassroomDateRecord) => record.contentIds.length;

export const comparePreferredClassroomDateRecord = (
  left: ClassroomDateRecord,
  right: ClassroomDateRecord
) => {
  const leftCanonical = isCanonicalClassroomDateRecordId(left);
  const rightCanonical = isCanonicalClassroomDateRecordId(right);

  if (leftCanonical !== rightCanonical) {
    return leftCanonical ? -1 : 1;
  }

  const timestampDiff =
    getClassroomDateRecordTimestamp(right) - getClassroomDateRecordTimestamp(left);
  if (timestampDiff !== 0) {
    return timestampDiff;
  }

  if (hasMemoText(left) !== hasMemoText(right)) {
    return hasMemoText(left) ? -1 : 1;
  }

  if (getContentCount(left) !== getContentCount(right)) {
    return getContentCount(right) - getContentCount(left);
  }

  return left.id.localeCompare(right.id);
};

export const sortClassroomDateRecords = (records: ClassroomDateRecord[]) =>
  [...records].sort((left, right) => {
    const dateDiff = new Date(right.date).getTime() - new Date(left.date).getTime();
    if (dateDiff !== 0) {
      return dateDiff;
    }

    return comparePreferredClassroomDateRecord(left, right);
  });
