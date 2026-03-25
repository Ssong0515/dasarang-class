import { google } from 'googleapis';
import { applicationDefault, cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import type { LessonFolder, Student } from '../src/types';

const ADMIN_EMAIL = 'songes0515@gmail.com';
const INTEGRATIONS_COLLECTION = 'integrations';
const GOOGLE_SHEETS_DOC_ID = 'googleSheets';
const SHEET_HEADERS = ['studentId', 'name', 'initials', 'age', 'contact', 'memo', 'classId', 'className', 'updatedAt'] as const;

type SyncMode = 'upsert' | 'delete';

interface FolderSheetMapping {
  sheetId: number;
  title: string;
}

interface GoogleSheetsSyncMeta {
  spreadsheetId: string;
  folders?: Record<string, FolderSheetMapping>;
  lastSyncAt?: string;
  lastError?: string | null;
  updatedAt?: string;
}

interface ServiceAccountConfig {
  projectId?: string;
  clientEmail: string;
  privateKey: string;
}

export interface FolderSyncPayload {
  folderId: string;
  mode?: SyncMode;
  previousName?: string;
  folderName?: string;
}

export interface StudentSyncPayload {
  folderId?: string;
  studentId?: string;
  mode?: 'upsert' | 'delete' | 'move';
  sourceFolderId?: string;
  targetFolderId?: string;
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

const getFirebaseServiceAccount = () => getServiceAccountFromEnv('FIREBASE') || getServiceAccountFromEnv('GOOGLE');
const getGoogleServiceAccount = () => getServiceAccountFromEnv('GOOGLE') || getServiceAccountFromEnv('FIREBASE');

const hasGoogleSheetsConfig = () => Boolean(process.env.GOOGLE_SPREADSHEET_ID && getGoogleServiceAccount());

const getSpreadsheetId = () => {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw new Error('GOOGLE_SPREADSHEET_ID is not configured.');
  }
  return spreadsheetId;
};

const getFirebaseAdminApp = () => {
  if (getApps().length > 0) {
    return getApps()[0]!;
  }

  const serviceAccount = getFirebaseServiceAccount();

  if (serviceAccount) {
    return initializeApp({
      credential: cert({
        projectId: serviceAccount.projectId,
        clientEmail: serviceAccount.clientEmail,
        privateKey: serviceAccount.privateKey,
      } satisfies ServiceAccount),
      projectId: serviceAccount.projectId || firebaseConfig.projectId,
    });
  }

  return initializeApp({
    credential: applicationDefault(),
    projectId: firebaseConfig.projectId,
  });
};

const getAdminDb = () => getFirestore(getFirebaseAdminApp(), firebaseConfig.firestoreDatabaseId);

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

  return {
    spreadsheetId: getSpreadsheetId(),
    folders: data.folders || {},
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
  await getMetaRef().set(stripUndefined({
    ...meta,
    spreadsheetId: getSpreadsheetId(),
    updatedAt: nowIso(),
  }), { merge: true });
};

const setMetaError = async (message: string) => {
  await getMetaRef().set({
    spreadsheetId: getSpreadsheetId(),
    lastError: message,
    updatedAt: nowIso(),
  }, { merge: true });
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

const buildSheetValues = (folder: LessonFolder) => {
  const students = folder.students || [];

  return [
    [...SHEET_HEADERS],
    ...students.map((student: Student) => [
      student.id,
      student.name,
      student.initials,
      student.age || '',
      student.contact || '',
      student.memo || '',
      folder.id,
      folder.name,
      student.updatedAt || '',
    ]),
  ];
};

const getFolderDoc = async (folderId: string) => {
  const snapshot = await getAdminDb().collection('folders').doc(folderId).get();
  if (!snapshot.exists) {
    throw new Error(`Folder '${folderId}' was not found in Firestore.`);
  }

  return {
    id: snapshot.id,
    ...(snapshot.data() as Omit<LessonFolder, 'id'>),
  } as LessonFolder;
};

const persistFolderSheet = async (folder: LessonFolder, payload?: FolderSyncPayload) => {
  const meta = await readMeta();
  const { sheets, spreadsheetId, spreadsheet } = await getSpreadsheet();
  const otherMappedSheetIds = new Set(
    Object.entries(meta.folders || {})
      .filter(([mappedFolderId]) => mappedFolderId !== folder.id)
      .map(([, mapping]) => mapping.sheetId)
  );

  const mapping = meta.folders?.[folder.id];
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
      (sheet) => sheet.properties?.title === previousTitle && !otherMappedSheetIds.has(sheet.properties?.sheetId || -1)
    );
  }

  if (!targetSheet) {
    const currentTitle = sanitizeSheetTitle(folder.name);
    targetSheet = (spreadsheet.sheets || []).find(
      (sheet) => sheet.properties?.title === currentTitle && !otherMappedSheetIds.has(sheet.properties?.sheetId || -1)
    );
  }

  const desiredTitle = getUniqueSheetTitle(
    spreadsheet,
    sanitizeSheetTitle(folder.name),
    targetSheet?.properties?.sheetId
  );

  let sheetId = targetSheet?.properties?.sheetId;
  let sheetTitle = desiredTitle;

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
      throw new Error(`Failed to create a Google Sheets tab for folder '${folder.id}'.`);
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

  meta.folders = {
    ...(meta.folders || {}),
    [folder.id]: {
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
      values: buildSheetValues(folder),
    },
  });

  meta.lastSyncAt = nowIso();
  meta.lastError = null;
  await writeMeta(meta);

  return {
    folderId: folder.id,
    sheetId,
    title: sheetTitle,
    syncedStudentCount: folder.students?.length || 0,
  };
};

const deleteFolderSheet = async (payload: FolderSyncPayload) => {
  const meta = await readMeta();
  const { sheets, spreadsheetId, spreadsheet } = await getSpreadsheet();
  const mapping = meta.folders?.[payload.folderId];
  const allSheets = spreadsheet.sheets || [];

  let targetSheet = allSheets.find((sheet) => sheet.properties?.sheetId === mapping?.sheetId);

  if (!targetSheet && mapping?.title) {
    targetSheet = allSheets.find((sheet) => sheet.properties?.title === mapping.title);
  }

  if (!targetSheet && payload.folderName) {
    const fallbackTitle = sanitizeSheetTitle(payload.folderName);
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
      sanitizeSheetTitle(`Archived ${payload.folderName || payload.folderId}`),
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

  if (meta.folders) {
    delete meta.folders[payload.folderId];
  }

  meta.lastSyncAt = nowIso();
  meta.lastError = null;
  await writeMeta(meta);

  return {
    folderId: payload.folderId,
    removed: true,
  };
};

export const verifyAdminIdToken = async (idToken: string) => {
  const decodedToken = await getAdminAuth(getFirebaseAdminApp()).verifyIdToken(idToken);

  if (decodedToken.email !== ADMIN_EMAIL) {
    throw new Error('관리자 권한이 필요합니다.');
  }

  return decodedToken;
};

export const syncFolderToGoogleSheets = async (payload: FolderSyncPayload) => {
  try {
    if (!hasGoogleSheetsConfig()) {
      console.warn('Google Sheets sync skipped: GOOGLE_SPREADSHEET_ID or credentials not configured.');
      return { skipped: true, reason: 'Not configured' };
    }

    if ((payload.mode || 'upsert') === 'delete') {
      return await deleteFolderSheet(payload);
    }

    const folder = await getFolderDoc(payload.folderId);
    return await persistFolderSheet(folder, payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google Sheets folder sync failed.';
    await setMetaError(message);
    throw error;
  }
};

export const syncStudentToGoogleSheets = async (payload: StudentSyncPayload) => {
  if (payload.mode === 'move') {
    if (!payload.sourceFolderId || !payload.targetFolderId) {
      throw new Error('sourceFolderId and targetFolderId are required for move sync.');
    }

    return Promise.all([
      syncFolderToGoogleSheets({ folderId: payload.sourceFolderId, mode: 'upsert' }),
      syncFolderToGoogleSheets({ folderId: payload.targetFolderId, mode: 'upsert' }),
    ]);
  }

  if (!payload.folderId) {
    throw new Error('folderId is required for student sync.');
  }

  return syncFolderToGoogleSheets({
    folderId: payload.folderId,
    mode: payload.mode === 'delete' ? 'upsert' : 'upsert',
  });
};

export const getGoogleSheetsStatus = async () => {
  const meta = await readMeta();

  return {
    configured: hasGoogleSheetsConfig(),
    spreadsheetId: meta.spreadsheetId,
    lastSyncAt: meta.lastSyncAt || null,
    lastError: meta.lastError || null,
    folderCount: Object.keys(meta.folders || {}).length,
  };
};
