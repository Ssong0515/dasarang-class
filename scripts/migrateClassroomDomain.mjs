import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {
  applicationDefault,
  cert,
  getApps as getAdminApps,
  initializeApp as initializeAdminApp,
} from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';

const CLASSROOMS_COLLECTION = 'classrooms';
const LEGACY_CLASSROOMS_COLLECTION = 'folders';
const CLASSROOM_DATE_RECORDS_COLLECTION = 'classroomDateRecords';
const LEGACY_CLASSROOM_DATE_RECORDS_COLLECTION = 'folderDateRecords';
const DEFAULT_AUDIT_PATH = path.resolve(process.cwd(), 'scripts', 'classroom-domain-audit.json');
const BATCH_SIZE = 350;

const args = new Set(process.argv.slice(2));
const shouldApply = args.has('--apply');
const outputArg = [...args].find((arg) => arg.startsWith('--output='));
const auditOutputPath = outputArg
  ? path.resolve(process.cwd(), outputArg.slice('--output='.length))
  : DEFAULT_AUDIT_PATH;

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

const getAdminDb = () => {
  const existingApp = getAdminApps()[0];
  if (existingApp) {
    return getAdminFirestore(existingApp, firebaseConfig.firestoreDatabaseId);
  }

  const serviceAccount = getFirebaseServiceAccount();
  const app = initializeAdminApp(
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

  return getAdminFirestore(app, firebaseConfig.firestoreDatabaseId);
};

const normalizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const getOptionalString = (value) => {
  const normalized = normalizeString(value);
  return normalized || undefined;
};

const normalizeStringArray = (value) =>
  Array.isArray(value)
    ? value.map((entry) => normalizeString(entry)).filter(Boolean)
    : [];

const normalizeAttendanceEntry = (entry) => {
  const studentId = normalizeString(entry?.studentId);
  if (!studentId) {
    return null;
  }

  return {
    studentId,
    status:
      entry?.status === 'Absent' || entry?.status === 'Late' || entry?.status === 'Present'
        ? entry.status
        : 'Present',
    ...(entry?.isExcluded === true ? { isExcluded: true } : {}),
  };
};

const normalizeAttendance = (value) =>
  Array.isArray(value)
    ? value.map((entry) => normalizeAttendanceEntry(entry)).filter(Boolean)
    : [];

const getCanonicalRecordId = (classroomId, date) => `${classroomId}_${date}`;

const parseTimestamp = (value) => {
  const normalized = normalizeString(value);
  if (!normalized) {
    return Number.NEGATIVE_INFINITY;
  }

  const timestamp = new Date(normalized).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
};

const compareRecordWinner = (left, right) => {
  const updatedAtDiff = parseTimestamp(right.updatedAt) - parseTimestamp(left.updatedAt);
  if (updatedAtDiff !== 0) {
    return updatedAtDiff;
  }

  const createdAtDiff = parseTimestamp(right.createdAt) - parseTimestamp(left.createdAt);
  if (createdAtDiff !== 0) {
    return createdAtDiff;
  }

  const leftHasMemo = left.memo.length > 0;
  const rightHasMemo = right.memo.length > 0;
  if (leftHasMemo !== rightHasMemo) {
    return rightHasMemo ? 1 : -1;
  }

  if (left.contentIds.length !== right.contentIds.length) {
    return right.contentIds.length - left.contentIds.length;
  }

  if (left.sourceCollection !== right.sourceCollection) {
    return left.sourceCollection === CLASSROOM_DATE_RECORDS_COLLECTION ? -1 : 1;
  }

  const leftHasCanonicalId = left.sourceId === left.canonicalId;
  const rightHasCanonicalId = right.sourceId === right.canonicalId;
  if (leftHasCanonicalId !== rightHasCanonicalId) {
    return leftHasCanonicalId ? -1 : 1;
  }

  return left.sourceId.localeCompare(right.sourceId);
};

const earliestTimestampValue = (values) => {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  return finiteValues.length > 0 ? Math.min(...finiteValues) : Date.now();
};

const latestTimestampValue = (values) => {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  return finiteValues.length > 0 ? Math.max(...finiteValues) : Date.now();
};

const toIso = (timestamp) => new Date(timestamp).toISOString();

const normalizeClassroomDoc = (snapshot, sourceCollection) => {
  const data = snapshot.data() || {};

  return {
    id: snapshot.id,
    sourceCollection,
    name: normalizeString(data.name),
    ownerUid: normalizeString(data.ownerUid),
    students: Array.isArray(data.students) ? data.students : [],
    assignedContentIds: normalizeStringArray(data.assignedContentIds),
    isOpen: typeof data.isOpen === 'boolean' ? data.isOpen : undefined,
    order: Number.isFinite(data.order) ? data.order : undefined,
    icon: getOptionalString(data.icon),
    color: getOptionalString(data.color),
    createdAt: getOptionalString(data.createdAt),
  };
};

const normalizeClassroomDateRecordDoc = (snapshot, sourceCollection) => {
  const data = snapshot.data() || {};
  const classroomId = normalizeString(data.classroomId) || normalizeString(data.folderId);
  const date = normalizeString(data.date);

  if (!classroomId || !date) {
    return null;
  }

  return {
    sourceCollection,
    sourceId: snapshot.id,
    canonicalId: getCanonicalRecordId(classroomId, date),
    classroomId,
    classroomName: normalizeString(data.classroomName) || normalizeString(data.folderName),
    ownerUid: normalizeString(data.ownerUid),
    date,
    contentIds: normalizeStringArray(data.contentIds),
    attendance: normalizeAttendance(data.attendance),
    memo: normalizeString(data.memo),
    createdAt: getOptionalString(data.createdAt),
    updatedAt: getOptionalString(data.updatedAt),
  };
};

const chooseClassroomValue = (currentValue, legacyValue) => {
  if (currentValue === undefined || currentValue === null || currentValue === '') {
    return legacyValue;
  }

  if (Array.isArray(currentValue) && currentValue.length === 0 && Array.isArray(legacyValue)) {
    return legacyValue;
  }

  return currentValue;
};

const mergeClassroomDocs = (currentDoc, legacyDoc) => {
  const currentData = currentDoc || {};
  const legacyData = legacyDoc || {};

  return {
    id: currentData.id || legacyData.id,
    name: chooseClassroomValue(currentData.name, legacyData.name) || 'Untitled classroom',
    ownerUid: chooseClassroomValue(currentData.ownerUid, legacyData.ownerUid) || '',
    students: chooseClassroomValue(currentData.students, legacyData.students) || [],
    assignedContentIds:
      chooseClassroomValue(currentData.assignedContentIds, legacyData.assignedContentIds) || [],
    ...(typeof chooseClassroomValue(currentData.isOpen, legacyData.isOpen) === 'boolean'
      ? { isOpen: chooseClassroomValue(currentData.isOpen, legacyData.isOpen) }
      : {}),
    ...(Number.isFinite(chooseClassroomValue(currentData.order, legacyData.order))
      ? { order: chooseClassroomValue(currentData.order, legacyData.order) }
      : {}),
    ...(chooseClassroomValue(currentData.icon, legacyData.icon)
      ? { icon: chooseClassroomValue(currentData.icon, legacyData.icon) }
      : {}),
    ...(chooseClassroomValue(currentData.color, legacyData.color)
      ? { color: chooseClassroomValue(currentData.color, legacyData.color) }
      : {}),
    ...(chooseClassroomValue(currentData.createdAt, legacyData.createdAt)
      ? { createdAt: chooseClassroomValue(currentData.createdAt, legacyData.createdAt) }
      : {}),
  };
};

const mergeRecordGroup = (records, classroomNameById) => {
  const sortedRecords = [...records].sort(compareRecordWinner);
  const winner = sortedRecords[0];
  const mergedContentIds = [];
  const seenContentIds = new Set();

  sortedRecords.forEach((record) => {
    record.contentIds.forEach((contentId) => {
      if (!seenContentIds.has(contentId)) {
        seenContentIds.add(contentId);
        mergedContentIds.push(contentId);
      }
    });
  });

  const memoRecord = sortedRecords.find((record) => record.memo.length > 0);
  const attendanceRecord = sortedRecords.find((record) => record.attendance.length > 0);
  const earliestCreatedAt = earliestTimestampValue(
    sortedRecords.map((record) => parseTimestamp(record.createdAt))
  );
  const latestUpdatedAt = latestTimestampValue(
    sortedRecords.map((record) => parseTimestamp(record.updatedAt))
  );

  return {
    id: winner.canonicalId,
    classroomId: winner.classroomId,
    classroomName:
      winner.classroomName || classroomNameById.get(winner.classroomId) || winner.classroomId,
    ownerUid:
      winner.ownerUid || sortedRecords.find((record) => record.ownerUid)?.ownerUid || '',
    date: winner.date,
    contentIds: mergedContentIds,
    attendance: attendanceRecord ? attendanceRecord.attendance : [],
    memo: memoRecord ? memoRecord.memo : '',
    createdAt: toIso(earliestCreatedAt),
    updatedAt: toIso(latestUpdatedAt),
  };
};

const chunk = (items, size) => {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
};

const batchSetDocuments = async (db, collectionName, writes) => {
  for (const writeChunk of chunk(writes, BATCH_SIZE)) {
    const batch = db.batch();

    writeChunk.forEach((write) => {
      batch.set(db.collection(collectionName).doc(write.id), write.data);
    });

    await batch.commit();
  }
};

const batchDeleteDocuments = async (db, collectionName, ids) => {
  for (const idChunk of chunk(ids, BATCH_SIZE)) {
    const batch = db.batch();

    idChunk.forEach((id) => {
      batch.delete(db.collection(collectionName).doc(id));
    });

    await batch.commit();
  }
};

const buildAudit = ({
  currentClassrooms,
  legacyClassrooms,
  currentDateRecords,
  legacyDateRecords,
}) => {
  const classroomNameById = new Map();
  const currentClassroomMap = new Map(currentClassrooms.map((doc) => [doc.id, doc]));
  const legacyClassroomMap = new Map(legacyClassrooms.map((doc) => [doc.id, doc]));
  const canonicalClassroomIds = new Set([
    ...currentClassroomMap.keys(),
    ...legacyClassroomMap.keys(),
  ]);

  const canonicalClassroomWrites = [...canonicalClassroomIds]
    .sort()
    .map((classroomId) => {
      const mergedClassroom = mergeClassroomDocs(
        currentClassroomMap.get(classroomId),
        legacyClassroomMap.get(classroomId)
      );
      classroomNameById.set(classroomId, mergedClassroom.name);
      return {
        id: classroomId,
        data: mergedClassroom,
      };
    });

  const allDateRecords = [...currentDateRecords, ...legacyDateRecords];
  const recordGroups = new Map();

  allDateRecords.forEach((record) => {
    const existingGroup = recordGroups.get(record.canonicalId);
    if (existingGroup) {
      existingGroup.push(record);
    } else {
      recordGroups.set(record.canonicalId, [record]);
    }
  });

  const duplicateRecordGroups = [...recordGroups.entries()]
    .filter(([, records]) => records.length > 1)
    .map(([canonicalId, records]) => ({
      canonicalId,
      sourceIds: records.map((record) => `${record.sourceCollection}/${record.sourceId}`),
    }));

  const memoConflictGroups = [...recordGroups.entries()]
    .filter(([, records]) => {
      const distinctMemos = new Set(records.map((record) => record.memo).filter(Boolean));
      return distinctMemos.size > 1;
    })
    .map(([canonicalId, records]) => ({
      canonicalId,
      memos: Array.from(new Set(records.map((record) => record.memo).filter(Boolean))),
      sourceIds: records.map((record) => `${record.sourceCollection}/${record.sourceId}`),
    }));

  const canonicalDateRecordWrites = [...recordGroups.entries()]
    .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
    .map(([, records]) => ({
      id: records[0].canonicalId,
      data: mergeRecordGroup(records, classroomNameById),
    }));

  const currentNonCanonicalRecordIds = currentDateRecords
    .filter((record) => record.sourceId !== record.canonicalId)
    .map((record) => record.sourceId)
    .sort();

  const legacyOnlyClassroomIds = legacyClassrooms
    .filter((doc) => !currentClassroomMap.has(doc.id))
    .map((doc) => doc.id)
    .sort();

  return {
    generatedAt: new Date().toISOString(),
    applyRequested: shouldApply,
    summary: {
      currentClassroomCount: currentClassrooms.length,
      legacyClassroomCount: legacyClassrooms.length,
      currentDateRecordCount: currentDateRecords.length,
      legacyDateRecordCount: legacyDateRecords.length,
      legacyOnlyClassroomCount: legacyOnlyClassroomIds.length,
      duplicateDateRecordGroupCount: duplicateRecordGroups.length,
      memoConflictCount: memoConflictGroups.length,
      currentNonCanonicalDateRecordCount: currentNonCanonicalRecordIds.length,
      canonicalClassroomWriteCount: canonicalClassroomWrites.length,
      canonicalDateRecordWriteCount: canonicalDateRecordWrites.length,
    },
    legacyOnlyClassroomIds,
    duplicateDateRecordGroups: duplicateRecordGroups,
    memoConflictGroups,
    currentNonCanonicalDateRecordIds: currentNonCanonicalRecordIds,
    canonicalClassroomWrites,
    canonicalDateRecordWrites,
    legacyClassroomDeleteIds: legacyClassrooms.map((doc) => doc.id).sort(),
    legacyDateRecordDeleteIds: legacyDateRecords.map((record) => record.sourceId).sort(),
  };
};

const verifyCanonicalWrites = async (db, audit) => {
  await Promise.all([
    ...audit.canonicalClassroomWrites.map(async (write) => {
      const snapshot = await db.collection(CLASSROOMS_COLLECTION).doc(write.id).get();
      if (!snapshot.exists) {
        throw new Error(`Canonical classroom '${write.id}' was not written successfully.`);
      }
    }),
    ...audit.canonicalDateRecordWrites.map(async (write) => {
      const snapshot = await db.collection(CLASSROOM_DATE_RECORDS_COLLECTION).doc(write.id).get();
      if (!snapshot.exists) {
        throw new Error(`Canonical classroom date record '${write.id}' was not written successfully.`);
      }
    }),
  ]);
};

const writeAuditFile = (audit) => {
  fs.mkdirSync(path.dirname(auditOutputPath), { recursive: true });
  fs.writeFileSync(auditOutputPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
};

const run = async () => {
  const db = getAdminDb();
  const [
    currentClassroomSnapshot,
    legacyClassroomSnapshot,
    currentDateRecordSnapshot,
    legacyDateRecordSnapshot,
  ] = await Promise.all([
    db.collection(CLASSROOMS_COLLECTION).get(),
    db.collection(LEGACY_CLASSROOMS_COLLECTION).get(),
    db.collection(CLASSROOM_DATE_RECORDS_COLLECTION).get(),
    db.collection(LEGACY_CLASSROOM_DATE_RECORDS_COLLECTION).get(),
  ]);

  const audit = buildAudit({
    currentClassrooms: currentClassroomSnapshot.docs.map((doc) =>
      normalizeClassroomDoc(doc, CLASSROOMS_COLLECTION)
    ),
    legacyClassrooms: legacyClassroomSnapshot.docs.map((doc) =>
      normalizeClassroomDoc(doc, LEGACY_CLASSROOMS_COLLECTION)
    ),
    currentDateRecords: currentDateRecordSnapshot.docs
      .map((doc) => normalizeClassroomDateRecordDoc(doc, CLASSROOM_DATE_RECORDS_COLLECTION))
      .filter(Boolean),
    legacyDateRecords: legacyDateRecordSnapshot.docs
      .map((doc) => normalizeClassroomDateRecordDoc(doc, LEGACY_CLASSROOM_DATE_RECORDS_COLLECTION))
      .filter(Boolean),
  });

  writeAuditFile(audit);

  if (!shouldApply) {
    console.log(`Audit complete. Review ${auditOutputPath} and re-run with --apply to migrate.`);
    return;
  }

  await batchSetDocuments(db, CLASSROOMS_COLLECTION, audit.canonicalClassroomWrites);
  await batchSetDocuments(db, CLASSROOM_DATE_RECORDS_COLLECTION, audit.canonicalDateRecordWrites);
  await verifyCanonicalWrites(db, audit);
  await batchDeleteDocuments(db, LEGACY_CLASSROOMS_COLLECTION, audit.legacyClassroomDeleteIds);
  await batchDeleteDocuments(
    db,
    LEGACY_CLASSROOM_DATE_RECORDS_COLLECTION,
    audit.legacyDateRecordDeleteIds
  );
  await batchDeleteDocuments(
    db,
    CLASSROOM_DATE_RECORDS_COLLECTION,
    audit.currentNonCanonicalDateRecordIds
  );

  console.log(`Migration applied successfully. Audit saved to ${auditOutputPath}.`);
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
