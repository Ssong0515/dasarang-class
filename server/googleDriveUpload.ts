import { Readable } from 'stream';
import { google } from 'googleapis';
import { getAdminDb } from './firebaseAdmin';

// 모든 반의 학생 결과물을 저장할 단일 공유 드라이브(Shared Drive). 반별 Drive 연결은 더 이상 쓰지 않는다.
// 서비스 계정은 일반 '내 드라이브'엔 못 쓰므로(용량 0) 반드시 공유 드라이브여야 하고,
// 그 공유 드라이브에 서비스 계정이 멤버(콘텐츠 관리자)로 추가돼 있어야 한다.
// 배포 환경에서 STUDENT_WORK_DRIVE_FOLDER_ID 환경변수로 덮어쓸 수 있다.
const SHARED_STUDENT_WORK_FOLDER_ID =
  process.env.STUDENT_WORK_DRIVE_FOLDER_ID || '0AHL-LinZZ7XbUk9PVA';

export function getDriveClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set.');

  const parsed = JSON.parse(raw) as {
    client_email: string;
    private_key: string;
    project_id?: string;
  };

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: parsed.client_email,
      private_key: parsed.private_key.replace(/\\n/g, '\n'),
      project_id: parsed.project_id,
    },
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  return google.drive({ version: 'v3', auth });
}

export async function getOrCreateFolder(
  drive: ReturnType<typeof google.drive>,
  parentId: string,
  folderName: string
): Promise<string> {
  // 같은 이름 폴더가 이미 있는지 확인. 중복이 있으면 가장 먼저 생성된 것으로 통일한다(자가 치유).
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id,createdTime)',
    orderBy: 'createdTime',
    spaces: 'drive',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id!;
  }

  // 없으면 생성
  const folder = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
    supportsAllDrives: true,
  });

  return folder.data.id!;
}

// 날짜 폴더 ID를 하루 1개로 확정해 두는 매핑 컬렉션. key=`${parentId}__${date}`.
const DATE_FOLDER_MAP_COLLECTION = 'driveDateFolders';

/**
 * 학생 결과물 날짜 폴더(YYYY-MM-DD)를 '하루 1개'로 보장한다.
 *
 * 여러 학생이 같은 순간에 업로드하면 "목록 조회 → 없으면 생성"이 원자적이지 않아
 * 같은 이름의 날짜 폴더가 여러 개 생기고 파일이 흩어진다(실제 2026-06-29에 5개 발생).
 * 이를 막기 위해 Firestore(driveDateFolders/{parent__date})에 폴더 ID를 트랜잭션으로 단 한 번만
 * 확정하고, 이후에는 그 ID를 재사용한다. 경쟁에서 진 인스턴스는 방금 만든 빈 폴더를 지운다.
 */
export async function getOrCreateStudentWorkDateFolder(
  drive: ReturnType<typeof google.drive>,
  parentId: string,
  date: string
): Promise<string> {
  const db = getAdminDb();
  const ref = db.collection(DATE_FOLDER_MAP_COLLECTION).doc(`${parentId}__${date}`);

  // 1) 이미 확정된 매핑이 있으면 그대로 사용 (가장 빠른 경로)
  const cached = await ref.get();
  const cachedId = cached.exists ? (cached.data()?.folderId as string | undefined) : undefined;
  if (cachedId) return cachedId;

  // 2) 드라이브에 이미 폴더가 있으면(과거 중복 포함) 가장 먼저 생성된 것을 정본으로 채택·기록
  const listed = await drive.files.list({
    q: `'${parentId}' in parents and name='${date}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id,createdTime)',
    orderBy: 'createdTime',
    spaces: 'drive',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const existingId = listed.data.files?.[0]?.id;
  if (existingId) {
    await ref.set(
      { folderId: existingId, parentId, date, updatedAt: new Date().toISOString() },
      { merge: true }
    );
    return existingId;
  }

  // 3) 없으면 생성하되, 트랜잭션으로 단 하나만 확정. 경쟁에서 지면 방금 만든 중복 폴더를 삭제한다.
  const created = await drive.files.create({
    requestBody: {
      name: date,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
    supportsAllDrives: true,
  });
  const createdId = created.data.id!;

  const winnerId = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const already = snap.exists ? (snap.data()?.folderId as string | undefined) : undefined;
    if (already) return already;
    tx.set(
      ref,
      { folderId: createdId, parentId, date, updatedAt: new Date().toISOString() },
      { merge: true }
    );
    return createdId;
  });

  if (winnerId !== createdId) {
    await drive.files
      .delete({ fileId: createdId, supportsAllDrives: true })
      .catch(() => {
        /* 중복 폴더 삭제 실패는 무시 (다음 정리 스크립트가 흡수) */
      });
  }
  return winnerId;
}

export interface UploadResult {
  fileId: string;
  fileName: string;
  webViewLink: string;
}

/**
 * 관리자(강사) 전용: 학생 결과물 Drive 파일을 스트리밍으로 가져온다.
 * 파일을 외부 공개(anyone reader)로 전환하지 않고 서버가 서비스 계정으로 대신 읽어 전달한다.
 * 수업 중 결과물 갤러리에서 비공개 파일을 강사에게만 보여주기 위함.
 */
export async function getStudentWorkFile(fileId: string): Promise<{
  mimeType: string;
  fileName: string;
  stream: Readable;
}> {
  const drive = getDriveClient();

  const meta = await drive.files.get({
    fileId,
    fields: 'mimeType,name',
    supportsAllDrives: true,
  });

  const media = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' }
  );

  return {
    mimeType: (meta.data.mimeType as string) || 'application/octet-stream',
    fileName: (meta.data.name as string) || 'file',
    stream: media.data as unknown as Readable,
  };
}

export async function uploadStudentWork(params: {
  studentName: string;
  fileBuffer: Buffer;
  originalName: string;
  mimeType: string;
}): Promise<UploadResult> {
  const { studentName, fileBuffer, originalName, mimeType } = params;

  const drive = getDriveClient();

  // 모든 반의 결과물을 공유 폴더에 저장한다(반별 Drive 연결 없음). 날짜 서브폴더(YYYY-MM-DD)로만 정리.
  // 같은 날 동시 업로드 시 날짜 폴더가 중복 생성되지 않도록 '하루 1개' 보장 헬퍼를 쓴다.
  const dateStr = new Date().toISOString().slice(0, 10);
  const dateFolderId = await getOrCreateStudentWorkDateFolder(
    drive,
    SHARED_STUDENT_WORK_FOLDER_ID,
    dateStr
  );

  // 파일명: 학생이름_원본파일명
  const ext = originalName.includes('.') ? originalName.slice(originalName.lastIndexOf('.')) : '';
  const baseName = originalName.includes('.')
    ? originalName.slice(0, originalName.lastIndexOf('.'))
    : originalName;
  const uploadFileName = `${studentName}_${baseName}${ext}`;

  // 업로드
  const stream = Readable.from(fileBuffer);
  const uploaded = await drive.files.create({
    requestBody: {
      name: uploadFileName,
      parents: [dateFolderId],
    },
    media: {
      mimeType,
      body: stream,
    },
    fields: 'id,name,webViewLink',
    supportsAllDrives: true,
  });

  return {
    fileId: uploaded.data.id!,
    fileName: uploaded.data.name!,
    webViewLink: uploaded.data.webViewLink!,
  };
}
