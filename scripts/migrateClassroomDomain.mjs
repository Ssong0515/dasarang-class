import fs from 'node:fs';
import {
  applicationDefault,
  cert,
  getApps as getAdminApps,
  initializeApp as initializeAdminApp,
} from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { deleteApp, initializeApp as initializeClientApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  collection as clientCollection,
  doc as clientDoc,
  getDoc as clientGetDoc,
  getDocs as clientGetDocs,
  getFirestore as getClientFirestore,
  writeBatch as createClientBatch,
} from 'firebase/firestore';

const ADMIN_EMAIL = 'songes0515@gmail.com';
const BATCH_SIZE = 350;
const LEGACY_CLASSROOMS_COLLECTION = 'folders';
const CLASSROOMS_COLLECTION = 'classrooms';
const LEGACY_CLASSROOM_DATE_RECORDS_COLLECTION = 'folderDateRecords';
const CLASSROOM_DATE_RECORDS_COLLECTION = 'classroomDateRecords';
const STUDENTS_COLLECTION = 'students';
const INTEGRATIONS_COLLECTION = 'integrations';
const GOOGLE_SHEETS_DOC_ID = 'googleSheets';
const SHOULD_EXECUTE = process.argv.includes('--execute');

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

const normalizePrivateKey = (privateKey) => privateKey?.replace(/\\n/g, '\n');

const parseServiceAccountJson = (raw) => {
  if (!raw) {
    return null;
  }

  const parsed = JSON.parse(raw);
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

const getServiceAccountFromEnv = (prefix) => {
  const jsonConfig = parseServiceAccountJson(process.env[`${prefix}_SERVICE_ACCOUNT_JSON`]);
  if (jsonConfig) {
    return jsonConfig;
  }

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

const getFirebaseServiceAccount = () =>
  getServiceAccountFromEnv('FIREBASE') || getServiceAccountFromEnv('GOOGLE');

const chunk = (items, size) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const getTrimmedString = (value) => (typeof value === 'string' ? value.trim() : '');

const getOptionalTrimmedString = (value) => {
  const trimmed = getTrimmedString(value);
  return trimmed || undefined;
};

const getNormalizedStringArray = (value) =>
  Array.isArray(value)
    ? value
        .map((entry) => getTrimmedString(entry))
        .filter(Boolean)
    : [];

const stripUndefinedDeep = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => stripUndefinedDeep(entry));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, stripUndefinedDeep(entryValue)])
  );
};

const getStableComparableValue = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => getStableComparableValue(entry));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.keys(value)
    .sort()
    .reduce((accumulator, key) => {
      accumulator[key] = getStableComparableValue(value[key]);
      return accumulator;
    }, {});
};

const stableStringify = (value) =>
  JSON.stringify(getStableComparableValue(stripUndefinedDeep(value)));

const normalizeAttendanceEntry = (entry) => {
  const studentId = getTrimmedString(entry?.studentId);
  if (!studentId) {
    return null;
  }

  return stripUndefinedDeep({
    studentId,
    status:
      entry?.status === 'Absent' || entry?.status === 'Late' || entry?.status === 'Present'
        ? entry.status
        : 'Present',
    isExcluded: entry?.isExcluded === true ? true : undefined,
  });
};

const normalizeClassroomData = (data) => {
  return stripUndefinedDeep({
    ...data,
    name: getTrimmedString(data?.name),
    ownerUid: getTrimmedString(data?.ownerUid),
    students: Array.isArray(data?.students) ? data.students : [],
    assignedContentIds: getNormalizedStringArray(data?.assignedContentIds),
    isOpen: typeof data?.isOpen === 'boolean' ? data.isOpen : undefined,
    order: Number.isFinite(data?.order) ? data.order : undefined,
    icon: getOptionalTrimmedString(data?.icon),
    color: getOptionalTrimmedString(data?.color),
    createdAt: getOptionalTrimmedString(data?.createdAt),
  });
};

const normalizeClassroomDateRecordData = (data) => {
  const classroomId = getTrimmedString(data?.classroomId) || getTrimmedString(data?.folderId);
  if (!classroomId) {
    return null;
  }

  const classroomName =
    getTrimmedString(data?.classroomName) || getTrimmedString(data?.folderName);

  return stripUndefinedDeep({
    ...data,
    classroomId,
    classroomName,
    folderId: classroomId,
    folderName: classroomName,
    ownerUid: getTrimmedString(data?.ownerUid),
    date: getTrimmedString(data?.date),
    contentIds: getNormalizedStringArray(data?.contentIds),
    attendance: Array.isArray(data?.attendance)
      ? data.attendance.map(normalizeAttendanceEntry).filter(Boolean)
      : [],
    memo: getTrimmedString(data?.memo),
    createdAt: getTrimmedString(data?.createdAt),
    updatedAt: getTrimmedString(data?.updatedAt),
  });
};

const normalizeStudentUpdate = (data) => {
  const classroomId = getTrimmedString(data?.classroomId) || getTrimmedString(data?.folderId);
  if (!classroomId) {
    return null;
  }

  return {
    classroomId,
    folderId: classroomId,
  };
};

const normalizeClassroomMappings = (value) => {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return Object.entries(value).reduce((accumulator, [classroomId, mapping]) => {
    if (!mapping || typeof mapping !== 'object') {
      return accumulator;
    }

    const sheetId = Number.isFinite(mapping.sheetId) ? mapping.sheetId : undefined;
    const title = getOptionalTrimmedString(mapping.title);

    if (sheetId === undefined || !title) {
      return accumulator;
    }

    accumulator[classroomId] = {
      sheetId,
      title,
    };
    return accumulator;
  }, {});
};

const normalizeGoogleSheetsMetaUpdate = (data) => {
  const classroomMappings = normalizeClassroomMappings(data?.classrooms || data?.folders);
  const classroomCount = Object.keys(classroomMappings).length;

  return stripUndefinedDeep({
    classrooms: classroomMappings,
    folders: classroomMappings,
    classroomCount,
    folderCount: classroomCount,
  });
};

const collectMigrationPlan = ({
  legacyClassroomDocs,
  classroomDocs,
  legacyDateRecordDocs,
  classroomDateRecordDocs,
  studentDocs,
  googleSheetsMeta,
}) => {
  const classroomWrites = [];
  const dateRecordWrites = [];
  const studentWrites = [];

  const classroomDocsById = new Map(classroomDocs.map((doc) => [doc.id, doc]));
  for (const legacyDoc of legacyClassroomDocs) {
    const normalizedClassroom = normalizeClassroomData(legacyDoc.data());
    const nextDoc = classroomDocsById.get(legacyDoc.id);
    const nextClassroom = nextDoc ? normalizeClassroomData(nextDoc.data()) : null;

    if (!nextClassroom || stableStringify(nextClassroom) !== stableStringify(normalizedClassroom)) {
      classroomWrites.push({
        collection: CLASSROOMS_COLLECTION,
        id: legacyDoc.id,
        data: normalizedClassroom,
      });
    }
  }

  const classroomDateRecordDocsById = new Map(classroomDateRecordDocs.map((doc) => [doc.id, doc]));
  for (const legacyDoc of legacyDateRecordDocs) {
    const normalizedRecord = normalizeClassroomDateRecordData(legacyDoc.data());
    if (!normalizedRecord) {
      continue;
    }

    const nextDoc = classroomDateRecordDocsById.get(legacyDoc.id);
    const nextRecord = nextDoc ? normalizeClassroomDateRecordData(nextDoc.data()) : null;

    if (!nextRecord || stableStringify(nextRecord) !== stableStringify(normalizedRecord)) {
      dateRecordWrites.push({
        collection: CLASSROOM_DATE_RECORDS_COLLECTION,
        id: legacyDoc.id,
        data: normalizedRecord,
      });
    }
  }

  let studentsMissingClassroomReference = 0;
  for (const studentDoc of studentDocs) {
    const normalizedUpdate = normalizeStudentUpdate(studentDoc.data());
    if (!normalizedUpdate) {
      studentsMissingClassroomReference += 1;
      continue;
    }

    if (
      getTrimmedString(studentDoc.data()?.classroomId) !== normalizedUpdate.classroomId ||
      getTrimmedString(studentDoc.data()?.folderId) !== normalizedUpdate.folderId
    ) {
      studentWrites.push({
        collection: STUDENTS_COLLECTION,
        id: studentDoc.id,
        data: normalizedUpdate,
      });
    }
  }

  const normalizedMeta = normalizeGoogleSheetsMetaUpdate(googleSheetsMeta?.data || {});
  const existingMetaComparable = stripUndefinedDeep({
    classrooms: normalizeClassroomMappings(googleSheetsMeta?.data?.classrooms),
    folders: normalizeClassroomMappings(googleSheetsMeta?.data?.folders),
    classroomCount: Number.isFinite(googleSheetsMeta?.data?.classroomCount)
      ? googleSheetsMeta.data.classroomCount
      : undefined,
    folderCount: Number.isFinite(googleSheetsMeta?.data?.folderCount)
      ? googleSheetsMeta.data.folderCount
      : undefined,
  });
  const googleSheetsMetaWrite =
    stableStringify(existingMetaComparable) === stableStringify(normalizedMeta)
      ? null
      : {
          collection: INTEGRATIONS_COLLECTION,
          id: GOOGLE_SHEETS_DOC_ID,
          data: normalizedMeta,
        };

  return {
    stats: {
      dryRun: !SHOULD_EXECUTE,
      legacyClassroomCount: legacyClassroomDocs.length,
      classroomCount: classroomDocs.length,
      legacyClassroomDateRecordCount: legacyDateRecordDocs.length,
      classroomDateRecordCount: classroomDateRecordDocs.length,
      studentCount: studentDocs.length,
      studentsMissingClassroomReference,
      plannedClassroomUpserts: classroomWrites.length,
      plannedClassroomDateRecordUpserts: dateRecordWrites.length,
      plannedStudentUpdates: studentWrites.length,
      plannedGoogleSheetsMetaUpdates: googleSheetsMetaWrite ? 1 : 0,
    },
    classroomWrites,
    dateRecordWrites,
    studentWrites,
    googleSheetsMetaWrite,
  };
};

const commitAdminWrites = async (adminDb, operations) => {
  for (const operationChunk of chunk(operations, BATCH_SIZE)) {
    const batch = adminDb.batch();

    for (const operation of operationChunk) {
      batch.set(adminDb.collection(operation.collection).doc(operation.id), operation.data, {
        merge: true,
      });
    }

    await batch.commit();
  }
};

const commitClientWrites = async (clientDb, operations) => {
  for (const operationChunk of chunk(operations, BATCH_SIZE)) {
    const batch = createClientBatch(clientDb);

    for (const operation of operationChunk) {
      batch.set(clientDoc(clientDb, operation.collection, operation.id), operation.data, {
        merge: true,
      });
    }

    await batch.commit();
  }
};

const migrateWithAdminSdk = async () => {
  const serviceAccount = getFirebaseServiceAccount();
  const adminApp =
    getAdminApps()[0] ??
    initializeAdminApp(
      serviceAccount
        ? {
            credential: cert({
              projectId: serviceAccount.projectId,
              clientEmail: serviceAccount.clientEmail,
              privateKey: serviceAccount.privateKey,
            }),
            projectId: serviceAccount.projectId || firebaseConfig.projectId,
          }
        : {
            credential: applicationDefault(),
            projectId: firebaseConfig.projectId,
          }
    );

  const adminDb = getAdminFirestore(adminApp, firebaseConfig.firestoreDatabaseId);
  const [
    legacyClassroomSnapshot,
    classroomSnapshot,
    legacyDateRecordSnapshot,
    classroomDateRecordSnapshot,
    studentSnapshot,
    googleSheetsMetaSnapshot,
  ] = await Promise.all([
    adminDb.collection(LEGACY_CLASSROOMS_COLLECTION).get(),
    adminDb.collection(CLASSROOMS_COLLECTION).get(),
    adminDb.collection(LEGACY_CLASSROOM_DATE_RECORDS_COLLECTION).get(),
    adminDb.collection(CLASSROOM_DATE_RECORDS_COLLECTION).get(),
    adminDb.collection(STUDENTS_COLLECTION).get(),
    adminDb.collection(INTEGRATIONS_COLLECTION).doc(GOOGLE_SHEETS_DOC_ID).get(),
  ]);

  const plan = collectMigrationPlan({
    legacyClassroomDocs: legacyClassroomSnapshot.docs,
    classroomDocs: classroomSnapshot.docs,
    legacyDateRecordDocs: legacyDateRecordSnapshot.docs,
    classroomDateRecordDocs: classroomDateRecordSnapshot.docs,
    studentDocs: studentSnapshot.docs,
    googleSheetsMeta: {
      exists: googleSheetsMetaSnapshot.exists,
      data: googleSheetsMetaSnapshot.data() || {},
    },
  });

  if (!SHOULD_EXECUTE) {
    return {
      mode: 'admin-sdk',
      ...plan.stats,
    };
  }

  const operations = [
    ...plan.classroomWrites,
    ...plan.dateRecordWrites,
    ...plan.studentWrites,
    ...(plan.googleSheetsMetaWrite ? [plan.googleSheetsMetaWrite] : []),
  ];

  await commitAdminWrites(adminDb, operations);

  return {
    mode: 'admin-sdk',
    executedWrites: operations.length,
    ...plan.stats,
  };
};

const migrateWithAdminLogin = async () => {
  const rawPassword = process.env.ADMIN_PASSWORD;
  if (!rawPassword) {
    throw new Error(
      'No Firebase Admin credentials were found. Set ADMIN_PASSWORD or FIREBASE_SERVICE_ACCOUNT_JSON.'
    );
  }

  const finalPassword = rawPassword.length < 6 ? rawPassword.padEnd(6, '0') : rawPassword;
  const clientApp = initializeClientApp(firebaseConfig, `migrate-classroom-domain-${Date.now()}`);
  const auth = getAuth(clientApp);
  await signInWithEmailAndPassword(auth, ADMIN_EMAIL, finalPassword);

  try {
    const clientDb = getClientFirestore(clientApp, firebaseConfig.firestoreDatabaseId);
    const [
      legacyClassroomSnapshot,
      classroomSnapshot,
      legacyDateRecordSnapshot,
      classroomDateRecordSnapshot,
      studentSnapshot,
      googleSheetsMetaSnapshot,
    ] = await Promise.all([
      clientGetDocs(clientCollection(clientDb, LEGACY_CLASSROOMS_COLLECTION)),
      clientGetDocs(clientCollection(clientDb, CLASSROOMS_COLLECTION)),
      clientGetDocs(clientCollection(clientDb, LEGACY_CLASSROOM_DATE_RECORDS_COLLECTION)),
      clientGetDocs(clientCollection(clientDb, CLASSROOM_DATE_RECORDS_COLLECTION)),
      clientGetDocs(clientCollection(clientDb, STUDENTS_COLLECTION)),
      clientGetDoc(clientDoc(clientDb, INTEGRATIONS_COLLECTION, GOOGLE_SHEETS_DOC_ID)),
    ]);

    const plan = collectMigrationPlan({
      legacyClassroomDocs: legacyClassroomSnapshot.docs,
      classroomDocs: classroomSnapshot.docs,
      legacyDateRecordDocs: legacyDateRecordSnapshot.docs,
      classroomDateRecordDocs: classroomDateRecordSnapshot.docs,
      studentDocs: studentSnapshot.docs,
      googleSheetsMeta: {
        exists: googleSheetsMetaSnapshot.exists(),
        data: googleSheetsMetaSnapshot.data() || {},
      },
    });

    if (!SHOULD_EXECUTE) {
      return {
        mode: 'admin-login',
        ...plan.stats,
      };
    }

    const operations = [
      ...plan.classroomWrites,
      ...plan.dateRecordWrites,
      ...plan.studentWrites,
      ...(plan.googleSheetsMetaWrite ? [plan.googleSheetsMetaWrite] : []),
    ];

    await commitClientWrites(clientDb, operations);

    return {
      mode: 'admin-login',
      executedWrites: operations.length,
      ...plan.stats,
    };
  } finally {
    await signOut(auth).catch(() => {});
    await deleteApp(clientApp).catch(() => {});
  }
};

try {
  const result = getFirebaseServiceAccount()
    ? await migrateWithAdminSdk()
    : await migrateWithAdminLogin();

  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  process.exit(0);
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  );
  process.exit(1);
}
