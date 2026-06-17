import crypto from 'crypto';
import type express from 'express';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { ADMIN_EMAIL, getFirebaseAdminApp } from '../firebaseAdmin';

const timingSafeEquals = (a: string, b: string) => {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufferA, bufferB);
};

const getConfiguredApiKeys = () =>
  [process.env.ADMIN_API_KEY, process.env.MCP_API_KEY]
    .map((key) => key?.trim() || '')
    .filter(Boolean);

export const isValidApiKey = (provided: string) => {
  const keys = getConfiguredApiKeys();
  if (keys.length === 0) {
    // 키 미설정 배포는 인증 자체를 거부 (fail-closed)
    return false;
  }
  return keys.some((key) => timingSafeEquals(provided, key));
};

export const extractBearerToken = (authorizationHeader?: string) => {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    return '';
  }
  return authorizationHeader.slice('Bearer '.length).trim();
};

export const requireApiKey: express.RequestHandler = (req, res, next) => {
  const provided = extractBearerToken(req.headers.authorization);
  if (!provided || !isValidApiKey(provided)) {
    res.status(401).json({ error: 'API 키 인증에 실패했습니다. Authorization: Bearer <ADMIN_API_KEY> 헤더가 필요합니다.' });
    return;
  }
  next();
};

let cachedAdminUid: string | null = null;

export const resolveAdminUid = async (): Promise<string> => {
  if (cachedAdminUid) {
    return cachedAdminUid;
  }

  const envUid = process.env.ADMIN_UID?.trim();
  if (envUid) {
    cachedAdminUid = envUid;
    return cachedAdminUid;
  }

  if (process.env.NODE_ENV !== 'production') {
    cachedAdminUid = 'dev-admin';
    return cachedAdminUid;
  }

  const user = await getAdminAuth(getFirebaseAdminApp()).getUserByEmail(ADMIN_EMAIL);
  cachedAdminUid = user.uid;
  return cachedAdminUid;
};
