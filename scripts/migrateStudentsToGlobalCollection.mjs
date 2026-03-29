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
  getDocs as clientGetDocs,
  getFirestore as getClientFirestore,
  writeBatch as createClientBatch,
} from 'firebase/firestore';

const ADMIN_EMAIL = 'songes0515@gmail.com';
const BATCH_SIZE = 350;

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

const getStudentInitials = (name) =>
  name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '??';

const nowIso = () => new Date().toISOString();

const normalizeStudent = (student, folder, index) => {
  const name = getTrimmedString(student?.name);
  const updatedAt =
    getTrimmedString(student?.updatedAt) ||
    getTrimmedString(folder?.createdAt) ||
    nowIso();
  const createdAt =
    getTrimmedString(student?.createdAt) ||
    getTrimmedString(folder?.createdAt) ||
    updatedAt;
  const nextStudent = {
    id: getTrimmedString(student?.id) || `legacy-${folder.id}-${index}`,
    ownerUid: getTrimmedString(student?.ownerUid) || getTrimmedString(folder?.ownerUid),
    folderId: folder.id,
    name,
    initials:
      getTrimmedString(student?.initials) ||
      getStudentInitials(name),
    order: Number.isFinite(student?.order) ? student.order : index,
    createdAt,
    updatedAt,
  };

  const age = getOptionalTrimmedString(student?.age);
  const contact = getOptionalTrimmedString(student?.contact);
  const memo = getOptionalTrimmedString(student?.memo);
  const inactiveAt = getOptionalTrimmedString(student?.inactiveAt);
  const deletedAt = getOptionalTrimmedString(student?.deletedAt);

  if (age) {
    nextStudent.age = age;
  }

  if (contact) {
    nextStudent.contact = contact;
  }

  if (memo) {
    nextStudent.memo = memo;
  }

  if (inactiveAt) {
    nextStudent.inactiveAt = inactiveAt;
  }

  if (deletedAt) {
    nextStudent.deletedAt = deletedAt;
  }

  return nextStudent;
};

const normalizeAttendance = (attendance) =>
  Array.isArray(attendance)
    ? attendance
        .map((entry) => {
          const studentId = getTrimmedString(entry?.studentId);
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
        })
        .filter(Boolean)
    : [];

const collectMigrationData = (folders, records) => {
  const studentWrites = [];
  const attendanceWrites = [];

  folders.forEach((folderDoc) => {
    const folder = {
      id: folderDoc.id,
      ...folderDoc.data(),
    };
    const legacyStudents = Array.isArray(folder.students) ? folder.students : [];

    legacyStudents.forEach((student, index) => {
      studentWrites.push({
        id: normalizeStudent(student, folder, index).id,
        data: normalizeStudent(student, folder, index),
      });
    });
  });

  records.forEach((recordDoc) => {
    const data = recordDoc.data();
    const normalizedAttendance = normalizeAttendance(data.attendance);
    const currentAttendance = Array.isArray(data.attendance) ? data.attendance : [];

    if (JSON.stringify(normalizedAttendance) !== JSON.stringify(currentAttendance)) {
      attendanceWrites.push({
        id: recordDoc.id,
        data: {
          attendance: normalizedAttendance,
          updatedAt: getTrimmedString(data.updatedAt) || nowIso(),
        },
      });
    }
  });

  return {
    studentWrites,
    attendanceWrites,
  };
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
  const folderSnapshot = await adminDb.collection('folders').get();
  const recordSnapshot = await adminDb.collection('folderDateRecords').get();
  const { studentWrites, attendanceWrites } = collectMigrationData(
    folderSnapshot.docs,
    recordSnapshot.docs
  );

  for (const studentChunk of chunk(studentWrites, BATCH_SIZE)) {
    const batch = adminDb.batch();
    studentChunk.forEach((studentWrite) => {
      batch.set(
        adminDb.collection('students').doc(studentWrite.id),
        studentWrite.data,
        { merge: true }
      );
    });
    await batch.commit();
  }

  for (const recordChunk of chunk(attendanceWrites, BATCH_SIZE)) {
    const batch = adminDb.batch();
    recordChunk.forEach((recordWrite) => {
      batch.set(
        adminDb.collection('folderDateRecords').doc(recordWrite.id),
        recordWrite.data,
        { merge: true }
      );
    });
    await batch.commit();
  }

  return {
    mode: 'admin-sdk',
    totalFolders: folderSnapshot.size,
    totalDateRecords: recordSnapshot.size,
    migratedStudents: studentWrites.length,
    updatedAttendanceRecords: attendanceWrites.length,
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
  const clientApp = initializeClientApp(firebaseConfig, `migrate-global-students-${Date.now()}`);
  const auth = getAuth(clientApp);
  await signInWithEmailAndPassword(auth, ADMIN_EMAIL, finalPassword);

  const clientDb = getClientFirestore(clientApp, firebaseConfig.firestoreDatabaseId);
  const folderSnapshot = await clientGetDocs(clientCollection(clientDb, 'folders'));
  const recordSnapshot = await clientGetDocs(clientCollection(clientDb, 'folderDateRecords'));
  const { studentWrites, attendanceWrites } = collectMigrationData(
    folderSnapshot.docs,
    recordSnapshot.docs
  );

  for (const studentChunk of chunk(studentWrites, BATCH_SIZE)) {
    const batch = createClientBatch(clientDb);
    studentChunk.forEach((studentWrite) => {
      batch.set(
        clientDoc(clientDb, 'students', studentWrite.id),
        studentWrite.data,
        { merge: true }
      );
    });
    await batch.commit();
  }

  for (const recordChunk of chunk(attendanceWrites, BATCH_SIZE)) {
    const batch = createClientBatch(clientDb);
    recordChunk.forEach((recordWrite) => {
      batch.set(
        clientDoc(clientDb, 'folderDateRecords', recordWrite.id),
        recordWrite.data,
        { merge: true }
      );
    });
    await batch.commit();
  }

  await signOut(auth).catch(() => {});
  await deleteApp(clientApp).catch(() => {});

  return {
    mode: 'admin-login',
    totalFolders: folderSnapshot.size,
    totalDateRecords: recordSnapshot.size,
    migratedStudents: studentWrites.length,
    updatedAttendanceRecords: attendanceWrites.length,
  };
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
