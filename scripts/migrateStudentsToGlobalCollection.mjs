import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {
  applicationDefault,
  cert,
  getApps as getAdminApps,
  initializeApp as initializeAdminApp,
} from 'firebase-admin/app';
import { FieldValue, getFirestore as getAdminFirestore } from 'firebase-admin/firestore';

const CLASSROOMS_COLLECTION = 'classrooms';
const STUDENTS_COLLECTION = 'students';
const DEFAULT_REPORT_PATH = path.resolve(process.cwd(), 'scripts', 'student-migration-report.json');
const BATCH_SIZE = 350;

const args = new Set(process.argv.slice(2));
const shouldApply = args.has('--apply');
const outputArg = [...args].find((arg) => arg.startsWith('--output='));
const reportOutputPath = outputArg
  ? path.resolve(process.cwd(), outputArg.slice('--output='.length))
  : DEFAULT_REPORT_PATH;

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

const normalizePrivateKey = (privateKey) => privateKey?.replace(/\\n/g, '\n');

const parseServiceAccountJson = (raw) => {
  if (!raw) return null;

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
  if (jsonConfig) return jsonConfig;

  const clientEmail = process.env[`${prefix}_SERVICE_ACCOUNT_EMAIL`];
  const privateKey = normalizePrivateKey(process.env[`${prefix}_SERVICE_ACCOUNT_PRIVATE_KEY`]);
  const projectId = process.env[`${prefix}_SERVICE_ACCOUNT_PROJECT_ID`];

  if (!clientEmail || !privateKey) return null;

  return { projectId, clientEmail, privateKey };
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

// --- Normalization helpers ---

const normalizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const getOptionalString = (value) => {
  const normalized = normalizeString(value);
  return normalized || undefined;
};

const getStudentInitials = (name) =>
  name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '??';

const normalizeStudentRecord = (value, fallback) => {
  const name = normalizeString(value?.name) || normalizeString(fallback?.name);
  const updatedAt =
    normalizeString(value?.updatedAt) ||
    normalizeString(fallback?.updatedAt) ||
    new Date(0).toISOString();
  const createdAt =
    normalizeString(value?.createdAt) ||
    normalizeString(fallback?.createdAt) ||
    updatedAt;
  const initials =
    normalizeString(value?.initials) ||
    normalizeString(fallback?.initials) ||
    getStudentInitials(name);

  const student = {
    id: normalizeString(value?.id) || normalizeString(fallback?.id),
    ownerUid: normalizeString(value?.ownerUid) || normalizeString(fallback?.ownerUid),
    classroomId: normalizeString(value?.classroomId) || normalizeString(fallback?.classroomId),
    name,
    initials,
    order:
      typeof value?.order === 'number' && Number.isFinite(value.order)
        ? value.order
        : typeof fallback?.order === 'number' && Number.isFinite(fallback.order)
          ? fallback.order
          : 0,
    createdAt,
    updatedAt,
  };

  const age = getOptionalString(value?.age) ?? getOptionalString(fallback?.age);
  const contact = getOptionalString(value?.contact) ?? getOptionalString(fallback?.contact);
  const memo = getOptionalString(value?.memo) ?? getOptionalString(fallback?.memo);
  const inactiveAt = getOptionalString(value?.inactiveAt) ?? getOptionalString(fallback?.inactiveAt);
  const deletedAt = getOptionalString(value?.deletedAt) ?? getOptionalString(fallback?.deletedAt);

  if (age) student.age = age;
  if (contact) student.contact = contact;
  if (memo) student.memo = memo;
  if (inactiveAt) student.inactiveAt = inactiveAt;
  if (deletedAt) student.deletedAt = deletedAt;

  return student;
};

const parseTimestamp = (value) => {
  const normalized = normalizeString(value);
  if (!normalized) return Number.NEGATIVE_INFINITY;
  const timestamp = new Date(normalized).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
};

// --- Core migration logic ---

const readAllData = async (db) => {
  const [classroomSnapshot, studentSnapshot] = await Promise.all([
    db.collection(CLASSROOMS_COLLECTION).get(),
    db.collection(STUDENTS_COLLECTION).get(),
  ]);

  const classrooms = classroomSnapshot.docs.map((doc) => ({
    id: doc.id,
    data: doc.data(),
  }));

  const globalStudents = studentSnapshot.docs.map((doc) => ({
    id: doc.id,
    data: doc.data(),
  }));

  return { classrooms, globalStudents };
};

const extractEmbeddedStudents = (classrooms) => {
  const embeddedStudents = [];

  for (const classroom of classrooms) {
    const { data } = classroom;
    if (!Array.isArray(data.students) || data.students.length === 0) continue;

    for (let index = 0; index < data.students.length; index++) {
      const entry = data.students[index];
      const student = normalizeStudentRecord(entry, {
        classroomId: classroom.id,
        ownerUid: data.ownerUid || '',
        order: index,
        createdAt: data.createdAt,
        updatedAt: data.createdAt,
      });

      if (student.id && student.name) {
        embeddedStudents.push({
          ...student,
          _sourceClassroomId: classroom.id,
          _sourceType: 'embedded',
        });
      }
    }
  }

  return embeddedStudents;
};

const buildMergedStudents = (globalStudents, embeddedStudents) => {
  // Index global students by ID
  const globalById = new Map();
  for (const raw of globalStudents) {
    const student = normalizeStudentRecord({ id: raw.id, ...raw.data });
    if (student.id) {
      globalById.set(student.id, student);
    }
  }

  // Index embedded students by ID
  const embeddedById = new Map();
  for (const student of embeddedStudents) {
    embeddedById.set(student.id, student);
  }

  // Collect all unique IDs
  const allIds = new Set([...globalById.keys(), ...embeddedById.keys()]);
  const mergedStudents = [];
  const mergeActions = [];

  for (const id of allIds) {
    const global = globalById.get(id);
    const embedded = embeddedById.get(id);

    if (global && !embedded) {
      // Global-only: backfill classroomId/order if missing
      const needsBackfill = !global.classroomId || global.order === 0;
      mergedStudents.push(global);
      mergeActions.push({
        id,
        name: global.name,
        action: needsBackfill ? 'global-only-needs-backfill' : 'global-only',
        source: 'global',
      });
      continue;
    }

    if (embedded && !global) {
      // Embedded-only: promote to canonical
      const { _sourceClassroomId, _sourceType, ...studentData } = embedded;
      mergedStudents.push(studentData);
      mergeActions.push({
        id,
        name: embedded.name,
        action: 'promoted-from-embedded',
        source: 'embedded',
        sourceClassroomId: _sourceClassroomId,
      });
      continue;
    }

    // Both exist: merge with global as base, legacy overrides for classroomId/order/inactiveAt
    const merged = { ...global };

    // Prefer embedded classroomId if global is missing
    if (!merged.classroomId && embedded.classroomId) {
      merged.classroomId = embedded.classroomId;
    }

    // Prefer embedded order if it's more specific (non-zero or if global is 0)
    if (embedded.order !== 0 || merged.order === 0) {
      merged.order = embedded.order;
    }

    // Prefer embedded inactiveAt if set and global is not
    if (embedded.inactiveAt && !merged.inactiveAt) {
      merged.inactiveAt = embedded.inactiveAt;
    }

    // Use latest updatedAt
    const globalUpdated = parseTimestamp(global.updatedAt);
    const embeddedUpdated = parseTimestamp(embedded.updatedAt);
    if (embeddedUpdated > globalUpdated) {
      merged.updatedAt = embedded.updatedAt;
    }

    // Use earliest createdAt
    const globalCreated = parseTimestamp(global.createdAt);
    const embeddedCreated = parseTimestamp(embedded.createdAt);
    if (Number.isFinite(embeddedCreated) && embeddedCreated < globalCreated) {
      merged.createdAt = embedded.createdAt;
    }

    mergedStudents.push(merged);
    mergeActions.push({
      id,
      name: merged.name,
      action: 'merged',
      source: 'both',
      classroomId: merged.classroomId,
    });
  }

  return { mergedStudents, mergeActions };
};

const detectDuplicatesByName = (mergedStudents) => {
  // Group students by (classroomId, name) to detect duplicates like 타넬리
  const byClassroomAndName = new Map();

  for (const student of mergedStudents) {
    if (student.deletedAt) continue;
    const key = `${student.classroomId}::${student.name}`;
    const group = byClassroomAndName.get(key);
    if (group) {
      group.push(student);
    } else {
      byClassroomAndName.set(key, [student]);
    }
  }

  const duplicateGroups = [];

  for (const [key, students] of byClassroomAndName) {
    if (students.length <= 1) continue;

    // Sort by updatedAt descending – keep the most recently updated
    students.sort((a, b) => parseTimestamp(b.updatedAt) - parseTimestamp(a.updatedAt));

    const winner = students[0];
    const stale = students.slice(1);

    duplicateGroups.push({
      key,
      name: winner.name,
      classroomId: winner.classroomId,
      winnerId: winner.id,
      staleIds: stale.map((s) => s.id),
    });
  }

  return duplicateGroups;
};

const buildReport = ({ classrooms, globalStudents, embeddedStudents, mergedStudents, mergeActions, duplicateGroups }) => {
  const classroomsWithEmbedded = classrooms.filter(
    (c) => Array.isArray(c.data.students) && c.data.students.length > 0
  );

  return {
    generatedAt: new Date().toISOString(),
    applyRequested: shouldApply,
    database: firebaseConfig.firestoreDatabaseId,
    summary: {
      globalStudentCount: globalStudents.length,
      embeddedStudentCount: embeddedStudents.length,
      classroomsWithEmbeddedStudents: classroomsWithEmbedded.length,
      canonicalStudentCount: mergedStudents.length,
      duplicateGroupCount: duplicateGroups.length,
      softDeletedDuplicateCount: duplicateGroups.reduce((sum, g) => sum + g.staleIds.length, 0),
      studentsWithoutClassroomId: mergedStudents.filter((s) => !s.classroomId).length,
    },
    classroomsWithEmbeddedStudents: classroomsWithEmbedded.map((c) => ({
      classroomId: c.id,
      classroomName: c.data.name,
      embeddedStudentCount: c.data.students.length,
    })),
    mergeActions,
    duplicateGroups,
  };
};

const chunk = (items, size) => {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
};

const applyMigration = async (db, mergedStudents, duplicateGroups, classrooms) => {
  const timestamp = new Date().toISOString();

  // 1. Upsert canonical students
  for (const studentChunk of chunk(mergedStudents, BATCH_SIZE)) {
    const batch = db.batch();
    for (const student of studentChunk) {
      const { id, ...data } = student;
      batch.set(db.collection(STUDENTS_COLLECTION).doc(id), data);
    }
    await batch.commit();
  }
  console.log(`  Upserted ${mergedStudents.length} canonical student documents.`);

  // 2. Soft-delete stale duplicates
  const allStaleIds = duplicateGroups.flatMap((g) => g.staleIds);
  for (const staleChunk of chunk(allStaleIds, BATCH_SIZE)) {
    const batch = db.batch();
    for (const staleId of staleChunk) {
      batch.update(db.collection(STUDENTS_COLLECTION).doc(staleId), {
        deletedAt: timestamp,
        updatedAt: timestamp,
      });
    }
    await batch.commit();
  }
  if (allStaleIds.length > 0) {
    console.log(`  Soft-deleted ${allStaleIds.length} stale duplicate student(s).`);
  }

  // 3. Remove embedded students field from classroom documents
  const classroomsWithEmbedded = classrooms.filter(
    (c) => Array.isArray(c.data.students) && c.data.students.length > 0
  );
  for (const classroomChunk of chunk(classroomsWithEmbedded, BATCH_SIZE)) {
    const batch = db.batch();
    for (const classroom of classroomChunk) {
      batch.update(db.collection(CLASSROOMS_COLLECTION).doc(classroom.id), {
        students: FieldValue.delete(),
      });
    }
    await batch.commit();
  }
  if (classroomsWithEmbedded.length > 0) {
    console.log(`  Removed embedded students field from ${classroomsWithEmbedded.length} classroom document(s).`);
  }
};

const run = async () => {
  const db = getAdminDb();
  console.log(`Reading data from database: ${firebaseConfig.firestoreDatabaseId}`);

  const { classrooms, globalStudents } = await readAllData(db);
  console.log(`  Found ${classrooms.length} classrooms, ${globalStudents.length} global students.`);

  const embeddedStudents = extractEmbeddedStudents(classrooms);
  console.log(`  Extracted ${embeddedStudents.length} embedded students from classroom documents.`);

  const { mergedStudents, mergeActions } = buildMergedStudents(globalStudents, embeddedStudents);
  console.log(`  Merged into ${mergedStudents.length} canonical students.`);

  const duplicateGroups = detectDuplicatesByName(mergedStudents);
  if (duplicateGroups.length > 0) {
    console.log(`  Detected ${duplicateGroups.length} duplicate group(s) by name:`);
    for (const group of duplicateGroups) {
      console.log(`    "${group.name}" in classroom ${group.classroomId}: keep ${group.winnerId}, soft-delete [${group.staleIds.join(', ')}]`);
    }
  }

  const report = buildReport({
    classrooms,
    globalStudents,
    embeddedStudents,
    mergedStudents,
    mergeActions,
    duplicateGroups,
  });

  fs.mkdirSync(path.dirname(reportOutputPath), { recursive: true });
  fs.writeFileSync(reportOutputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`\nReport saved to ${reportOutputPath}`);

  if (!shouldApply) {
    console.log('Dry run complete. Review the report and re-run with --apply to migrate.');
    return;
  }

  console.log('\nApplying migration...');
  await applyMigration(db, mergedStudents, duplicateGroups, classrooms);
  console.log('\nMigration applied successfully.');
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
