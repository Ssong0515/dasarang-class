import { Lesson, LessonContent, LessonFolder } from '../types';

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export const normalizeAssignedContentIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.filter(isNonEmptyString)));
};

export const getLegacyAssignedContentIdsForLessons = (lessons: Lesson[]): string[] => {
  const collectedIds: string[] = [];

  lessons.forEach((lesson) => {
    if (Array.isArray(lesson.contentIds)) {
      lesson.contentIds.forEach((contentId) => {
        if (isNonEmptyString(contentId)) {
          collectedIds.push(contentId);
        }
      });
      return;
    }

    if (isNonEmptyString(lesson.contentId)) {
      collectedIds.push(lesson.contentId);
    }
  });

  return Array.from(new Set(collectedIds));
};

export const getLegacyAssignedContentIdsForFolder = (
  folderId: string,
  lessons: Lesson[]
): string[] =>
  getLegacyAssignedContentIdsForLessons(lessons.filter((lesson) => lesson.folderId === folderId));

export const getAssignedContentIdsForFolder = (
  folder: Pick<LessonFolder, 'id' | 'assignedContentIds'>,
  lessons: Lesson[]
): string[] => {
  if (Array.isArray(folder.assignedContentIds)) {
    return normalizeAssignedContentIds(folder.assignedContentIds);
  }

  return getLegacyAssignedContentIdsForFolder(folder.id, lessons);
};

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
