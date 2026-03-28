import { FolderDateRecord } from '../types';

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export const normalizeFolderDateRecordContentIds = (
  record: Pick<FolderDateRecord, 'contentIds'> | { contentIds?: unknown }
): string[] => {
  if (!Array.isArray(record.contentIds)) {
    return [];
  }

  return Array.from(new Set(record.contentIds.filter(isNonEmptyString)));
};
