import { GoogleGenAI } from '@google/genai';
import type { DocumentSnapshot } from 'firebase-admin/firestore';
import type { AttendanceRecord, ClassroomDateRecord, LessonContent } from '../src/types';
import { isAttendanceExcluded, normalizeAttendanceRecords } from '../src/utils/attendance';
import { normalizeClassroomDateRecordContentIds } from '../src/utils/classroomDateRecordContent';
import {
  CLASSROOMS_COLLECTION,
  CLASSROOM_DATE_RECORDS_COLLECTION,
  DAILY_REVIEWS_COLLECTION,
  getClassroomDateRecordId,
} from '../src/utils/classroomDomain';
import { getAdminDb } from './firebaseAdmin';

// const DEFAULT_CLASS_NOTE_MODEL = 'gemini-3-flash-preview';
const DEFAULT_CLASS_NOTE_MODEL = 'gemini-1.5-flash';
const CONTENTS_COLLECTION = 'contents';
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_EXISTING_MEMO_SOURCE_LENGTH = 600;
const MAX_DAILY_REVIEW_MEMO_LENGTH = 240;
const MEMO_DRAFT_MAX_LENGTH = 96;
const MEMO_DRAFT_MIN_LENGTH = 12;
const MEMO_ENDING_PATTERN = /(진행|함|했음|확인함)$/;
const DATE_IN_TEXT_PATTERN = /\b\d{4}[-./]\d{1,2}[-./]\d{1,2}\b|\b\d{1,2}[-./]\d{1,2}\b/;
const FORBIDDEN_MEMO_PHRASES = [
  '오늘은',
  '수업을 진행',
  '수업 진행',
  '진행합니다',
  '진행했습니다',
  '부탁드립니다',
  '안내 바랍니다',
  '유의 바랍니다',
  '발급됩니다',
  '입니다',
];

const MEMO_DRAFT_VARIANTS = [
  {
    style: 'activity',
    label: '활동중심',
    focus:
      'Blend the selected lesson titles and descriptions into one compact memo line that reflects the overall class flow.',
  },
  {
    style: 'guidance',
    label: '지도중심',
    focus:
      'Emphasize teacher guidance, caution points, pronunciation/input guidance, or instructions from the source.',
  },
  {
    style: 'check',
    label: '확인중심',
    focus:
      'Emphasize final checks such as saving, registration, completion, or confirmation while still mentioning the class activity briefly.',
  },
] as const;

type MemoDraftStyle = (typeof MEMO_DRAFT_VARIANTS)[number]['style'];

interface GenerateMemoDraftPayload {
  classroomId: string;
  date: string;
  existingMemo?: string;
}

interface GenerateDailyReviewPayload {
  date: string;
}

interface MemoDraftOption {
  style: MemoDraftStyle;
  label: string;
  memo: string;
}

interface GenerateMemoDraftResult {
  drafts: MemoDraftOption[];
  classroomId: string;
  date: string;
  contentIds: string[];
}

interface GenerateDailyReviewResult {
  summary: string;
  date: string;
  recordCount: number;
  classroomCount: number;
}

interface MemoSourceContent {
  title: string;
  description: string;
}

interface DailyReviewRecordContext {
  id: string;
  ownerUid: string;
  classroomId: string;
  classroomName: string;
  attendanceSummary: string;
  contentTitles: string[];
  contentDetails: string[];
  existingMemo: string;
}

export class ApiError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

const normalizeString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const limitText = (value: string, maxLength: number) => {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
};

const getApiKey = () => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new ApiError(500, 'GEMINI_API_KEY is not configured.');
  }

  return apiKey;
};

const getClassNoteModel = () =>
  process.env.GEMINI_CLASS_NOTE_MODEL?.trim() ||
  process.env.GEMINI_TRANSLATION_MODEL?.trim() ||
  DEFAULT_CLASS_NOTE_MODEL;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableModelError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return /503|429|UNAVAILABLE|high demand|overloaded|temporarily unavailable|RESOURCE_EXHAUSTED|quota exceeded/i.test(message);
};

const generateText = async (prompt: string) => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const model = getClassNoteModel();

  let attempt = 0;
  let retryDelay = 400;

  while (attempt < 3) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
      });

      const text = response.text?.trim();
      if (!text) {
        throw new ApiError(500, 'Gemini response was empty.');
      }

      return text;
    } catch (error) {
      attempt += 1;

      if (attempt >= 3 || !isRetryableModelError(error)) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      const retryInMatch = message.match(/retry in ([\d.]+)s/i);
      if (retryInMatch && retryInMatch[1]) {
        retryDelay = parseFloat(retryInMatch[1]) * 1000 + 500;
      }

      await sleep(retryDelay);
      retryDelay *= 2;
    }
  }

  throw new ApiError(500, 'Gemini request failed.');
};

const normalizeGeneratedText = (value: string) =>
  value
    .replace(/```(?:text|markdown)?/gi, '')
    .replace(/```/g, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\r/g, '')
    .trim();

const normalizeMemoDraftText = (value: string) => {
  let normalized = normalizeGeneratedText(value);
  normalized = normalized.replace(/\n+/g, ' ');
  normalized = normalized.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  normalized = normalized.replace(/\s*[,;:/]\s*/g, ', ');
  normalized = normalized.replace(/\s{2,}/g, ' ');
  normalized = normalized.trim();

  if (/[.!?]$/.test(normalized)) {
    normalized = normalized.slice(0, -1).trim();
  }

  return normalized;
};

const normalizeDailyReviewText = (value: string) =>
  normalizeGeneratedText(value)
    .split('\n')
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .join('\n')
    .trim();

const isMemoDraftValid = (memo: string) => {
  if (!memo) {
    return false;
  }

  if (memo.includes('\n')) {
    return false;
  }

  if (memo.length < MEMO_DRAFT_MIN_LENGTH || memo.length > MEMO_DRAFT_MAX_LENGTH) {
    return false;
  }

  if (DATE_IN_TEXT_PATTERN.test(memo)) {
    return false;
  }

  if (!/[가-힣]/.test(memo)) {
    return false;
  }

  if (!MEMO_ENDING_PATTERN.test(memo)) {
    return false;
  }

  return !FORBIDDEN_MEMO_PHRASES.some((phrase) => memo.includes(phrase));
};

const buildMemoSourceBlock = (contents: MemoSourceContent[], existingMemo: string) => `Allowed source only:
1. Selected lesson titles from the classroom date record
${contents.map((content, index) => `   ${index + 1}) ${content.title}`).join('\n')}

2. Lesson descriptions for those selected lessons
${contents
    .map(
      (content, index) =>
        `   ${index + 1}) ${content.title}: ${content.description ? limitText(content.description, 280) : '(no description)'
        }`
    )
    .join('\n')}

3. Existing class memo text if present
${existingMemo ? `   ${limitText(existingMemo, MAX_EXISTING_MEMO_SOURCE_LENGTH)}` : '   (none)'}`;

const buildPreviousDraftsBlock = (previousDrafts: MemoDraftOption[]) => {
  if (previousDrafts.length === 0) {
    return '';
  }

  return `

Previous drafts already created. This new draft must be clearly different in emphasis:
${previousDrafts.map((draft) => `- ${draft.label}: ${draft.memo}`).join('\n')}`;
};

const buildMemoDraftPrompt = (
  variant: (typeof MEMO_DRAFT_VARIANTS)[number],
  contents: MemoSourceContent[],
  existingMemo: string,
  previousDrafts: MemoDraftOption[]
) => `Write one Korean teacher memo line based only on the source below.

Draft style: ${variant.label}
Style focus:
${variant.focus}

Hard rules:
- Output exactly one line
- Keep it around 50 to 80 Korean characters
- Do not write any date
- Memo style only, like a quick teacher note
- Never use explanatory, 안내문, or 보고문 tone
- Never use phrases like "오늘은", "수업을 진행했다", "안내 바랍니다"
- Weave together the selected contents naturally instead of choosing only one representative item
- If existing class memo is present, include its key point in shortened form
- End with one of: 진행, 함, 했음, 확인함
- Output only the memo line, with no quotes or bullets
- Do not invent details outside the source${buildPreviousDraftsBlock(previousDrafts)}

Tone examples:
- 자음모음 타이핑과 받침 읽기 연계 진행, 실명 입력 안내함
- 자음모음 타이핑과 발음 확인 진행, 수료증 이미지 저장 확인함

${buildMemoSourceBlock(contents, existingMemo)}`;

const buildMemoRewritePrompt = (
  variant: (typeof MEMO_DRAFT_VARIANTS)[number],
  draft: string,
  contents: MemoSourceContent[],
  existingMemo: string,
  previousDrafts: MemoDraftOption[]
) => `The draft below is invalid. Rewrite it into a valid Korean memo line.

Draft style: ${variant.label}
Style focus:
${variant.focus}

Invalid draft:
${draft}

Rules to satisfy:
- One line only
- Around 50 to 80 Korean characters
- No date
- Memo style only
- No explanatory, 안내문, or 보고문 tone
- No "오늘은", "수업을 진행했다", "안내 바랍니다"
- Weave together the selected contents naturally instead of choosing only one representative item
- If existing class memo is present, include its key point in shortened form
- Use only the source below
- End with one of: 진행, 함, 했음, 확인함
- Output only the corrected memo line${buildPreviousDraftsBlock(previousDrafts)}

${buildMemoSourceBlock(contents, existingMemo)}`;

const buildMemoFallbackPrompt = (
  variant: (typeof MEMO_DRAFT_VARIANTS)[number],
  contents: MemoSourceContent[],
  existingMemo: string,
  previousDrafts: MemoDraftOption[]
) => `Return only one Korean memo line.

Draft style: ${variant.label}
Style focus:
${variant.focus}

Rules:
- One line only
- Around 50 to 80 Korean characters
- No date
- Memo style only
- Weave together the selected contents instead of picking just one
- If existing class memo is present, include its key point in shortened form
- End with 진행, 함, 했음, or 확인함
- Use only the source below${buildPreviousDraftsBlock(previousDrafts)}

${buildMemoSourceBlock(contents, existingMemo)}`;

const buildBulkMemoDraftPrompt = (
  contents: MemoSourceContent[],
  existingMemo: string
) => `You are a teacher writing 3 alternative class memo lines based on the source below.

Rules for each memo line:
- Output exactly one line per style
- Keep it around 50 to 80 Korean characters
- Do not write any date
- Memo style only, like a quick teacher note
- Never use explanatory, 안내문, or 보고문 tone
- Never use phrases like "오늘은", "수업을 진행했다", "안내 바랍니다"
- Weave together the selected contents naturally instead of choosing only one representative item
- If existing class memo is present, include its key point in shortened form
- End with one of: 진행, 함, 했음, 확인함
- Do not invent details outside the source

The 3 styles to create:
1. 활동중심 (activity): Blend the selected lesson titles and descriptions into one compact memo line that reflects the overall class flow.
2. 지도중심 (guidance): Emphasize teacher guidance, caution points, pronunciation/input guidance, or instructions from the source.
3. 확인중심 (check): Emphasize final checks such as saving, registration, completion, or confirmation while still mentioning the class activity briefly.

Must return exactly a raw JSON array of objects. Do not use markdown backticks around the json. Example format:
[
  { "style": "activity", "memo": "..." },
  { "style": "guidance", "memo": "..." },
  { "style": "check", "memo": "..." }
]

Tone examples:
- 자음모음 타이핑과 받침 읽기 연계 진행, 실명 입력 안내함
- 자음모음 타이핑과 발음 확인 진행, 수료증 이미지 저장 확인함

${buildMemoSourceBlock(contents, existingMemo)}`;

const generateStrictMemoDraft = async (
  variant: (typeof MEMO_DRAFT_VARIANTS)[number],
  contents: MemoSourceContent[],
  existingMemo: string,
  previousDrafts: MemoDraftOption[]
) => {
  const firstDraft = normalizeMemoDraftText(
    await generateText(buildMemoDraftPrompt(variant, contents, existingMemo, previousDrafts))
  );
  if (isMemoDraftValid(firstDraft)) {
    return firstDraft;
  }

  const rewrittenDraft = normalizeMemoDraftText(
    await generateText(
      buildMemoRewritePrompt(variant, firstDraft, contents, existingMemo, previousDrafts)
    )
  );
  if (isMemoDraftValid(rewrittenDraft)) {
    return rewrittenDraft;
  }

  const fallbackDraft = normalizeMemoDraftText(
    await generateText(buildMemoFallbackPrompt(variant, contents, existingMemo, previousDrafts))
  );
  if (isMemoDraftValid(fallbackDraft)) {
    return fallbackDraft;
  }

  throw new ApiError(500, 'Memo draft did not match the required memo style.');
};

const generateMemoDraftOptions = async (
  contents: MemoSourceContent[],
  existingMemo: string
): Promise<MemoDraftOption[]> => {
  let parsedDrafts: { style: string; memo: string }[] = [];

  try {
    const prompt = buildBulkMemoDraftPrompt(contents, existingMemo);
    const responseText = await generateText(prompt);
    const jsonStr = responseText.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    parsedDrafts = JSON.parse(jsonStr);
  } catch (error) {
    console.warn('Failed to parse bulk JSON response, falling back to individual generation', error);
  }

  const drafts: MemoDraftOption[] = [];

  for (const variant of MEMO_DRAFT_VARIANTS) {
    const parsed = parsedDrafts.find(d => d.style === variant.style);
    let memo = parsed?.memo ? normalizeMemoDraftText(parsed.memo) : '';

    if (!isMemoDraftValid(memo)) {
      memo = await generateStrictMemoDraft(variant, contents, existingMemo, drafts);
    }

    drafts.push({
      style: variant.style,
      label: variant.label,
      memo,
    });
  }

  return drafts;
};

const normalizeLessonContent = (snapshot: DocumentSnapshot): LessonContent | null => {
  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data() as Partial<LessonContent> | undefined;
  if (!data) {
    return null;
  }

  return {
    id: snapshot.id,
    categoryId: typeof data.categoryId === 'string' ? data.categoryId : null,
    ownerUid: normalizeString(data.ownerUid),
    title: normalizeString(data.title),
    description: normalizeString(data.description),
    html: normalizeString(data.html),
    createdAt: normalizeString(data.createdAt),
    order: typeof data.order === 'number' ? data.order : undefined,
  };
};

const normalizeClassroomDateRecord = (snapshot: DocumentSnapshot): ClassroomDateRecord | null => {
  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data() as Partial<ClassroomDateRecord> | undefined;
  if (!data) {
    return null;
  }

  const classroomId = normalizeString((data as { classroomId?: unknown }).classroomId);
  if (!classroomId) {
    return null;
  }

  return {
    id: snapshot.id,
    classroomId,
    ownerUid: normalizeString(data.ownerUid),
    date: normalizeString(data.date),
    classroomName: normalizeString((data as { classroomName?: unknown }).classroomName),
    contentIds: normalizeClassroomDateRecordContentIds(data),
    attendance: normalizeAttendanceRecords(data.attendance),
    memo: normalizeString(data.memo),
    createdAt: normalizeString(data.createdAt),
    updatedAt: normalizeString(data.updatedAt),
  };
};

const assertNoDuplicateClassroomDateRecords = (
  records: ClassroomDateRecord[],
  context: string
) => {
  const seenKeys = new Map<string, ClassroomDateRecord>();

  records.forEach((record) => {
    const canonicalId = getClassroomDateRecordId(record.classroomId, record.date);
    const existingRecord = seenKeys.get(canonicalId);

    if (existingRecord) {
      throw new ApiError(
        409,
        `Duplicate classroom date records found for ${context}. Run the classroom domain cleanup before generating notes.`
      );
    }

    seenKeys.set(canonicalId, record);
  });

  return records;
};

const fetchClassroomName = async (classroomId: string) => {
  const db = getAdminDb();
  const currentSnapshot = await db.collection(CLASSROOMS_COLLECTION).doc(classroomId).get();
  const currentData = currentSnapshot.data() as { name?: unknown; classroomName?: unknown } | undefined;

  return normalizeString(currentData?.name) || normalizeString(currentData?.classroomName);
};

const loadStoredClassroomDateRecord = async (classroomId: string, date: string) => {
  const db = getAdminDb();
  const currentSnapshot = await db
    .collection(CLASSROOM_DATE_RECORDS_COLLECTION)
    .where('classroomId', '==', classroomId)
    .get();

  const records = assertNoDuplicateClassroomDateRecords(
    currentSnapshot.docs
      .map((snapshot) => normalizeClassroomDateRecord(snapshot))
      .filter((record) => record?.date === date)
      .filter((record): record is ClassroomDateRecord => Boolean(record)),
    `${classroomId} on ${date}`
  );

  const record = records[0] || null;
  if (!record) {
    throw new ApiError(404, 'No classroom date record was found for the requested date.');
  }

  if (!record.classroomName) {
    record.classroomName = await fetchClassroomName(record.classroomId);
  }

  return record;
};

const fetchContentsByIds = async (contentIds: string[]) => {
  const uniqueIds = Array.from(new Set(contentIds.filter((id) => id.trim().length > 0)));
  if (uniqueIds.length === 0) {
    return new Map<string, LessonContent>();
  }

  const db = getAdminDb();
  const snapshots = await Promise.all(
    uniqueIds.map((contentId) => db.collection(CONTENTS_COLLECTION).doc(contentId).get())
  );

  const contentMap = new Map<string, LessonContent>();
  snapshots.forEach((snapshot) => {
    const content = normalizeLessonContent(snapshot);
    if (content) {
      contentMap.set(content.id, content);
    }
  });

  return contentMap;
};

const getOrderedSelectedContents = (contentIds: string[], contentMap: Map<string, LessonContent>) => {
  const seenIds = new Set<string>();
  const orderedContents: LessonContent[] = [];

  contentIds.forEach((contentId) => {
    if (seenIds.has(contentId)) {
      return;
    }

    const content = contentMap.get(contentId);
    if (!content) {
      return;
    }

    seenIds.add(contentId);
    orderedContents.push(content);
  });

  return orderedContents;
};

const toMemoSourceContents = (contents: LessonContent[]) =>
  contents.map((content) => ({
    title: content.title || 'Untitled content',
    description: normalizeWhitespace(content.description),
  }));

const hasMemoSourceDescriptions = (contents: MemoSourceContent[]) =>
  contents.some((content) => content.description.length > 0);

const summarizeAttendance = (records: AttendanceRecord[]) => {
  const normalizedRecords = normalizeAttendanceRecords(records).filter(
    (record) => !isAttendanceExcluded(record)
  );

  const totals = normalizedRecords.reduce(
    (accumulator, record) => {
      if (record.status === 'Present') accumulator.present += 1;
      if (record.status === 'Late') accumulator.late += 1;
      if (record.status === 'Absent') accumulator.absent += 1;
      return accumulator;
    },
    { present: 0, late: 0, absent: 0 }
  );

  const total = totals.present + totals.late + totals.absent;
  if (total === 0) {
    return 'attendance not recorded';
  }

  return `attendance present ${totals.present}, late ${totals.late}, absent ${totals.absent}`;
};

const buildDailyReviewSource = (records: DailyReviewRecordContext[]) => `Write a Korean daily class review summary for an internal admin memo.

Rules:
- 3 or 4 short lines
- Concise and factual
- No heading and no date line
- Summarize notable activity, guidance points, attendance patterns, and checks across classrooms
- Use only the information below
- Output only the summary text

Daily records:
${records
    .map(
      (record, index) => `${index + 1}. Classroom: ${record.classroomName || record.classroomId}
   Selected content titles: ${record.contentTitles.length > 0 ? record.contentTitles.join(', ') : '(none)'}
   Lesson descriptions: ${record.contentDetails.length > 0 ? record.contentDetails.join(' | ') : '(none)'
        }
   Existing memo: ${record.existingMemo || '(none)'}
   ${record.attendanceSummary}`
    )
    .join('\n\n')}`;

const generateDailyReviewSummary = async (records: DailyReviewRecordContext[]) => {
  const summary = normalizeDailyReviewText(await generateText(buildDailyReviewSource(records)));
  if (!summary) {
    throw new ApiError(500, 'Daily review response was empty.');
  }

  return summary;
};

const collectDailyReviewRecords = async (date: string) => {
  const db = getAdminDb();
  const currentSnapshot = await db.collection(CLASSROOM_DATE_RECORDS_COLLECTION).where('date', '==', date).get();

  const records = assertNoDuplicateClassroomDateRecords(
    currentSnapshot.docs
      .map((snapshot) => normalizeClassroomDateRecord(snapshot))
      .filter((record): record is ClassroomDateRecord => Boolean(record)),
    `date ${date}`
  );
  if (records.length === 0) {
    throw new ApiError(404, 'No classroom date records were found for the requested date.');
  }

  const allContentIds = records.flatMap((record) => normalizeClassroomDateRecordContentIds(record));
  const contentMap = await fetchContentsByIds(allContentIds);

  return records.map((record) => {
    const selectedContents = getOrderedSelectedContents(record.contentIds, contentMap);

    return {
      id: record.id,
      ownerUid: record.ownerUid,
      classroomId: record.classroomId,
      classroomName: record.classroomName || record.classroomId,
      attendanceSummary: summarizeAttendance(record.attendance),
      contentTitles: selectedContents.map((content) => content.title).filter(Boolean),
      contentDetails: selectedContents
        .map((content) => {
          const description = normalizeWhitespace(content.description);
          if (!description) {
            return '';
          }

          return `${content.title}: ${limitText(description, 180)}`;
        })
        .filter(Boolean),
      existingMemo: limitText(normalizeWhitespace(record.memo), MAX_DAILY_REVIEW_MEMO_LENGTH),
    } satisfies DailyReviewRecordContext;
  });
};

export const validateGenerateMemoDraftPayload = (payload: unknown): GenerateMemoDraftPayload => {
  if (!payload || typeof payload !== 'object') {
    throw new ApiError(400, 'Request body must be a JSON object.');
  }

  const classroomId = normalizeString((payload as { classroomId?: unknown }).classroomId);
  const date = normalizeString((payload as { date?: unknown }).date);
  const existingMemo = normalizeString((payload as { existingMemo?: unknown }).existingMemo);

  if (!classroomId) {
    throw new ApiError(400, 'classroomId is required.');
  }

  if (!date) {
    throw new ApiError(400, 'date is required.');
  }

  if (!ISO_DATE_PATTERN.test(date)) {
    throw new ApiError(400, 'date must use YYYY-MM-DD format.');
  }

  return {
    classroomId,
    date,
    existingMemo: existingMemo || undefined,
  };
};

export const validateGenerateDailyReviewPayload = (payload: unknown): GenerateDailyReviewPayload => {
  if (!payload || typeof payload !== 'object') {
    throw new ApiError(400, 'Request body must be a JSON object.');
  }

  const date = normalizeString((payload as { date?: unknown }).date);
  if (!date) {
    throw new ApiError(400, 'date is required.');
  }

  if (!ISO_DATE_PATTERN.test(date)) {
    throw new ApiError(400, 'date must use YYYY-MM-DD format.');
  }

  return { date };
};

export const generateMemoDraft = async ({
  classroomId,
  date,
  existingMemo,
}: GenerateMemoDraftPayload): Promise<GenerateMemoDraftResult> => {
  const record = await loadStoredClassroomDateRecord(classroomId, date);
  const contentIds = normalizeClassroomDateRecordContentIds(record);

  if (contentIds.length === 0) {
    throw new ApiError(400, 'No content is selected for this classroom date record.');
  }

  const contentMap = await fetchContentsByIds(contentIds);
  const selectedContents = getOrderedSelectedContents(contentIds, contentMap);
  const memoSourceContents = toMemoSourceContents(selectedContents);

  if (!hasMemoSourceDescriptions(memoSourceContents)) {
    throw new ApiError(400, 'Selected contents do not have any lesson descriptions to summarize.');
  }

  const drafts = await generateMemoDraftOptions(
    memoSourceContents,
    limitText(
      normalizeWhitespace(existingMemo ?? record.memo),
      MAX_EXISTING_MEMO_SOURCE_LENGTH
    )
  );

  return {
    drafts,
    classroomId,
    date,
    contentIds,
  };
};

export const generateDailyReview = async ({
  date,
}: GenerateDailyReviewPayload): Promise<GenerateDailyReviewResult> => {
  const records = await collectDailyReviewRecords(date);
  const summary = await generateDailyReviewSummary(records);
  const db = getAdminDb();
  const reviewRef = db.collection(DAILY_REVIEWS_COLLECTION).doc(date);
  const existingSnapshot = await reviewRef.get();
  const existingData = existingSnapshot.data() as
    | { createdAt?: unknown; ownerUid?: unknown }
    | undefined;
  const now = new Date().toISOString();
  const sourceRecordIds = Array.from(new Set(records.map((record) => record.id))).sort();
  const classroomCount = new Set(records.map((record) => record.classroomId)).size;
  const ownerUid =
    normalizeString(existingData?.ownerUid) ||
    records.find((record) => record.ownerUid)?.ownerUid ||
    '';

  await reviewRef.set(
    {
      date,
      ownerUid,
      summary,
      sourceRecordIds,
      createdAt: normalizeString(existingData?.createdAt) || now,
      updatedAt: now,
    },
    { merge: true }
  );

  return {
    summary,
    date,
    recordCount: records.length,
    classroomCount,
  };
};
