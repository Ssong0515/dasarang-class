import crypto from 'crypto';
import type {
  AttendanceRecord,
  CurriculumSession,
} from '../../src/types';
import { getClassroomDateRecordId } from '../../src/utils/classroomDomain';
import { getAdminDb } from '../firebaseAdmin';
import { resolveAdminUid } from './auth';
import { removeCalendarEventForRecord, syncRecordToCalendarSafe } from './calendarSync';
import {
  AdminApiError,
  RESOURCE_SPECS,
  isDateString,
  validateResourceData,
  type ResourceName,
} from './resources';

const MAX_CONTENT_HTML_LENGTH = 900_000; // Firestore 문서 1MiB 한도 여유분
const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 500;

const nowIso = () => new Date().toISOString();

/** KST 기준 오늘 날짜 (YYYY-MM-DD) */
const todayInSeoul = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });

type DocData = Record<string, unknown>;

const docToObject = (id: string, data: DocData): DocData & { id: string } => ({ ...data, id });

const compareBySpec = (spec: { field: string; direction: 'asc' | 'desc' }) => {
  return (a: DocData, b: DocData) => {
    const left = a[spec.field];
    const right = b[spec.field];
    let diff = 0;
    if (typeof left === 'number' && typeof right === 'number') {
      diff = left - right;
    } else {
      diff = String(left ?? '').localeCompare(String(right ?? ''));
    }
    return spec.direction === 'desc' ? -diff : diff;
  };
};

export interface ListOptions {
  filters?: Record<string, string>;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  includeHtml?: boolean;
}

export const listResource = async (resource: ResourceName, options: ListOptions = {}) => {
  const spec = RESOURCE_SPECS[resource];
  const snap = await getAdminDb().collection(spec.collection).get();

  let items = snap.docs.map((doc) => docToObject(doc.id, doc.data() as DocData));

  for (const [field, value] of Object.entries(options.filters || {})) {
    if (!spec.filterFields.includes(field)) {
      throw new AdminApiError(
        400,
        `'${resource}'에서 지원하지 않는 필터입니다: '${field}'. 지원: ${spec.filterFields.join(', ') || '(없음)'}`
      );
    }
    items = items.filter((item) => {
      const itemValue = item[field];
      if (value === 'null') {
        return itemValue === null || itemValue === undefined;
      }
      return String(itemValue ?? '') === value;
    });
  }

  if (spec.dateField) {
    if (options.dateFrom) {
      items = items.filter((item) => String(item[spec.dateField!] ?? '') >= options.dateFrom!);
    }
    if (options.dateTo) {
      items = items.filter((item) => String(item[spec.dateField!] ?? '') <= options.dateTo!);
    }
  }

  items.sort(compareBySpec(spec.sort));

  const limit = Math.min(Math.max(options.limit || DEFAULT_LIST_LIMIT, 1), MAX_LIST_LIMIT);
  const total = items.length;
  items = items.slice(0, limit);

  if (spec.listOmitFields && !options.includeHtml) {
    items = items.map((item) => {
      const copy = { ...item };
      for (const field of spec.listOmitFields!) {
        if (typeof copy[field] === 'string') {
          copy[field] = `(생략됨 — ${(copy[field] as string).length}자. 전체는 단건 조회 또는 includeHtml=true 사용)`;
        }
      }
      return copy;
    });
  }

  return { total, count: items.length, items };
};

export const getResource = async (resource: ResourceName, id: string) => {
  const spec = RESOURCE_SPECS[resource];
  const doc = await getAdminDb().collection(spec.collection).doc(id).get();
  if (!doc.exists) {
    throw new AdminApiError(404, `'${resource}'에서 id '${id}' 문서를 찾을 수 없습니다.`);
  }
  return docToObject(doc.id, doc.data() as DocData);
};

const buildInitials = (name: string) => name.trim().slice(0, 2);

export const createResource = async (
  resource: ResourceName,
  data: DocData,
  explicitId?: string
) => {
  // 수업 기록은 canonical id 규칙이 있으므로 upsert 경로로 위임
  if (resource === 'classroomDateRecords') {
    return upsertLessonRecord(data as unknown as UpsertLessonRecordInput);
  }

  validateResourceData(resource, data, 'create');
  const spec = RESOURCE_SPECS[resource];
  const ownerUid = await resolveAdminUid();
  const createdIso = nowIso();

  const docData: DocData = {
    ...(spec.defaults?.({ ownerUid, nowIso: createdIso }) || {}),
    ...data,
    ownerUid,
  };

  if (resource === 'students') {
    docData.initials = (data.initials as string) || buildInitials(data.name as string);
    if (docData.order === undefined) {
      docData.order = Date.now();
    }
    docData.updatedAt = createdIso;
    docData.createdAt = createdIso;
  }

  if (resource === 'contents' && typeof docData.html === 'string' && docData.html.length > MAX_CONTENT_HTML_LENGTH) {
    throw new AdminApiError(400, `html이 너무 큽니다 (${docData.html.length}자, 최대 ${MAX_CONTENT_HTML_LENGTH}자).`);
  }

  const collection = getAdminDb().collection(spec.collection);
  const ref = explicitId ? collection.doc(explicitId) : collection.doc();

  if (explicitId) {
    const existing = await ref.get();
    if (existing.exists) {
      throw new AdminApiError(409, `id '${explicitId}' 문서가 이미 존재합니다. 수정은 PATCH를 사용하세요.`);
    }
  }

  await ref.set(docData);
  return docToObject(ref.id, docData);
};

export const updateResource = async (resource: ResourceName, id: string, patch: DocData) => {
  if (Object.keys(patch).length === 0) {
    throw new AdminApiError(400, '수정할 필드가 없습니다.');
  }
  validateResourceData(resource, patch, 'update');
  const spec = RESOURCE_SPECS[resource];

  if (resource === 'contents' && typeof patch.html === 'string' && patch.html.length > MAX_CONTENT_HTML_LENGTH) {
    throw new AdminApiError(400, `html이 너무 큽니다 (${patch.html.length}자, 최대 ${MAX_CONTENT_HTML_LENGTH}자).`);
  }

  const ref = getAdminDb().collection(spec.collection).doc(id);
  const doc = await ref.get();
  if (!doc.exists) {
    throw new AdminApiError(404, `'${resource}'에서 id '${id}' 문서를 찾을 수 없습니다.`);
  }

  const updateData: DocData = { ...patch };
  if ('updatedAt' in (doc.data() as DocData) || resource === 'curriculums' || resource === 'students') {
    updateData.updatedAt = nowIso();
  }

  await ref.set(updateData, { merge: true });

  if (resource === 'classroomDateRecords') {
    await syncRecordToCalendarSafe(id);
  }

  const updated = await ref.get();
  return docToObject(updated.id, updated.data() as DocData);
};

export const deleteResource = async (resource: ResourceName, id: string) => {
  const spec = RESOURCE_SPECS[resource];
  const ref = getAdminDb().collection(spec.collection).doc(id);
  const doc = await ref.get();
  if (!doc.exists) {
    throw new AdminApiError(404, `'${resource}'에서 id '${id}' 문서를 찾을 수 없습니다.`);
  }
  await ref.delete();

  if (resource === 'classroomDateRecords') {
    try {
      await removeCalendarEventForRecord(id);
    } catch (error) {
      console.warn(`[calendarSync] record ${id} 이벤트 삭제 실패:`, error);
    }
  }

  return { deleted: true, id };
};

// ---------------------------------------------------------------------------
// 수업 기록 upsert (canonical id {classroomId}_{date})
// ---------------------------------------------------------------------------

export interface UpsertLessonRecordInput {
  classroomId: string;
  date: string;
  memo?: string;
  contentIds?: string[];
  attendance?: AttendanceRecord[];
  curriculumId?: string;
  curriculumSessionId?: string;
  theoryPrompts?: Array<{ label?: string; prompt: string }> | string;
}

const VALID_ATTENDANCE_STATUSES = new Set(['Present', 'Absent', 'Late']);

const validateAttendance = (attendance: unknown): AttendanceRecord[] => {
  if (!Array.isArray(attendance)) {
    throw new AdminApiError(400, 'attendance는 배열이어야 합니다.');
  }
  for (const entry of attendance) {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      typeof (entry as AttendanceRecord).studentId !== 'string' ||
      !VALID_ATTENDANCE_STATUSES.has((entry as AttendanceRecord).status)
    ) {
      throw new AdminApiError(
        400,
        'attendance 항목은 {studentId, status: Present|Absent|Late, isExcluded?} 형식이어야 합니다.'
      );
    }
  }
  return attendance as AttendanceRecord[];
};

export const upsertLessonRecord = async (input: UpsertLessonRecordInput) => {
  if (!input.classroomId?.trim()) {
    throw new AdminApiError(400, 'classroomId가 필요합니다.');
  }
  if (!isDateString(input.date)) {
    throw new AdminApiError(400, 'date는 YYYY-MM-DD 형식이어야 합니다.');
  }

  const db = getAdminDb();
  const classroomDoc = await db.collection('classrooms').doc(input.classroomId.trim()).get();
  if (!classroomDoc.exists) {
    throw new AdminApiError(404, `교실 '${input.classroomId}'을(를) 찾을 수 없습니다.`);
  }
  const classroom = classroomDoc.data() as DocData;

  // 커리큘럼 회차 연결: curriculumId가 없으면 교실에 연결된 커리큘럼에서 회차를 찾는다
  let curriculumId = input.curriculumId?.trim() || '';
  const curriculumSessionId = input.curriculumSessionId?.trim() || '';
  if (curriculumSessionId && !curriculumId) {
    const candidateCurriculumId = (classroom.curriculumId as string) || '';
    if (candidateCurriculumId) {
      const curriculumDoc = await db.collection('curriculums').doc(candidateCurriculumId).get();
      const sessions = ((curriculumDoc.data() as DocData | undefined)?.sessions || []) as CurriculumSession[];
      if (curriculumDoc.exists && sessions.some((session) => session.id === curriculumSessionId)) {
        curriculumId = candidateCurriculumId;
      }
    }
    if (!curriculumId) {
      const allCurriculums = await db.collection('curriculums').get();
      for (const doc of allCurriculums.docs) {
        const sessions = ((doc.data() as DocData).sessions || []) as CurriculumSession[];
        if (sessions.some((session) => session.id === curriculumSessionId)) {
          curriculumId = doc.id;
          break;
        }
      }
    }
    if (!curriculumId) {
      throw new AdminApiError(404, `커리큘럼 회차 '${curriculumSessionId}'을(를) 찾을 수 없습니다.`);
    }
  }

  const recordId = getClassroomDateRecordId(input.classroomId, input.date);
  const ref = db.collection('classroomDateRecords').doc(recordId);
  const existing = await ref.get();
  const ownerUid = await resolveAdminUid();
  const iso = nowIso();

  const updates: DocData = {
    classroomId: input.classroomId.trim(),
    date: input.date,
    classroomName: (classroom.name as string) || '',
    updatedAt: iso,
  };
  if (input.memo !== undefined) {
    if (typeof input.memo !== 'string') {
      throw new AdminApiError(400, 'memo는 문자열이어야 합니다.');
    }
    updates.memo = input.memo;
  }
  if (input.contentIds !== undefined) {
    if (!Array.isArray(input.contentIds) || input.contentIds.some((id) => typeof id !== 'string')) {
      throw new AdminApiError(400, 'contentIds는 문자열 배열이어야 합니다.');
    }
    updates.contentIds = input.contentIds;
  }
  if (input.attendance !== undefined) {
    updates.attendance = validateAttendance(input.attendance);
  }
  if (input.theoryPrompts !== undefined) {
    // 일부 MCP 클라이언트는 중첩 객체 배열을 JSON 문자열로 보낸다 → 문자열이면 먼저 파싱한다.
    let prompts: unknown = input.theoryPrompts;
    if (typeof prompts === 'string') {
      try {
        prompts = JSON.parse(prompts);
      } catch {
        throw new AdminApiError(400, 'theoryPrompts가 올바른 JSON 배열이 아닙니다.');
      }
    }
    if (!Array.isArray(prompts)) {
      throw new AdminApiError(400, 'theoryPrompts는 배열이어야 합니다.');
    }
    // 시수별 NotebookLM 이론 프롬프트. 빈 prompt는 버리고, 빈 label 키는 빼서 Firestore undefined를 피한다.
    updates.theoryPrompts = (prompts as Array<{ label?: unknown; prompt?: unknown }>)
      .map((entry) => {
        const label = typeof entry?.label === 'string' ? entry.label.trim() : '';
        const prompt = typeof entry?.prompt === 'string' ? entry.prompt : '';
        return label ? { label, prompt } : { prompt };
      })
      .filter((entry) => entry.prompt.trim());
  }
  if (curriculumId) {
    updates.curriculumId = curriculumId;
  }
  if (curriculumSessionId) {
    updates.curriculumSessionId = curriculumSessionId;
  }

  if (existing.exists) {
    await ref.set(updates, { merge: true });
  } else {
    await ref.set({
      memo: '',
      contentIds: [],
      attendance: [],
      ...updates,
      ownerUid,
      createdAt: iso,
    });
  }

  await syncRecordToCalendarSafe(recordId);

  const saved = await ref.get();
  return docToObject(saved.id, saved.data() as DocData);
};

// ---------------------------------------------------------------------------
// 커리큘럼 회차 조작
// ---------------------------------------------------------------------------

export interface CurriculumSessionOp {
  type: 'add' | 'update' | 'remove' | 'reorder';
  sessionId?: string;
  /** add/update에서 사용하는 회차 데이터 */
  session?: Partial<Omit<CurriculumSession, 'id'>>;
  /** add(삽입 위치)/reorder(이동 위치)에서 사용하는 1-based 순서 */
  order?: number;
}

const validateSessionPatch = (patch: Partial<Omit<CurriculumSession, 'id'>>, requireTopic: boolean) => {
  if (requireTopic && !patch.topic?.trim()) {
    throw new AdminApiError(400, '회차에는 topic이 필요합니다.');
  }
  if (patch.topic !== undefined && typeof patch.topic !== 'string') {
    throw new AdminApiError(400, 'topic은 문자열이어야 합니다.');
  }
  if (patch.contentIds !== undefined && !Array.isArray(patch.contentIds)) {
    throw new AdminApiError(400, 'contentIds는 배열이어야 합니다.');
  }
};

const clampInsertIndex = (order: number | undefined, length: number) => {
  if (order === undefined || !Number.isFinite(order)) {
    return length;
  }
  return Math.min(Math.max(Math.trunc(order) - 1, 0), length);
};

export const mutateCurriculumSessions = async (curriculumId: string, ops: CurriculumSessionOp[]) => {
  if (!Array.isArray(ops) || ops.length === 0) {
    throw new AdminApiError(400, 'ops 배열이 필요합니다.');
  }

  const db = getAdminDb();
  const ref = db.collection('curriculums').doc(curriculumId);

  const result = await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) {
      throw new AdminApiError(404, `커리큘럼 '${curriculumId}'을(를) 찾을 수 없습니다.`);
    }

    let sessions = [...(((doc.data() as DocData).sessions || []) as CurriculumSession[])];

    for (const op of ops) {
      switch (op.type) {
        case 'add': {
          if (!op.session) {
            throw new AdminApiError(400, "add 작업에는 'session'이 필요합니다.");
          }
          validateSessionPatch(op.session, true);
          const newSession: CurriculumSession = {
            id: crypto.randomUUID(),
            order: 0, // 아래에서 재계산
            topic: op.session.topic!.trim(),
            ...(op.session.details !== undefined ? { details: op.session.details } : {}),
            ...(op.session.contentIds ? { contentIds: op.session.contentIds } : {}),
          };
          const index = clampInsertIndex(op.order ?? op.session.order, sessions.length);
          sessions.splice(index, 0, newSession);
          break;
        }
        case 'update': {
          if (!op.sessionId || !op.session) {
            throw new AdminApiError(400, "update 작업에는 'sessionId'와 'session'이 필요합니다.");
          }
          validateSessionPatch(op.session, false);
          const target = sessions.find((session) => session.id === op.sessionId);
          if (!target) {
            throw new AdminApiError(404, `회차 '${op.sessionId}'을(를) 찾을 수 없습니다.`);
          }
          // order는 자동 재계산하고, plannedDate/status는 커리큘럼에 저장하지 않는다(반별 전용).
          const {
            order: _ignoredOrder,
            plannedDate: _ignoredPlannedDate,
            status: _ignoredStatus,
            ...patch
          } = op.session as Partial<CurriculumSession> & { plannedDate?: string; status?: string };
          Object.assign(target, patch);
          break;
        }
        case 'remove': {
          if (!op.sessionId) {
            throw new AdminApiError(400, "remove 작업에는 'sessionId'가 필요합니다.");
          }
          const before = sessions.length;
          sessions = sessions.filter((session) => session.id !== op.sessionId);
          if (sessions.length === before) {
            throw new AdminApiError(404, `회차 '${op.sessionId}'을(를) 찾을 수 없습니다.`);
          }
          break;
        }
        case 'reorder': {
          if (!op.sessionId || op.order === undefined) {
            throw new AdminApiError(400, "reorder 작업에는 'sessionId'와 'order'가 필요합니다.");
          }
          const currentIndex = sessions.findIndex((session) => session.id === op.sessionId);
          if (currentIndex === -1) {
            throw new AdminApiError(404, `회차 '${op.sessionId}'을(를) 찾을 수 없습니다.`);
          }
          const [moved] = sessions.splice(currentIndex, 1);
          const targetIndex = clampInsertIndex(op.order, sessions.length);
          sessions.splice(targetIndex, 0, moved);
          break;
        }
        default:
          throw new AdminApiError(400, `알 수 없는 작업 타입: '${(op as { type: string }).type}'`);
      }
    }

    sessions.forEach((session, index) => {
      session.order = index + 1;
    });

    tx.set(ref, { sessions, updatedAt: nowIso() }, { merge: true });
    return sessions;
  });

  return { curriculumId, sessionCount: result.length, sessions: result };
};

// ---------------------------------------------------------------------------
// Claude 실습 자료 생성 (HTML → 학생에게 바로 보이는 콘텐츠)
// ---------------------------------------------------------------------------

export interface CreatePracticeContentInput {
  title: string;
  description?: string;
  html: string;
  categoryId?: string;
  /** categoryId가 없을 때 사용할 카테고리 이름. 없으면 '실습 자료' */
  categoryName?: string;
}

export const createPracticeContent = async (input: CreatePracticeContentInput) => {
  if (!input.title?.trim()) {
    throw new AdminApiError(400, 'title이 필요합니다.');
  }
  if (!input.html?.trim()) {
    throw new AdminApiError(400, 'html이 필요합니다.');
  }
  if (input.html.length > MAX_CONTENT_HTML_LENGTH) {
    throw new AdminApiError(400, `html이 너무 큽니다 (${input.html.length}자, 최대 ${MAX_CONTENT_HTML_LENGTH}자).`);
  }

  const db = getAdminDb();
  const ownerUid = await resolveAdminUid();
  const iso = nowIso();

  // 카테고리 결정 (categoryId 없으면 이름으로 찾고, 없으면 생성)
  let categoryId = input.categoryId?.trim() || '';
  if (categoryId) {
    const categoryDoc = await db.collection('categories').doc(categoryId).get();
    if (!categoryDoc.exists) {
      throw new AdminApiError(404, `카테고리 '${categoryId}'을(를) 찾을 수 없습니다.`);
    }
  } else {
    const categoryName = input.categoryName?.trim() || '실습 자료';
    const categoriesSnap = await db.collection('categories').get();
    const existing = categoriesSnap.docs.find(
      (doc) => ((doc.data() as DocData).name as string)?.trim() === categoryName
    );
    if (existing) {
      categoryId = existing.id;
    } else {
      const maxOrder = categoriesSnap.docs.reduce(
        (max, doc) => Math.max(max, Number((doc.data() as DocData).order) || 0),
        0
      );
      const newCategoryRef = db.collection('categories').doc();
      await newCategoryRef.set({ name: categoryName, ownerUid, order: maxOrder + 1 });
      categoryId = newCategoryRef.id;
    }
  }

  // 카테고리 내 마지막 순서
  const contentsSnap = await db.collection('contents').get();
  const maxOrder = contentsSnap.docs
    .filter((doc) => (doc.data() as DocData).categoryId === categoryId)
    .reduce((max, doc) => Math.max(max, Number((doc.data() as DocData).order) || 0), 0);

  const contentRef = db.collection('contents').doc();
  const contentData = {
    title: input.title.trim(),
    description: input.description?.trim() || '',
    html: input.html,
    categoryId,
    ownerUid,
    createdAt: iso,
    order: maxOrder + 1,
  };
  await contentRef.set(contentData);

  return {
    id: contentRef.id,
    categoryId,
    title: contentData.title,
    order: contentData.order,
    message: '콘텐츠가 생성되었습니다. 학생 화면에는 바로 안 보이며, 클래스 관리 > 수업 진행에서 "공개"해야 학생에게 열립니다(게이팅).',
  };
};

// ---------------------------------------------------------------------------
// 전체 현황 (채팅 그라운딩용)
// ---------------------------------------------------------------------------

export const getOverview = async () => {
  const db = getAdminDb();
  const today = todayInSeoul();

  const [classroomsSnap, studentsSnap, curriculumsSnap, categoriesSnap, memosSnap, recordsSnap, postsSnap] =
    await Promise.all([
      db.collection('classrooms').get(),
      db.collection('students').get(),
      db.collection('curriculums').get(),
      db.collection('categories').get(),
      db.collection('memos').get(),
      db.collection('classroomDateRecords').get(),
      db.collection('studentPosts').get(),
    ]);

  const studentCounts = new Map<string, number>();
  // 반별 사용 언어 집계: classroomId → (언어 → 학생 수). 슬라이드 병기 번역 언어(반에서 최다 2개) 산출용.
  const languageCounts = new Map<string, Map<string, number>>();
  for (const doc of studentsSnap.docs) {
    const data = doc.data() as DocData;
    if (data.deletedAt) continue;
    const classroomId = String(data.classroomId || '');
    studentCounts.set(classroomId, (studentCounts.get(classroomId) || 0) + 1);

    const language = typeof data.language === 'string' ? data.language.trim() : '';
    if (language) {
      const perClass = languageCounts.get(classroomId) ?? new Map<string, number>();
      perClass.set(language, (perClass.get(language) || 0) + 1);
      languageCounts.set(classroomId, perClass);
    }
  }

  // 반에서 가장 많이 쓰는 언어 최대 2개 (수 내림차순, 동수면 먼저 등장한 순). 슬라이드 병기 번역에 쓴다.
  const getTopLanguages = (classroomId: string): string[] =>
    Array.from(languageCounts.get(classroomId)?.entries() ?? [])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([language]) => language);

  const classrooms = classroomsSnap.docs
    .map((doc) => {
      const data = doc.data() as DocData;
      return {
        id: doc.id,
        name: data.name as string,
        order: (data.order as number) ?? 0,
        curriculumId: (data.curriculumId as string | null) ?? null,
        studentCount: studentCounts.get(doc.id) || 0,
        /** 이 반 학생들이 가장 많이 쓰는 언어 최대 2개 — 이론 슬라이드 병기 번역 언어. 비어 있으면 병기 없이 쉬운 한국어+그림만. */
        topLanguages: getTopLanguages(doc.id),
      };
    })
    .sort((a, b) => a.order - b.order);

  const curriculums = curriculumsSnap.docs.map((doc) => {
    const data = doc.data() as DocData;
    const sessions = (data.sessions || []) as CurriculumSession[];
    return {
      id: doc.id,
      title: data.title as string,
      sessionCount: sessions.length,
    };
  });

  const todayRecords = recordsSnap.docs
    .map((doc) => docToObject(doc.id, doc.data() as DocData))
    .filter((record) => record.date === today)
    .map((record) => ({
      id: record.id,
      classroomId: record.classroomId,
      classroomName: record.classroomName,
      memo: record.memo,
      contentCount: Array.isArray(record.contentIds) ? record.contentIds.length : 0,
    }));

  const recentMemos = memosSnap.docs
    .map((doc) => docToObject(doc.id, doc.data() as DocData))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 10)
    .map((memo) => ({ id: memo.id, date: memo.date, content: memo.content }));

  const pendingPosts = postsSnap.docs
    .map((doc) => docToObject(doc.id, doc.data() as DocData))
    .filter((post) => post.status === 'pending')
    .map((post) => ({ id: post.id, title: post.title, studentName: post.studentName, createdAt: post.createdAt }));

  return {
    today,
    classrooms,
    curriculums,
    categories: categoriesSnap.docs.map((doc) => ({ id: doc.id, name: (doc.data() as DocData).name })),
    todayLessonRecords: todayRecords,
    recentMemos,
    pendingStudentPosts: pendingPosts,
  };
};
