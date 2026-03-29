import { google } from 'googleapis';
import type { Classroom, Student } from '../src/types';
import {
  getVisibleStudents,
  normalizeLegacyStudents,
  normalizeStudentRecord,
  sortStudents,
} from '../src/utils/students';
import { getAdminDb, verifyAdminIdToken as verifyAdminToken } from './firebaseAdmin';

const INTEGRATIONS_COLLECTION = 'integrations';
const GOOGLE_SHEETS_DOC_ID = 'googleSheets';
const CLASSROOMS_COLLECTION = 'classrooms';
const STUDENTS_COLLECTION = 'students';
const SHEET_HEADERS = [
  'studentId',
  'name',
  'initials',
  'age',
  'contact',
  'memo',
  'classId',
  'className',
  'updatedAt',
] as const;

type SyncMode = 'upsert' | 'delete';

interface ClassroomSheetMapping {
  sheetId: number;
  title: string;
}

interface GoogleSheetsSyncMeta {
  spreadsheetId: string;
  classrooms?: Record<string, ClassroomSheetMapping>;
  classroomCount?: number;
  lastSyncAt?: string;
  lastError?: string | null;
  updatedAt?: string;
}

interface ServiceAccountConfig {
  projectId?: string;
  clientEmail: string;
  privateKey: string;
}

export interface ClassroomSyncPayload {
  classroomId: string;
  mode?: SyncMode;
  previousName?: string;
  classroomName?: string;
}

export interface StudentSyncPayload {
  classroomId?: string;
  studentId?: string;
  mode?: 'upsert' | 'delete' | 'move';
  sourceClassroomId?: string;
  targetClassroomId?: string;
}

const nowIso = () => new Date().toISOString();

const normalizePrivateKey = (privateKey?: string) => privateKey?.replace(/\\n/g, '\n');

const parseServiceAccountJson = (raw?: string): ServiceAccountConfig | null => {
  if (!raw) return null;

  const parsed = JSON.parse(raw) as {
    project_id?: string;
    projectId?: string;
    client_email?: string;
    clientEmail?: string;
    private_key?: string;
    privateKey?: string;
  };

  const clientEmail = parsed.client_email || parsed.clientEmail;
  const privateKey = normalizePrivateKey(parsed.private_key || parsed.privateKey);

  if (!clientEmail || !privateKey) {
    throw new Error('Service account JSON must include client_email and private_key.');
  }

  return {
    projectId: parsed.project_id || parsed.projectId,
    clientEmail,
    privateKey,
  };
};

const getServiceAccountFromEnv = (prefix: 'GOOGLE' | 'FIREBASE'): ServiceAccountConfig | null => {
  const jsonConfig = parseServiceAccountJson(process.env[`${prefix}_SERVICE_ACCOUNT_JSON`]);
  if (jsonConfig) return jsonConfig;

  const clientEmail = process.env[`${prefix}_SERVICE_ACCOUNT_EMAIL`];
  const privateKey = normalizePrivateKey(process.env[`${prefix}_SERVICE_ACCOUNT_PRIVATE_KEY`]);
  const projectId = process.env[`${prefix}_SERVICE_ACCOUNT_PROJECT_ID`];

  if (!clientEmail || !privateKey) {
    return null;
  }

  return {
    projectId,
    clientEmail,
    privateKey,
  };
};

const getGoogleServiceAccount = () =>
  getServiceAccountFromEnv('GOOGLE') || getServiceAccountFromEnv('FIREBASE');

const hasGoogleSheetsConfig = () =>
  Boolean(process.env.GOOGLE_SPREADSHEET_ID && getGoogleServiceAccount());

const getSpreadsheetId = () => {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw new Error('GOOGLE_SPREADSHEET_ID is not configured.');
  }
  return spreadsheetId;
};

const getGoogleSheetsClient = () => {
  const serviceAccount = getGoogleServiceAccount();

  if (!serviceAccount) {
    throw new Error('Google Sheets service account credentials are not configured.');
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: serviceAccount.clientEmail,
      private_key: serviceAccount.privateKey,
      project_id: serviceAccount.projectId,
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({
    version: 'v4',
    auth,
  });
};

const getMetaRef = () => getAdminDb().collection(INTEGRATIONS_COLLECTION).doc(GOOGLE_SHEETS_DOC_ID);

const readMeta = async (): Promise<GoogleSheetsSyncMeta> => {
  const snapshot = await getMetaRef().get();
  const data: Partial<GoogleSheetsSyncMeta> = snapshot.exists
    ? (snapshot.data() as GoogleSheetsSyncMeta)
    : {};
  const classroomMappings = data.classrooms || {};
  const classroomCount = Object.keys(classroomMappings).length;

  return {
    spreadsheetId: getSpreadsheetId(),
    classrooms: classroomMappings,
    classroomCount: data.classroomCount ?? classroomCount,
    lastSyncAt: data.lastSyncAt,
    lastError: data.lastError,
    updatedAt: data.updatedAt,
  };
};

const stripUndefined = <T extends Record<string, unknown>>(value: T) => {
  const entries = Object.entries(value).filter(([, entryValue]) => entryValue !== undefined);
  return Object.fromEntries(entries) as T;
};

const writeMeta = async (meta: GoogleSheetsSyncMeta) => {
  const classroomMappings = meta.classrooms || {};
  const classroomCount = Object.keys(classroomMappings).length;

  await getMetaRef().set(
    stripUndefined({
      ...meta,
      spreadsheetId: getSpreadsheetId(),
      classrooms: classroomMappings,
      classroomCount,
      updatedAt: nowIso(),
    })
  );
};

const setMetaError = async (message: string) => {
  await getMetaRef().set(
    {
      spreadsheetId: getSpreadsheetId(),
      lastError: message,
      updatedAt: nowIso(),
    },
    { merge: true }
  );
};

const getSpreadsheet = async () => {
  const sheets = getGoogleSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets(properties(sheetId,title,hidden,index,gridProperties(rowCount,columnCount,frozenRowCount)))',
  });

  return {
    sheets,
    spreadsheetId,
    spreadsheet: response.data,
  };
};

const sanitizeSheetTitle = (title?: string) => {
  const fallbackTitle = (title || 'Class').trim() || 'Class';
  return fallbackTitle.replace(/[\\/?*\[\]:]/g, ' ').trim().slice(0, 100) || 'Class';
};

const withSuffixWithinLimit = (baseTitle: string, suffix: string) => {
  const maxBaseLength = Math.max(1, 100 - suffix.length);
  return `${baseTitle.slice(0, maxBaseLength)}${suffix}`;
};

const getUniqueSheetTitle = (
  spreadsheet: Awaited<ReturnType<typeof getSpreadsheet>>['spreadsheet'],
  desiredTitle: string,
  excludeSheetId?: number
) => {
  const takenTitles = new Set(
    (spreadsheet.sheets || [])
      .filter((sheet) => sheet.properties?.sheetId !== excludeSheetId)
      .map((sheet) => sheet.properties?.title)
      .filter((title): title is string => Boolean(title))
  );

  if (!takenTitles.has(desiredTitle)) {
    return desiredTitle;
  }

  let suffixNumber = 2;
  while (suffixNumber < 1000) {
    const candidate = withSuffixWithinLimit(desiredTitle, ` (${suffixNumber})`);
    if (!takenTitles.has(candidate)) {
      return candidate;
    }
    suffixNumber += 1;
  }

  return withSuffixWithinLimit(desiredTitle, ` (${Date.now()})`);
};

const quoteSheetTitle = (title: string) => `'${title.replace(/'/g, "''")}'`;

const buildSheetValues = (classroom: Classroom, students: Student[]) => {
  return [
    [...SHEET_HEADERS],
    ...students.map((student) => [
      student.id,
      student.name,
      student.initials,
      student.age || '',
      student.contact || '',
      student.memo || '',
      classroom.id,
      classroom.name,
      student.updatedAt || '',
    ]),
  ];
};

const normalizeClassroomSyncPayload = (payload: Partial<ClassroomSyncPayload>): ClassroomSyncPayload => {
  const classroomId = (payload.classroomId || '').trim();

  if (!classroomId) {
    throw new Error('classroomId is required for Google Sheets sync.');
  }

  return {
    classroomId,
    mode: payload.mode,
    previousName: payload.previousName,
    classroomName: payload.classroomName,
  };
};

const getClassroomDoc = async (classroomId: string) => {
  const snapshot = await getAdminDb().collection(CLASSROOMS_COLLECTION).doc(classroomId).get();

  if (!snapshot.exists) {
    throw new Error(`Classroom '${classroomId}' was not found in Firestore.`);
  }

  return {
    id: snapshot.id,
    ...(snapshot.data() as Omit<Classroom, 'id'>),
  } as Classroom;
};

const getStudentsForClassroom = async (classroom: Classroom) => {
  const embeddedStudents = normalizeLegacyStudents(classroom.students, {
    classroomId: classroom.id,
    ownerUid: classroom.ownerUid,
    createdAt: classroom.createdAt,
    updatedAt: classroom.createdAt,
  });
  const snapshot = await getAdminDb().collection(STUDENTS_COLLECTION).get();
  const globalStudents = snapshot.docs.map((studentDoc) =>
    normalizeStudentRecord({
      id: studentDoc.id,
      ...(studentDoc.data() as Partial<Student>),
    })
  );
  const mergedStudentsById = new Map<string, Student>();

  embeddedStudents.forEach((student) => {
    if (student.id) {
      mergedStudentsById.set(student.id, student);
    }
  });

  globalStudents.forEach((student) => {
    if (student.id) {
      mergedStudentsById.set(student.id, student);
    }
  });

  return getVisibleStudents(sortStudents([...mergedStudentsById.values()])).filter(
    (student) => student.classroomId === classroom.id
  );
};

const persistClassroomSheet = async (classroom: Classroom, rawPayload?: ClassroomSyncPayload) => {
  const payload = rawPayload ? normalizeClassroomSyncPayload(rawPayload) : undefined;
  const meta = await readMeta();
  const { sheets, spreadsheetId, spreadsheet } = await getSpreadsheet();
  const students = await getStudentsForClassroom(classroom);
  const classroomMappings = meta.classrooms || {};
  const otherMappedSheetIds = new Set(
    Object.entries(classroomMappings)
      .filter(([mappedClassroomId]) => mappedClassroomId !== classroom.id)
      .map(([, mapping]) => mapping.sheetId)
  );

  const mapping = classroomMappings[classroom.id];
  let targetSheet = (spreadsheet.sheets || []).find(
    (sheet) => sheet.properties?.sheetId === mapping?.sheetId
  );

  if (!targetSheet && mapping?.title) {
    targetSheet = (spreadsheet.sheets || []).find(
      (sheet) => sheet.properties?.title === mapping.title
    );
  }

  if (!targetSheet && payload?.previousName) {
    const previousTitle = sanitizeSheetTitle(payload.previousName);
    targetSheet = (spreadsheet.sheets || []).find(
      (sheet) =>
        sheet.properties?.title === previousTitle &&
        !otherMappedSheetIds.has(sheet.properties?.sheetId || -1)
    );
  }

  if (!targetSheet) {
    const currentTitle = sanitizeSheetTitle(classroom.name);
    targetSheet = (spreadsheet.sheets || []).find(
      (sheet) =>
        sheet.properties?.title === currentTitle &&
        !otherMappedSheetIds.has(sheet.properties?.sheetId || -1)
    );
  }

  const desiredTitle = getUniqueSheetTitle(
    spreadsheet,
    sanitizeSheetTitle(classroom.name),
    targetSheet?.properties?.sheetId
  );

  let sheetId = targetSheet?.properties?.sheetId;
  const sheetTitle = desiredTitle;

  if (sheetId == null) {
    const addSheetResponse = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: desiredTitle,
                gridProperties: {
                  frozenRowCount: 1,
                },
              },
            },
          },
        ],
      },
    });

    sheetId = addSheetResponse.data.replies?.[0]?.addSheet?.properties?.sheetId ?? undefined;
    if (sheetId == null) {
      throw new Error(`Failed to create a Google Sheets tab for classroom '${classroom.id}'.`);
    }
  } else if (targetSheet?.properties?.title !== desiredTitle) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            updateSheetProperties: {
              properties: {
                sheetId,
                title: desiredTitle,
                gridProperties: {
                  frozenRowCount: 1,
                },
              },
              fields: 'title,gridProperties.frozenRowCount',
            },
          },
        ],
      },
    });
  }

  meta.classrooms = {
    ...classroomMappings,
    [classroom.id]: {
      sheetId,
      title: sheetTitle,
    },
  };
  await writeMeta(meta);

  const range = `${quoteSheetTitle(sheetTitle)}!A:I`;
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range,
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: {
      values: buildSheetValues(classroom, students),
    },
  });

  meta.lastSyncAt = nowIso();
  meta.lastError = null;
  await writeMeta(meta);

  return {
    classroomId: classroom.id,
    sheetId,
    title: sheetTitle,
    syncedStudentCount: students.length,
  };
};

const deleteClassroomSheet = async (rawPayload: ClassroomSyncPayload) => {
  const payload = normalizeClassroomSyncPayload(rawPayload);
  const meta = await readMeta();
  const { sheets, spreadsheetId, spreadsheet } = await getSpreadsheet();
  const classroomMappings = meta.classrooms || {};
  const mapping = classroomMappings[payload.classroomId];
  const allSheets = spreadsheet.sheets || [];

  let targetSheet = allSheets.find((sheet) => sheet.properties?.sheetId === mapping?.sheetId);

  if (!targetSheet && mapping?.title) {
    targetSheet = allSheets.find((sheet) => sheet.properties?.title === mapping.title);
  }

  if (!targetSheet && payload.classroomName) {
    const fallbackTitle = sanitizeSheetTitle(payload.classroomName);
    targetSheet = allSheets.find((sheet) => sheet.properties?.title === fallbackTitle);
  }

  if (targetSheet?.properties?.sheetId != null && allSheets.length > 1) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteSheet: {
              sheetId: targetSheet.properties.sheetId,
            },
          },
        ],
      },
    });
  } else if (targetSheet?.properties?.title) {
    const archiveTitle = getUniqueSheetTitle(
      spreadsheet,
      sanitizeSheetTitle(`Archived ${payload.classroomName || payload.classroomId}`),
      targetSheet.properties.sheetId || undefined
    );
    const range = `${quoteSheetTitle(targetSheet.properties.title)}!A:I`;

    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range,
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[...SHEET_HEADERS]],
      },
    });
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            updateSheetProperties: {
              properties: {
                sheetId: targetSheet.properties.sheetId,
                title: archiveTitle,
                gridProperties: {
                  frozenRowCount: 1,
                },
              },
              fields: 'title,gridProperties.frozenRowCount',
            },
          },
        ],
      },
    });
  }

  if (meta.classrooms) {
    delete meta.classrooms[payload.classroomId];
  }

  meta.lastSyncAt = nowIso();
  meta.lastError = null;
  await writeMeta(meta);

  return {
    classroomId: payload.classroomId,
    removed: true,
  };
};

export const verifyAdminIdToken = async (idToken: string) => verifyAdminToken(idToken);

export const syncClassroomToGoogleSheets = async (rawPayload: ClassroomSyncPayload) => {
  const payload = normalizeClassroomSyncPayload(rawPayload);

  try {
    if (!hasGoogleSheetsConfig()) {
      console.warn(
        'Google Sheets sync skipped: GOOGLE_SPREADSHEET_ID or credentials not configured.'
      );
      return { skipped: true, reason: 'Not configured' };
    }

    if ((payload.mode || 'upsert') === 'delete') {
      return await deleteClassroomSheet(payload);
    }

    const classroom = await getClassroomDoc(payload.classroomId);
    return await persistClassroomSheet(classroom, payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Google Sheets classroom sync failed.';
    await setMetaError(message);
    throw error;
  }
};

export const syncStudentToGoogleSheets = async (payload: StudentSyncPayload) => {
  const sourceClassroomId = payload.sourceClassroomId;
  const targetClassroomId = payload.targetClassroomId;

  if (payload.mode === 'move') {
    if (!sourceClassroomId || !targetClassroomId) {
      throw new Error('sourceClassroomId and targetClassroomId are required for move sync.');
    }

    return Promise.all([
      syncClassroomToGoogleSheets({ classroomId: sourceClassroomId, mode: 'upsert' }),
      syncClassroomToGoogleSheets({ classroomId: targetClassroomId, mode: 'upsert' }),
    ]);
  }

  const classroomId = payload.classroomId;
  if (!classroomId) {
    throw new Error('classroomId is required for student sync.');
  }

  return syncClassroomToGoogleSheets({
    classroomId,
    mode: 'upsert',
  });
};

export const getGoogleSheetsStatus = async () => {
  const meta = await readMeta();
  const classroomMappings = meta.classrooms || {};
  const classroomCount = Object.keys(classroomMappings).length;

  return {
    configured: hasGoogleSheetsConfig(),
    spreadsheetId: meta.spreadsheetId,
    lastSyncAt: meta.lastSyncAt || null,
    lastError: meta.lastError || null,
    classroomCount,
  };
};
