export const STUDENT_ACCESS_COLLECTION = 'studentAccess';

const STUDENT_ACCESS_ID_PATTERN = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;

export const normalizeStudentAccessId = (value: unknown) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

export const isValidStudentAccessId = (value: string) =>
  STUDENT_ACCESS_ID_PATTERN.test(value);
