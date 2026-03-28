import { Lesson, LessonContent } from '../types';

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export const normalizeLessonContentIds = (
  lesson: Pick<Lesson, 'contentId' | 'contentIds'> | { contentId?: unknown; contentIds?: unknown }
): string[] => {
  if (Array.isArray(lesson.contentIds)) {
    return Array.from(new Set(lesson.contentIds.filter(isNonEmptyString)));
  }

  if (isNonEmptyString(lesson.contentId)) {
    return [lesson.contentId];
  }

  return [];
};

export const buildLessonRecordContent = (
  contentIds: string[],
  contentsById: ReadonlyMap<string, Pick<LessonContent, 'id' | 'title' | 'html'>>
): Pick<Lesson, 'contentId' | 'contentIds' | 'title' | 'content'> => {
  const normalizedContentIds = Array.from(new Set(contentIds.filter(isNonEmptyString)));
  const selectedContents = normalizedContentIds
    .map((contentId) => contentsById.get(contentId))
    .filter((content): content is Pick<LessonContent, 'id' | 'title' | 'html'> => Boolean(content));

  const persistedContentIds = selectedContents.map((content) => content.id);
  const mergedHtml = selectedContents
    .map((content) => content.html.trim())
    .filter(Boolean)
    .join('\n<hr style="margin: 40px 0; border-color: #E5E3DD;" />\n');

  return {
    contentId: persistedContentIds[0] ?? '',
    contentIds: persistedContentIds,
    title: selectedContents.map((content) => content.title.trim()).filter(Boolean).join(', '),
    content: mergedHtml,
  };
};
