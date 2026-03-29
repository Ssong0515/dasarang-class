import type { ClassroomDateRecord } from '../types';

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export const normalizeClassroomDateRecordContentIds = (
  record: Pick<ClassroomDateRecord, 'contentIds'> | { contentIds?: unknown }
): string[] => {
  if (!Array.isArray(record.contentIds)) {
    return [];
  }

  return Array.from(new Set(record.contentIds.filter(isNonEmptyString)));
};
