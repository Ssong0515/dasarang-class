import crypto from 'crypto';
import type {
  AttendanceRecord,
  CurriculumSession,
  Student,
} from '../../src/types';
import { getClassroomDateRecordId } from '../../src/utils/classroomDomain';
import { isStudentDeleted, isStudentInactive } from '../../src/utils/students';
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

/**
 * 실습 콘텐츠를 브라우저에서 바로 보는 미리보기 URL(서버 /preview/:id 라우트).
 * APP_URL이 있으면 절대 URL, 없으면 상대 경로. 채팅에서 전체 HTML을 받지 않고 "일단 보기"용.
 * `?raw=1`을 붙이면 렌더 대신 소스 텍스트를 본다.
 */
const contentPreviewUrl = (id: string): string => {
  const origin = (process.env.APP_URL || '').replace(/\/+$/, '');
  const basePath = (process.env.APP_BASE_PATH || '/').replace(/\/+$/, '');
  const prefix = basePath && basePath !== '/' ? basePath : '';
  return `${origin}${prefix}/preview/${id}`;
};

/**
 * 커리큘럼 회차 배열을 정규화한다: 모든 회차에 안정적인 `id`와 1-based `order`를 보장.
 *
 * `sessions`를 통째로 넣어 만든 커리큘럼(create/update)은 회차에 id가 없을 수 있는데,
 * 그러면 자동 배정이 날짜를 `sessionStates[session.id]`에 쓸 때 모든 회차가 같은
 * `"undefined"` 키로 뭉쳐 한 날짜만 살아남는 버그가 생긴다. 쓰기 시점에 여기서 막는다.
 */
const normalizeCurriculumSessions = (value: unknown): unknown => {
  if (!Array.isArray(value)) return value;
  return value.map((session, index) => {
    const s = (session && typeof session === 'object' ? session : {}) as Partial<CurriculumSession>;
    return {
      ...s,
      id: s.id || crypto.randomUUID(),
      order: index + 1,
    };
  });
};

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

  if (resource === 'contents') {
    items = items.map((item) => ({ ...item, previewUrl: contentPreviewUrl(item.id as string) }));
  }

  return { total, count: items.length, items };
};

export const getResource = async (resource: ResourceName, id: string) => {
  const spec = RESOURCE_SPECS[resource];
  const doc = await getAdminDb().collection(spec.collection).doc(id).get();
  if (!doc.exists) {
    throw new AdminApiError(404, `'${resource}'에서 id '${id}' 문서를 찾을 수 없습니다.`);
  }
  const obj = docToObject(doc.id, doc.data() as DocData);
  if (resource === 'contents') {
    obj.previewUrl = contentPreviewUrl(obj.id);
  }
  return obj;
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

  if (resource === 'curriculums' && 'sessions' in docData) {
    docData.sessions = normalizeCurriculumSessions(docData.sessions);
  }

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
  if (resource === 'curriculums' && 'sessions' in updateData) {
    updateData.sessions = normalizeCurriculumSessions(updateData.sessions);
  }
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
  theoryPrompts?:
    | Array<{
        label?: string;
        prompt: string;
        contentIds?: string[];
        slideUrl?: string;
        links?: Array<{ id?: string; title?: string; url?: string }>;
      }>
    | string;
  /** 이 수업(회차)의 내용 요약. 강사 대시보드 '수업 설명' 팝업에 표시된다(디자인·대상 제외, 수업 내용만). */
  lessonDescription?: string;
  /** 이 날짜만의 이론/실습 덮어쓰기. 없으면 클래스 설정(showTheory/showPractice)을 따른다. */
  showTheory?: boolean;
  showPractice?: boolean;
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

/**
 * 새 수업기록을 만들 때 그 시점의 반 학생 명단으로 기본 출석부를 만든다.
 * 반 명단 = students 컬렉션에서 classroomId가 일치하고 삭제되지 않은(deletedAt 없음) 학생.
 * 비활성(inactiveAt) 학생은 명단엔 남기되 출석 대상에서 빠지도록 isExcluded로 담는다.
 * 프론트의 buildInitialAttendance(ClassroomDashboard)와 규칙을 맞춘다 — 루틴이 만든 수업도
 * 강사 화면과 똑같이 그날 명단이 채워져 '0명 대상'으로 뜨지 않는다.
 */
const buildInitialAttendanceForClassroom = async (
  db: ReturnType<typeof getAdminDb>,
  classroomId: string
): Promise<AttendanceRecord[]> => {
  const snap = await db.collection('students').where('classroomId', '==', classroomId).get();
  const students = snap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as DocData) }) as unknown as Student)
    .filter((student) => !isStudentDeleted(student))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return students.map((student) => ({
    studentId: student.id,
    status: 'Present',
    ...(isStudentInactive(student) ? { isExcluded: true } : {}),
  }));
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
  if (input.lessonDescription !== undefined) {
    if (typeof input.lessonDescription !== 'string') {
      throw new AdminApiError(400, 'lessonDescription은 문자열이어야 합니다.');
    }
    updates.lessonDescription = input.lessonDescription.trim();
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
    // NotebookLM 이론 프롬프트(이론 덱 1개 = 항목 1개). 빈 prompt는 버리고, 빈 키는 빼서 Firestore undefined를 피한다.
    // contentIds = 이 이론(덱)에 묶인 실습 콘텐츠 id들(인터리브 수업의 "이론 1 : 실습 N" 묶음 — 대시보드가 그룹으로 표시).
    updates.theoryPrompts = (
      prompts as Array<{ label?: unknown; prompt?: unknown; slideUrl?: unknown; contentIds?: unknown; links?: unknown }>
    )
      .map((entry) => {
        const label = typeof entry?.label === 'string' ? entry.label.trim() : '';
        const prompt = typeof entry?.prompt === 'string' ? entry.prompt : '';
        // slideUrl·links는 강사가 대시보드에서 붙인 자료. 루틴이 theoryPrompts를 다시 저장할 때 보존한다.
        const slideUrl = typeof entry?.slideUrl === 'string' ? entry.slideUrl.trim() : '';
        const contentIds = Array.isArray(entry?.contentIds)
          ? (entry.contentIds as unknown[]).filter((id): id is string => typeof id === 'string')
          : undefined;
        const links = Array.isArray(entry?.links)
          ? (entry.links as unknown[])
              .map((link, i) => {
                const l = (link ?? {}) as { id?: unknown; title?: unknown; url?: unknown };
                return {
                  id: typeof l.id === 'string' && l.id.trim() ? l.id.trim() : `lnk-${i}`,
                  title: typeof l.title === 'string' ? l.title.trim() : '',
                  url: typeof l.url === 'string' ? l.url.trim() : '',
                };
              })
              .filter((l) => l.url)
          : [];
        const normalized: {
          label?: string;
          prompt: string;
          slideUrl?: string;
          contentIds?: string[];
          links?: { id: string; title: string; url: string }[];
        } = { prompt };
        if (label) normalized.label = label;
        if (slideUrl) normalized.slideUrl = slideUrl;
        if (contentIds && contentIds.length > 0) normalized.contentIds = contentIds;
        if (links.length > 0) normalized.links = links;
        return normalized;
      })
      .filter((entry) => entry.prompt.trim());
  }
  if (input.showTheory !== undefined) {
    if (typeof input.showTheory !== 'boolean') {
      throw new AdminApiError(400, 'showTheory는 boolean이어야 합니다.');
    }
    updates.showTheory = input.showTheory;
  }
  if (input.showPractice !== undefined) {
    if (typeof input.showPractice !== 'boolean') {
      throw new AdminApiError(400, 'showPractice는 boolean이어야 합니다.');
    }
    updates.showPractice = input.showPractice;
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
    // 새 수업기록: 호출자가 attendance를 명시하지 않았으면 그 시점의 반 명단으로 출석부를 채운다.
    // (input.attendance가 있으면 위에서 updates.attendance로 잡혀 아래 스프레드가 이 기본값을 덮는다.)
    const initialAttendance = await buildInitialAttendanceForClassroom(db, input.classroomId.trim());
    await ref.set({
      memo: '',
      contentIds: [],
      attendance: initialAttendance,
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
  /** 콘텐츠 성격. 'reference'면 외부 도구 실습용 예시·참고 문서(비인터랙티브). 없으면 practice(기본). */
  kind?: 'practice' | 'reference';
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
    // reference일 때만 필드를 남긴다(없으면 practice로 취급 — 하위호환).
    ...(input.kind === 'reference' ? { kind: 'reference' as const } : {}),
  };
  await contentRef.set(contentData);

  return {
    id: contentRef.id,
    categoryId,
    title: contentData.title,
    order: contentData.order,
    previewUrl: contentPreviewUrl(contentRef.id),
    message: '콘텐츠가 생성되었습니다. previewUrl로 브라우저에서 바로 확인할 수 있습니다. 학생 화면에는 바로 안 보이며, 클래스 관리 > 수업 진행에서 "공개"해야 학생에게 열립니다(게이팅).',
  };
};

// ---------------------------------------------------------------------------
// 실습 자료 HTML 부분 수정 (find/replace 패치 — 전체 재업로드 없이)
// ---------------------------------------------------------------------------

export interface ContentHtmlEdit {
  /** 현재 html에 그대로(공백·따옴표 포함) 있어야 하는 찾을 문자열 */
  find: string;
  /** 바꿀 문자열 */
  replace: string;
  /** 여러 번 나타나면 모두 교체할지. 기본 false(정확히 1번만 허용) */
  replaceAll?: boolean;
}

/** html 안에서 needle이 나타나는 횟수(정규식 아닌 순수 문자열). */
const countOccurrences = (haystack: string, needle: string): number => {
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) break;
    count += 1;
    from = at + needle.length;
  }
  return count;
};

/**
 * contents 문서의 html을 전체 재업로드 없이 부분 수정한다.
 * 채팅에서 30KB짜리 전체를 다시 보내 update_resource로 덮는 대신, 바뀌는 부분만 find/replace로 고친다.
 * 모든 edit를 검증한 뒤 한꺼번에 커밋한다(하나라도 실패하면 아무것도 안 쓴다 = 원자적).
 */
export const editContentHtml = async (id: string, edits: ContentHtmlEdit[]) => {
  if (!Array.isArray(edits) || edits.length === 0) {
    throw new AdminApiError(400, 'edits 배열이 필요합니다.');
  }

  const ref = getAdminDb().collection('contents').doc(id);
  const doc = await ref.get();
  if (!doc.exists) {
    throw new AdminApiError(404, `콘텐츠 '${id}'을(를) 찾을 수 없습니다.`);
  }
  const original = (doc.data() as DocData).html;
  if (typeof original !== 'string') {
    throw new AdminApiError(400, `콘텐츠 '${id}'에 수정할 html 필드가 없습니다.`);
  }

  let html = original;
  const applied: Array<{ edit: number; occurrences: number; replaceAll: boolean }> = [];

  edits.forEach((edit, index) => {
    const n = index + 1;
    if (typeof edit?.find !== 'string' || edit.find === '') {
      throw new AdminApiError(400, `${n}번째 edit: find가 비어 있습니다.`);
    }
    if (typeof edit.replace !== 'string') {
      throw new AdminApiError(400, `${n}번째 edit: replace는 문자열이어야 합니다.`);
    }
    if (edit.find === edit.replace) {
      throw new AdminApiError(400, `${n}번째 edit: find와 replace가 같습니다.`);
    }

    const count = countOccurrences(html, edit.find);
    if (count === 0) {
      throw new AdminApiError(
        400,
        `${n}번째 edit: 찾는 문자열이 html에 없습니다. 현재 내용과 정확히(공백·따옴표 포함) 일치해야 합니다. find_in_content_html로 현재 내용을 먼저 확인하세요.`
      );
    }
    if (count > 1 && !edit.replaceAll) {
      throw new AdminApiError(
        400,
        `${n}번째 edit: 찾는 문자열이 ${count}번 나타납니다. 앞뒤 맥락을 더 포함해 유일하게 만들거나 replaceAll=true를 쓰세요.`
      );
    }

    // 순수 문자열 치환. String.replace(string, repl)은 repl의 `$&`·`$1` 등을 특수 해석하므로
    // ($ 가 든 HTML에서 깨짐) 단건은 인덱스 splice로 리터럴 치환한다. split/join은 $ 해석이 없어 안전.
    if (edit.replaceAll) {
      html = html.split(edit.find).join(edit.replace);
    } else {
      const at = html.indexOf(edit.find);
      html = html.slice(0, at) + edit.replace + html.slice(at + edit.find.length);
    }
    applied.push({ edit: n, occurrences: count, replaceAll: Boolean(edit.replaceAll) });
  });

  if (html === original) {
    throw new AdminApiError(400, '수정 후 내용이 그대로입니다(변경 없음).');
  }
  if (html.length > MAX_CONTENT_HTML_LENGTH) {
    throw new AdminApiError(
      400,
      `수정 후 html이 너무 큽니다 (${html.length}자, 최대 ${MAX_CONTENT_HTML_LENGTH}자).`
    );
  }

  await ref.set({ html, updatedAt: nowIso() }, { merge: true });

  return {
    id,
    editsApplied: applied,
    htmlLength: { before: original.length, after: html.length },
    previewUrl: contentPreviewUrl(id),
    message:
      '실습 HTML을 부분 수정했습니다. previewUrl 새로고침으로 결과를 확인하세요. content id가 그대로라 날짜기록·회차 연결과 공개 상태(게이팅)는 유지됩니다.',
  };
};

/**
 * contents 문서의 html에서 query를 찾아, 전체를 받지 않고도 주변 맥락만 본다.
 * editContentHtml의 find 문자열을 정확히 만들기 위한 "들여다보기"용.
 */
export const findInContentHtml = async (
  id: string,
  query: string,
  options: { maxMatches?: number; context?: number } = {}
) => {
  if (typeof query !== 'string' || query === '') {
    throw new AdminApiError(400, 'query가 비어 있습니다.');
  }
  const ref = getAdminDb().collection('contents').doc(id);
  const doc = await ref.get();
  if (!doc.exists) {
    throw new AdminApiError(404, `콘텐츠 '${id}'을(를) 찾을 수 없습니다.`);
  }
  const html = (doc.data() as DocData).html;
  if (typeof html !== 'string') {
    throw new AdminApiError(400, `콘텐츠 '${id}'에 html 필드가 없습니다.`);
  }

  const maxMatches = Math.min(Math.max(options.maxMatches || 20, 1), 100);
  const context = Math.min(Math.max(options.context ?? 100, 0), 1000);

  const matches: Array<{ line: number; offset: number; snippet: string }> = [];
  let from = 0;
  let total = 0;
  for (;;) {
    const at = html.indexOf(query, from);
    if (at === -1) break;
    total += 1;
    if (matches.length < maxMatches) {
      const start = Math.max(0, at - context);
      const end = Math.min(html.length, at + query.length + context);
      const line = html.slice(0, at).split('\n').length; // 1-based
      const snippet = `${start > 0 ? '…' : ''}${html.slice(start, end)}${end < html.length ? '…' : ''}`;
      matches.push({ line, offset: at, snippet });
    }
    from = at + query.length;
  }

  return { id, query, totalMatches: total, returned: matches.length, htmlLength: html.length, matches };
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
  for (const doc of studentsSnap.docs) {
    const data = doc.data() as DocData;
    if (data.deletedAt) continue;
    const classroomId = String(data.classroomId || '');
    studentCounts.set(classroomId, (studentCounts.get(classroomId) || 0) + 1);
  }

  // 반 설정에 지정된 병기 번역 언어 목록(강사가 직접 추가, 0개~여러 개)을 정규화한다.
  // 예전엔 학생들 language를 모아 최다 2개로 유추했으나, 이제 유추하지 않고 이 설정값만 쓴다.
  const getAnnotationLanguages = (data: DocData): string[] =>
    Array.isArray(data.annotationLanguages)
      ? data.annotationLanguages
          .filter((lang): lang is string => typeof lang === 'string')
          .map((lang) => lang.trim())
          .filter(Boolean)
      : [];

  const classrooms = classroomsSnap.docs
    .map((doc) => {
      const data = doc.data() as DocData;
      return {
        id: doc.id,
        name: data.name as string,
        order: (data.order as number) ?? 0,
        curriculumId: (data.curriculumId as string | null) ?? null,
        studentCount: studentCounts.get(doc.id) || 0,
        /** 이 반에 강사가 지정한 병기 번역 언어(0개~여러 개) — 이론 슬라이드·실습 병기 번역에 쓴다. 비어 있으면 병기 없이 쉬운 한국어+그림만. */
        annotationLanguages: getAnnotationLanguages(data),
        /** 이론/실습 구성 기본값(없으면 true). 날짜별로는 classroomDateRecords.showTheory/showPractice가 이 값을 덮어쓴다. */
        showTheory: data.showTheory !== false,
        showPractice: data.showPractice !== false,
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

  // 강사가 '모범 수업(잘 만든 수업)'으로 표시한 기록들 — 루틴이 새 수업을 만들 때 톤·구성 참고용.
  // 본문(이론 프롬프트/실습 HTML)은 무거우므로 여기선 요약만 준다. 상세가 필요하면
  // get_resource("classroomDateRecords", id)로 이론 프롬프트를, get_resource("contents", contentId)로 실습을 읽는다.
  const curriculumTitleById = new Map<string, string>(
    curriculums.map((c) => [c.id, c.title] as [string, string])
  );
  const exemplaryLessons = recordsSnap.docs
    .map((doc) => docToObject(doc.id, doc.data() as DocData))
    .filter((record) => record.exemplary === true)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .map((record) => ({
      id: record.id,
      classroomId: record.classroomId,
      classroomName: record.classroomName,
      date: record.date,
      curriculumTitle: record.curriculumId
        ? curriculumTitleById.get(String(record.curriculumId)) ?? null
        : null,
      note: typeof record.exemplaryNote === 'string' ? record.exemplaryNote : '',
      theoryPromptLabels: Array.isArray(record.theoryPrompts)
        ? record.theoryPrompts.map((p: DocData) =>
            typeof p?.label === 'string' && p.label.trim() ? p.label.trim() : '(제목 없는 이론)'
          )
        : [],
      practiceCount: Array.isArray(record.contentIds) ? record.contentIds.length : 0,
    }));

  return {
    today,
    classrooms,
    curriculums,
    categories: categoriesSnap.docs.map((doc) => ({ id: doc.id, name: (doc.data() as DocData).name })),
    todayLessonRecords: todayRecords,
    recentMemos,
    pendingStudentPosts: pendingPosts,
    exemplaryLessons,
  };
};
