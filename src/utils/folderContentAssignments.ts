import { LessonContent, LessonFolder } from '../types';

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export const normalizeAssignedContentIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.filter(isNonEmptyString)));
};

export const getAssignedContentIdsForFolder = (
  folder: Pick<LessonFolder, 'assignedContentIds'>
): string[] => normalizeAssignedContentIds(folder.assignedContentIds);

export const orderAssignedContentIds = (
  contentIds: string[],
  contents: Array<Pick<LessonContent, 'id'>>
): string[] => {
  const normalizedIds = normalizeAssignedContentIds(contentIds);
  const requestedIds = new Set(normalizedIds);
  const orderedKnownIds = contents
    .filter((content) => requestedIds.has(content.id))
    .map((content) => content.id);
  const knownIds = new Set(orderedKnownIds);
  const remainingIds = normalizedIds.filter((contentId) => !knownIds.has(contentId));

  return [...orderedKnownIds, ...remainingIds];
};
