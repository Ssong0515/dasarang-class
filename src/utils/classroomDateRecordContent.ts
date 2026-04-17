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

export const orderClassroomDateRecordContentIds = (
  contentIds: string[],
  contents: Array<{ id: string }>
): string[] => {
  const normalizedIds = normalizeClassroomDateRecordContentIds({ contentIds });
  const requestedIds = new Set(normalizedIds);
  const orderedKnownIds = contents
    .filter((content) => requestedIds.has(content.id))
    .map((content) => content.id);
  const knownIds = new Set(orderedKnownIds);
  const remainingIds = normalizedIds.filter((contentId) => !knownIds.has(contentId));

  return [...orderedKnownIds, ...remainingIds];
};
