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
const BATCH_SIZE = 400;

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

const deleteWithAdminSdk = async () => {
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
  const snapshot = await adminDb.collection('lessons').get();

  for (const lessonChunk of chunk(snapshot.docs, BATCH_SIZE)) {
    const batch = adminDb.batch();
    lessonChunk.forEach((lessonDoc) => {
      batch.delete(lessonDoc.ref);
    });
    await batch.commit();
  }

  return {
    deletedLessons: snapshot.size,
    mode: 'admin-sdk',
  };
};

const deleteWithAdminLogin = async () => {
  const rawPassword = process.env.ADMIN_PASSWORD;
  if (!rawPassword) {
    throw new Error(
      'No Firebase Admin credentials were found. Set ADMIN_PASSWORD or FIREBASE_SERVICE_ACCOUNT_JSON.'
    );
  }

  const finalPassword = rawPassword.length < 6 ? rawPassword.padEnd(6, '0') : rawPassword;
  const clientApp = initializeClientApp(firebaseConfig, `delete-legacy-lessons-${Date.now()}`);
  const auth = getAuth(clientApp);
  await signInWithEmailAndPassword(auth, ADMIN_EMAIL, finalPassword);

  const clientDb = getClientFirestore(clientApp, firebaseConfig.firestoreDatabaseId);
  const snapshot = await clientGetDocs(clientCollection(clientDb, 'lessons'));

  for (const lessonChunk of chunk(snapshot.docs, BATCH_SIZE)) {
    const batch = createClientBatch(clientDb);
    lessonChunk.forEach((lessonDoc) => {
      batch.delete(clientDoc(clientDb, 'lessons', lessonDoc.id));
    });
    await batch.commit();
  }

  await signOut(auth).catch(() => {});
  await deleteApp(clientApp).catch(() => {});

  return {
    deletedLessons: snapshot.size,
    mode: 'admin-login',
  };
};

try {
  const result = getFirebaseServiceAccount()
    ? await deleteWithAdminSdk()
    : await deleteWithAdminLogin();

  console.log(JSON.stringify(result, null, 2));
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
