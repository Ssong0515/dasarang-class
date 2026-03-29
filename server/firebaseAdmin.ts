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

export const verifyAdminIdToken = async (idToken: string): Promise<DecodedIdToken> => {
  const decodedToken = await getAdminAuth(getFirebaseAdminApp()).verifyIdToken(idToken);

  if (decodedToken.email !== ADMIN_EMAIL) {
    throw new Error('관리자 권한이 필요합니다.');
  }

  return decodedToken;
};
