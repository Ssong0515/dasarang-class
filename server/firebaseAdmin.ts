import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getAuth as getAdminAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-applet-config.json';

export const ADMIN_EMAIL = 'songes0515@gmail.com';
const FALLBACK_ADMIN_EMAILS = [ADMIN_EMAIL, 'damunacenter@gmail.com'];
const STUDENT_ACCESS_COLLECTION = 'studentAccess';

export const normalizeEmail = (email?: string | null) => email?.trim().toLowerCase() || '';

const getConfiguredAdminEmails = () => {
  const raw = process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || '';
  const envEmails = raw
    .split(',')
    .map(normalizeEmail)
    .filter(Boolean);

  return new Set([...FALLBACK_ADMIN_EMAILS.map(normalizeEmail), ...envEmails]);
};

interface ServiceAccountConfig {
  projectId?: string;
  clientEmail: string;
  privateKey: string;
}

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

const getFirebaseServiceAccount = () =>
  getServiceAccountFromEnv('FIREBASE') || getServiceAccountFromEnv('GOOGLE');

export const getFirebaseAdminApp = () => {
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

export const getAdminDb = () =>
  getFirestore(getFirebaseAdminApp(), firebaseConfig.firestoreDatabaseId);

/** calendar.damuna.org가 쓰는 같은 프로젝트의 (default) Firestore 데이터베이스 */
export const getCalendarDb = () => getFirestore(getFirebaseAdminApp());

const isAdminToken = async (decodedToken: DecodedIdToken, email: string) => {
  if (getConfiguredAdminEmails().has(email)) {
    return true;
  }

  const db = getAdminDb();
  const [adminDoc, userDoc] = await Promise.all([
    db.collection('admins').doc(email).get(),
    db.collection('users').doc(decodedToken.uid).get(),
  ]);

  return adminDoc.exists || userDoc.data()?.role === 'admin';
};

export const verifyAdminIdToken = async (idToken: string): Promise<DecodedIdToken> => {
  const decodedToken = await getAdminAuth(getFirebaseAdminApp()).verifyIdToken(idToken);

  if (decodedToken.uid === 'dev-admin') {
    return decodedToken;
  }

  const email = normalizeEmail(decodedToken.email);

  if (!email || !(await isAdminToken(decodedToken, email))) {
    throw new Error('관리자 권한이 필요합니다.');
  }

  return decodedToken;
};

export const verifyStudentOrAdminIdToken = async (
  idToken: string
): Promise<DecodedIdToken> => {
  const decodedToken = await getAdminAuth(getFirebaseAdminApp()).verifyIdToken(idToken);

  if (decodedToken.uid === 'dev-admin') {
    return decodedToken;
  }

  const email = normalizeEmail(decodedToken.email);

  if (!email) {
    throw new Error('로그인이 필요합니다.');
  }

  if (await isAdminToken(decodedToken, email)) {
    return decodedToken;
  }

  const studentAccessDoc = await getAdminDb()
    .collection(STUDENT_ACCESS_COLLECTION)
    .doc(email)
    .get();

  if (!studentAccessDoc.exists) {
    throw new Error('학생 페이지 접근 권한이 없습니다.');
  }

  return decodedToken;
};
