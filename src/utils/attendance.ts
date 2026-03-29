import type { AttendanceRecord } from '../types';

const ATTENDANCE_STATUSES = ['Present', 'Absent', 'Late'] as const;

const isAttendanceStatus = (value: unknown): value is AttendanceRecord['status'] =>
  typeof value === 'string' &&
  ATTENDANCE_STATUSES.includes(value as (typeof ATTENDANCE_STATUSES)[number]);

export const isAttendanceExcluded = (record: AttendanceRecord) => record.isExcluded === true;

export const normalizeAttendanceRecord = (
  value: Partial<AttendanceRecord> | null | undefined
): AttendanceRecord => ({
  studentId: typeof value?.studentId === 'string' ? value.studentId : '',
  status: isAttendanceStatus(value?.status) ? value.status : 'Present',
  isExcluded: value?.isExcluded === true ? true : undefined,
});

export const normalizeAttendanceRecords = (value: unknown): AttendanceRecord[] =>
  Array.isArray(value)
    ? value.map((entry) => normalizeAttendanceRecord(entry as Partial<AttendanceRecord>))
    : [];

export const sanitizeAttendanceRecordForStorage = (record: AttendanceRecord): AttendanceRecord => {
  const nextRecord: AttendanceRecord = {
    studentId: record.studentId,
    status: record.status,
  };

  if (record.isExcluded === true) {
    nextRecord.isExcluded = true;
  }

  return nextRecord;
};

export const sanitizeAttendanceRecordsForStorage = (records: AttendanceRecord[] = []) =>
  records.map((record) => sanitizeAttendanceRecordForStorage(record));
