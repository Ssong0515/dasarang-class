import { getAdminDb } from '../firebaseAdmin';
import { getDriveClient, type UploadResult } from '../googleDriveUpload';
import { resolveAdminUid } from './auth';
import { AdminApiError } from './resources';

const POSTS_COLLECTION = 'studentPosts';

type DocData = Record<string, unknown>;

const nowIso = () => new Date().toISOString();

export interface CreatePostFromUploadInput {
  classroomId: string;
  studentName: string;
  title?: string;
  description?: string;
  anonymous?: boolean;
  mimeType: string;
  upload: UploadResult;
}

/** 학생 업로드 직후 호출 — pending 상태 게시물 자동 생성 */
export const createPostFromUpload = async (input: CreatePostFromUploadInput) => {
  const db = getAdminDb();
  const ownerUid = await resolveAdminUid();

  const classroomDoc = await db.collection('classrooms').doc(input.classroomId).get();
  const classroomName = (classroomDoc.data()?.name as string) || '';

  const ref = db.collection(POSTS_COLLECTION).doc();
  const data = {
    ownerUid,
    title: input.title?.trim() || input.upload.fileName,
    description: input.description?.trim() || '',
    studentName: input.studentName,
    anonymous: Boolean(input.anonymous),
    classroomId: input.classroomId,
    classroomName,
    driveFileId: input.upload.fileId,
    fileName: input.upload.fileName,
    mimeType: input.mimeType,
    webViewLink: input.upload.webViewLink,
    status: 'pending' as const,
    createdAt: nowIso(),
  };
  await ref.set(data);
  return { id: ref.id, ...data };
};

const THUMBNAIL_MIME_PREFIXES = ['image/', 'application/pdf'];

const supportsThumbnail = (mimeType: string) =>
  THUMBNAIL_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix));

export const reviewStudentPost = async (id: string, action: 'approve' | 'hide') => {
  const db = getAdminDb();
  const ref = db.collection(POSTS_COLLECTION).doc(id);
  const doc = await ref.get();
  if (!doc.exists) {
    throw new AdminApiError(404, `게시물 '${id}'을(를) 찾을 수 없습니다.`);
  }
  const post = doc.data() as DocData;

  if (action === 'hide') {
    await ref.set({ status: 'hidden' }, { merge: true });
    return { id, status: 'hidden' as const };
  }

  // 승인: Drive 파일을 링크 공개로 전환하고 썸네일 URL 저장
  const driveFileId = post.driveFileId as string;
  if (!driveFileId) {
    throw new AdminApiError(400, '게시물에 driveFileId가 없습니다.');
  }

  const drive = getDriveClient();
  await drive.permissions.create({
    fileId: driveFileId,
    requestBody: { role: 'reader', type: 'anyone' },
    supportsAllDrives: true,
  });

  const updates: DocData = {
    status: 'approved',
    approvedAt: nowIso(),
  };
  if (supportsThumbnail(String(post.mimeType || ''))) {
    updates.imageUrl = `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w1200`;
  }

  await ref.set(updates, { merge: true });
  return { id, status: 'approved' as const, imageUrl: (updates.imageUrl as string) || null };
};

/** damuna.org 쇼케이스용 공개 목록 (승인된 게시물만, 민감 정보 제외) */
export const listPublicStudentPosts = async () => {
  const snap = await getAdminDb().collection(POSTS_COLLECTION).get();

  const posts = snap.docs
    .map((doc): DocData & { id: string } => ({ ...(doc.data() as DocData), id: doc.id }))
    .filter((post) => post.status === 'approved');

  posts.sort((a, b) => {
    const orderDiff = (Number(a.order) || 0) - (Number(b.order) || 0);
    if (orderDiff !== 0) return orderDiff;
    return String(b.approvedAt || '').localeCompare(String(a.approvedAt || ''));
  });

  return posts.map((post) => ({
    id: post.id,
    title: post.title,
    description: post.description || '',
    studentName: post.anonymous ? '익명' : post.studentName,
    classroomName: post.classroomName || '',
    mimeType: post.mimeType || '',
    imageUrl: post.imageUrl || null,
    webViewLink: post.webViewLink || '',
    approvedAt: post.approvedAt || '',
  }));
};
