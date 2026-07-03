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

export type StudentPostReviewAction = 'approve' | 'hide' | 'delete';

export const reviewStudentPost = async (id: string, action: StudentPostReviewAction) => {
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

  // 제거: 숨김(보관)과 달리 Drive 파일까지 지워 저장 공간을 되돌리고, 게시물 문서도 완전히 삭제한다.
  if (action === 'delete') {
    const driveFileId = String(post.driveFileId || '');
    if (driveFileId) {
      try {
        await getDriveClient().files.delete({ fileId: driveFileId, supportsAllDrives: true });
      } catch (error) {
        // 이미 지워진 파일(404)이면 게시물 정리만 계속한다. 그 외 실패는 파일이 남아
        // 공간을 계속 차지하므로 에러로 알려 재시도할 수 있게 한다.
        const code = (error as { code?: number })?.code;
        if (code !== 404) {
          throw new AdminApiError(502, 'Drive 파일 삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.');
        }
      }
    }
    await ref.delete();
    return { id, status: 'deleted' as const };
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
    // 같은 출처 렌더 라우트(/api/public/student-work/:fileId)에서 쓰는 Drive 파일 id.
    fileId: post.driveFileId || '',
    approvedAt: post.approvedAt || '',
  }));
};

/**
 * 이 Drive 파일이 '승인(공개)'된 게시물의 것인지 확인. 공개 작품 렌더 라우트의 보안 게이트.
 * (driveFileId 단일 동등 쿼리만 써서 복합 인덱스가 필요 없게 하고, status는 메모리에서 검사한다.)
 */
export const isApprovedStudentWorkFile = async (fileId: string): Promise<boolean> => {
  if (!fileId) return false;
  const snap = await getAdminDb()
    .collection(POSTS_COLLECTION)
    .where('driveFileId', '==', fileId)
    .get();
  return snap.docs.some((doc) => (doc.data() as DocData).status === 'approved');
};
