import { Readable } from 'stream';
import { google } from 'googleapis';
import { getAdminDb } from './firebaseAdmin';

const CLASSROOMS_COLLECTION = 'classrooms';

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
  // 같은 이름 폴더가 이미 있는지 확인
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
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

export interface UploadResult {
  fileId: string;
  fileName: string;
  webViewLink: string;
}

export async function uploadStudentWork(params: {
  classroomId: string;
  studentName: string;
  fileBuffer: Buffer;
  originalName: string;
  mimeType: string;
}): Promise<UploadResult> {
  const { classroomId, studentName, fileBuffer, originalName, mimeType } = params;

  // Firestore에서 classroom의 driveFolderId 조회
  const db = getAdminDb();
  const classroomDoc = await db.collection(CLASSROOMS_COLLECTION).doc(classroomId).get();
  if (!classroomDoc.exists) throw new Error('Classroom not found.');

  const driveFolderId = classroomDoc.data()?.driveFolderId as string | undefined;
  if (!driveFolderId) throw new Error('이 클래스에 Google Drive 폴더가 연결되어 있지 않습니다.');

  const drive = getDriveClient();

  // 날짜 서브폴더 생성 (YYYY-MM-DD)
  const dateStr = new Date().toISOString().slice(0, 10);
  const dateFolderId = await getOrCreateFolder(drive, driveFolderId, dateStr);

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
  });

  return {
    fileId: uploaded.data.id!,
    fileName: uploaded.data.name!,
    webViewLink: uploaded.data.webViewLink!,
  };
}
