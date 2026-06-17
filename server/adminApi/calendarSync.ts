import { getAdminDb, getCalendarDb } from '../firebaseAdmin';
import { AdminApiError, isDateString } from './resources';

const CALENDAR_EVENTS_COLLECTION = 'calendar-events';
const RECORDS_COLLECTION = 'classroomDateRecords';

/**
 * class 앱에서 동기화된 이벤트의 문서 ID 접두사.
 * calendar.damuna.org UI는 이벤트를 {date, title, time}로 전체 덮어쓰기 저장하므로
 * 필드 태그 대신 문서 ID로 동기화 대상을 식별한다.
 */
const SYNC_PREFIX = 'clsrec_';

const getSyncedEventId = (recordId: string) => `${SYNC_PREFIX}${recordId}`;

interface RecordSnapshot {
  date?: string;
  classroomName?: string;
  classroomId?: string;
}

const buildEventData = (record: RecordSnapshot) => ({
  date: record.date || '',
  title: record.classroomName || '수업',
  time: '',
});

/** 수업 기록 1건을 달력 이벤트로 upsert. 기록이 없으면 대응 이벤트를 삭제. */
export const syncRecordToCalendar = async (recordId: string) => {
  const recordDoc = await getAdminDb().collection(RECORDS_COLLECTION).doc(recordId).get();
  const eventRef = getCalendarDb().collection(CALENDAR_EVENTS_COLLECTION).doc(getSyncedEventId(recordId));

  if (!recordDoc.exists) {
    await eventRef.delete();
    return { recordId, action: 'removed' as const };
  }

  await eventRef.set(buildEventData(recordDoc.data() as RecordSnapshot));
  return { recordId, action: 'synced' as const };
};

export const removeCalendarEventForRecord = async (recordId: string) => {
  await getCalendarDb()
    .collection(CALENDAR_EVENTS_COLLECTION)
    .doc(getSyncedEventId(recordId))
    .delete();
};

/** 동기화 실패가 본 작업을 막지 않도록 하는 래퍼 */
export const syncRecordToCalendarSafe = async (recordId: string) => {
  try {
    return await syncRecordToCalendar(recordId);
  } catch (error) {
    console.warn(`[calendarSync] record ${recordId} 동기화 실패:`, error);
    return null;
  }
};

/** 전체 재동기화: 모든 수업 기록 upsert + 기록이 사라진 동기화 이벤트(고아) 삭제 */
export const fullResync = async () => {
  const calendarDb = getCalendarDb();
  const recordsSnap = await getAdminDb().collection(RECORDS_COLLECTION).get();

  const validIds = new Set<string>();
  let upserted = 0;

  const writes: Promise<unknown>[] = [];
  for (const doc of recordsSnap.docs) {
    const eventId = getSyncedEventId(doc.id);
    validIds.add(eventId);
    writes.push(
      calendarDb.collection(CALENDAR_EVENTS_COLLECTION).doc(eventId).set(buildEventData(doc.data() as RecordSnapshot))
    );
    upserted += 1;
  }
  await Promise.all(writes);

  // 동기화 접두사가 붙은 기존 이벤트 중 더 이상 기록이 없는 것 삭제
  // (이벤트 수가 적으므로 전체를 읽어 접두사로 거른다)
  const eventsSnap = await calendarDb.collection(CALENDAR_EVENTS_COLLECTION).get();

  let removed = 0;
  const deletions: Promise<unknown>[] = [];
  for (const doc of eventsSnap.docs) {
    if (doc.id.startsWith(SYNC_PREFIX) && !validIds.has(doc.id)) {
      deletions.push(doc.ref.delete());
      removed += 1;
    }
  }
  await Promise.all(deletions);

  return { upserted, removed };
};

export interface CalendarEventInput {
  id?: string;
  date: string;
  title: string;
  time?: string;
}

export const listCalendarEvents = async (filters: { dateFrom?: string; dateTo?: string } = {}) => {
  const snap = await getCalendarDb().collection(CALENDAR_EVENTS_COLLECTION).get();
  let events = snap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as { date?: string; title?: string; time?: string }),
  }));

  if (filters.dateFrom) {
    events = events.filter((event) => (event.date || '') >= filters.dateFrom!);
  }
  if (filters.dateTo) {
    events = events.filter((event) => (event.date || '') <= filters.dateTo!);
  }

  events.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  return events.map((event) => ({ ...event, syncedFromClassApp: event.id.startsWith(SYNC_PREFIX) }));
};

export const upsertCalendarEvent = async (input: CalendarEventInput) => {
  if (!isDateString(input.date)) {
    throw new AdminApiError(400, 'date는 YYYY-MM-DD 형식이어야 합니다.');
  }
  if (!input.title?.trim()) {
    throw new AdminApiError(400, 'title이 필요합니다.');
  }

  const id = input.id?.trim() || Date.now().toString();
  if (id.startsWith(SYNC_PREFIX)) {
    throw new AdminApiError(
      400,
      `'${SYNC_PREFIX}' 접두사 이벤트는 수업 기록에서 자동 동기화됩니다. 해당 수업 기록을 직접 수정하세요.`
    );
  }

  await getCalendarDb()
    .collection(CALENDAR_EVENTS_COLLECTION)
    .doc(id)
    .set({ date: input.date, title: input.title.trim(), time: input.time?.trim() || '' });

  return { id, date: input.date, title: input.title.trim(), time: input.time?.trim() || '' };
};

export const deleteCalendarEvent = async (id: string) => {
  if (id.startsWith(SYNC_PREFIX)) {
    throw new AdminApiError(
      400,
      `'${SYNC_PREFIX}' 접두사 이벤트는 수업 기록에서 자동 동기화됩니다. 해당 수업 기록을 삭제하면 이벤트도 함께 사라집니다.`
    );
  }
  await getCalendarDb().collection(CALENDAR_EVENTS_COLLECTION).doc(id).delete();
};
