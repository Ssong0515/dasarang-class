import { Readable } from 'stream';
import { google } from 'googleapis';

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
  const dateStr = new Date().toISOString().slice(0, 10);
  const dateFolderId = await getOrCreateFolder(drive, SHARED_STUDENT_WORK_FOLDER_ID, dateStr);

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
