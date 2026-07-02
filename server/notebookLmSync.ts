import { Readable } from 'stream';
import { google } from 'googleapis';
import { getAdminDb } from './firebaseAdmin';
import { getDriveClient, getOrCreateFolder } from './googleDriveUpload';

const CONTENTS_COLLECTION = 'contents';
const CONVERTED_FOLDER_NAME = 'Converted Google Slides';
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const GOOGLE_SLIDES_MIME = 'application/vnd.google-apps.presentation';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const SYNC_PROVIDER = 'notebooklm-drive-folder';

type DriveClient = ReturnType<typeof getDriveClient>;

export type NotebookLmSyncItemStatus = 'created' | 'updated' | 'skipped' | 'failed';

export interface NotebookLmSyncItem {
  fileId: string;
  fileName: string;
  status: NotebookLmSyncItemStatus;
  contentId?: string;
  slideUrl?: string;
  message?: string;
}

export interface NotebookLmSyncResult {
  folder: {
    id: string;
    name: string;
  };
  summary: {
    scanned: number;
    created: number;
    updated: number;
    skipped: number;
    failed: number;
  };
  items: NotebookLmSyncItem[];
}

interface SyncNotebookLmPptxFolderParams {
  folderId: string;
  ownerUid: string;
  driveAccessToken: string;
}

interface SourceDriveFile {
  id: string;
  name: string;
  mimeType?: string;
  modifiedTime?: string;
}

interface ExistingContent {
  id: string;
  convertedDriveFileId?: string;
  sourceModifiedTime?: string;
  slideUrl?: string;
}

export const validateNotebookLmSyncPayload = (body: unknown): { folderId: string; driveAccessToken: string } => {
  const payload = body as { folderId?: unknown; driveAccessToken?: unknown };
  const folderId = typeof payload?.folderId === 'string' ? payload.folderId.trim() : '';
  const driveAccessToken =
    typeof payload?.driveAccessToken === 'string' ? payload.driveAccessToken.trim() : '';

  if (!folderId) {
    throw new Error('folderId is required.');
  }

  if (!driveAccessToken) {
    throw new Error('driveAccessToken is required.');
  }

  return { folderId, driveAccessToken };
};

const getDriveClientFromAccessToken = (accessToken: string) => {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.drive({ version: 'v3', auth });
};

const isGoogleApiErrorStatus = (error: unknown, statusCode: number) => {
  const maybeError = error as { code?: unknown; response?: { status?: unknown } };
  return maybeError.code === statusCode || maybeError.response?.status === statusCode;
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unknown error';

const toPresentationTitle = (name: string) =>
  name.replace(/\.pptx$/i, '').trim() || name.trim() || 'NotebookLM slide deck';

const toConvertedName = (name: string) => `${toPresentationTitle(name)} (Google Slides)`;

const toSlideEmbedUrl = (presentationId: string) =>
  `https://docs.google.com/presentation/d/${presentationId}/embed`;

const isPptxFile = (file: SourceDriveFile) =>
  file.mimeType === PPTX_MIME || /\.pptx$/i.test(file.name);

const getReadableMedia = async (drive: DriveClient, fileId: string): Promise<Readable> => {
  const response = await drive.files.get(
    {
      fileId,
      alt: 'media',
      supportsAllDrives: true,
    },
    { responseType: 'stream' }
  );

  return response.data as Readable;
};

const assertUsableFolder = async (drive: DriveClient, folderId: string) => {
  const response = await drive.files.get({
    fileId: folderId,
    fields: 'id,name,mimeType,capabilities(canAddChildren)',
    supportsAllDrives: true,
  });
  const folder = response.data;

  if (folder.mimeType !== FOLDER_MIME) {
    throw new Error('Selected Drive item is not a folder.');
  }

  if (folder.capabilities?.canAddChildren === false) {
    throw new Error(
      'The service account needs Editor access to this Drive folder so it can create converted Google Slides.'
    );
  }

  return {
    id: folder.id || folderId,
    name: folder.name || 'Selected Drive folder',
  };
};

const listTopLevelFiles = async (drive: DriveClient, folderId: string): Promise<SourceDriveFile[]> => {
  const files: SourceDriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'nextPageToken,files(id,name,mimeType,modifiedTime)',
      spaces: 'drive',
      pageSize: 100,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    files.push(
      ...(response.data.files || [])
        .filter((file): file is SourceDriveFile => Boolean(file.id && file.name))
        .map((file) => ({
          id: file.id!,
          name: file.name!,
          mimeType: file.mimeType || undefined,
          modifiedTime: file.modifiedTime || undefined,
        }))
    );
    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);

  return files;
};

const findExistingContent = async (sourceDriveFileId: string): Promise<ExistingContent | null> => {
  const db = getAdminDb();
  const snapshot = await db
    .collection(CONTENTS_COLLECTION)
    .where('sourceDriveFileId', '==', sourceDriveFileId)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const contentDoc = snapshot.docs[0];
  const data = contentDoc.data() as Partial<ExistingContent>;

  return {
    id: contentDoc.id,
    convertedDriveFileId: data.convertedDriveFileId,
    sourceModifiedTime: data.sourceModifiedTime,
    slideUrl: data.slideUrl,
  };
};

const getNextUncategorizedOrder = async () => {
  const snapshot = await getAdminDb()
    .collection(CONTENTS_COLLECTION)
    .where('categoryId', '==', null)
    .get();

  let maxOrder = -1;
  snapshot.docs.forEach((contentDoc) => {
    const order = contentDoc.data().order;
    if (typeof order === 'number' && Number.isFinite(order)) {
      maxOrder = Math.max(maxOrder, order);
    }
  });

  return maxOrder + 1;
};

const createConvertedPresentation = async (
  drive: DriveClient,
  sourceFile: SourceDriveFile,
  convertedFolderId: string
) => {
  const media = await getReadableMedia(drive, sourceFile.id);
  const response = await drive.files.create({
    requestBody: {
      name: toConvertedName(sourceFile.name),
      mimeType: GOOGLE_SLIDES_MIME,
      parents: [convertedFolderId],
    },
    media: {
      mimeType: PPTX_MIME,
      body: media,
    },
    fields: 'id,name,webViewLink',
    supportsAllDrives: true,
  });

  if (!response.data.id) {
    throw new Error('Drive did not return a converted presentation id.');
  }

  return {
    id: response.data.id,
    slideUrl: toSlideEmbedUrl(response.data.id),
  };
};

const trashDriveFileIfPossible = async (drive: DriveClient, fileId?: string) => {
  if (!fileId) return;

  try {
    await drive.files.update({
      fileId,
      requestBody: { trashed: true },
      fields: 'id',
      supportsAllDrives: true,
    });
  } catch (error) {
    if (!isGoogleApiErrorStatus(error, 404)) {
      console.warn(`Failed to trash old converted presentation ${fileId}: ${getErrorMessage(error)}`);
    }
  }
};

const trashSourcePptx = async (drive: DriveClient, sourceFile: SourceDriveFile) => {
  try {
    await drive.files.update({
      fileId: sourceFile.id,
      requestBody: { trashed: true },
      fields: 'id',
      supportsAllDrives: true,
    });
  } catch (error) {
    if (!isGoogleApiErrorStatus(error, 404)) {
      throw new Error(`Converted, but failed to move the source PPTX to trash: ${getErrorMessage(error)}`);
    }
  }
};

const syncPptxFile = async (
  drive: DriveClient,
  sourceFile: SourceDriveFile,
  convertedFolderId: string,
  ownerUid: string,
  nextOrder: () => Promise<number>
): Promise<NotebookLmSyncItem> => {
  const db = getAdminDb();
  const syncedAt = new Date().toISOString();
  const existingContent = await findExistingContent(sourceFile.id);
  const canReuseConvertedPresentation =
    Boolean(existingContent?.convertedDriveFileId) &&
    existingContent?.sourceModifiedTime === sourceFile.modifiedTime &&
    Boolean(existingContent?.slideUrl);

  if (existingContent && canReuseConvertedPresentation) {
    await db.collection(CONTENTS_COLLECTION).doc(existingContent.id).set(
      {
        syncedAt,
        syncProvider: SYNC_PROVIDER,
      },
      { merge: true }
    );
    await trashSourcePptx(drive, sourceFile);

    return {
      fileId: sourceFile.id,
      fileName: sourceFile.name,
      status: 'updated',
      contentId: existingContent.id,
      slideUrl: existingContent.slideUrl,
      message: 'Already converted; source PPTX moved to trash.',
    };
  }

  const converted = await createConvertedPresentation(drive, sourceFile, convertedFolderId);

  const syncData = {
    sourceDriveFileId: sourceFile.id,
    convertedDriveFileId: converted.id,
    sourceModifiedTime: sourceFile.modifiedTime ?? '',
    slideUrl: converted.slideUrl,
    syncedAt,
    syncProvider: SYNC_PROVIDER,
  };

  if (existingContent) {
    const updateData: Record<string, unknown> = { ...syncData };
    await db.collection(CONTENTS_COLLECTION).doc(existingContent.id).set(updateData, { merge: true });
    await trashDriveFileIfPossible(drive, existingContent.convertedDriveFileId);
    await trashSourcePptx(drive, sourceFile);

    return {
      fileId: sourceFile.id,
      fileName: sourceFile.name,
      status: 'updated',
      contentId: existingContent.id,
      slideUrl: converted.slideUrl,
      message: 'Source PPTX moved to trash.',
    };
  }

  const contentRef = db.collection(CONTENTS_COLLECTION).doc();
  await contentRef.set({
    id: contentRef.id,
    categoryId: null,
    ownerUid,
    title: toPresentationTitle(sourceFile.name),
    description: '',
    html: '',
    createdAt: syncedAt,
    order: await nextOrder(),
    ...syncData,
  });
  await trashSourcePptx(drive, sourceFile);

  return {
    fileId: sourceFile.id,
    fileName: sourceFile.name,
    status: 'created',
    contentId: contentRef.id,
    slideUrl: converted.slideUrl,
    message: 'Source PPTX moved to trash.',
  };
};

export const syncNotebookLmPptxFolder = async ({
  folderId,
  ownerUid,
  driveAccessToken,
}: SyncNotebookLmPptxFolderParams): Promise<NotebookLmSyncResult> => {
  const drive = getDriveClientFromAccessToken(driveAccessToken);
  const folder = await assertUsableFolder(drive, folderId);
  const convertedFolderId = await getOrCreateFolder(drive, folderId, CONVERTED_FOLDER_NAME);
  const files = await listTopLevelFiles(drive, folderId);
  let nextOrderValue: number | null = null;
  const getNextOrder = async () => {
    if (nextOrderValue === null) {
      nextOrderValue = await getNextUncategorizedOrder();
    }
    const order = nextOrderValue;
    nextOrderValue += 1;
    return order;
  };

  const items: NotebookLmSyncItem[] = [];

  for (const file of files) {
    if (file.mimeType === FOLDER_MIME) {
      continue;
    }

    if (file.mimeType === GOOGLE_SLIDES_MIME) {
      continue;
    }

    if (!isPptxFile(file)) {
      items.push({
        fileId: file.id,
        fileName: file.name,
        status: 'skipped',
        message: 'Only PPTX files are supported.',
      });
      continue;
    }

    try {
      items.push(await syncPptxFile(drive, file, convertedFolderId, ownerUid, getNextOrder));
    } catch (error) {
      items.push({
        fileId: file.id,
        fileName: file.name,
        status: 'failed',
        message: getErrorMessage(error),
      });
    }
  }

  return {
    folder,
    summary: {
      scanned: items.length,
      created: items.filter((item) => item.status === 'created').length,
      updated: items.filter((item) => item.status === 'updated').length,
      skipped: items.filter((item) => item.status === 'skipped').length,
      failed: items.filter((item) => item.status === 'failed').length,
    },
    items,
  };
};

// ── 이론 행 단건 동기화 ───────────────────────────────────────────────
// 반 이론 폴더에서 '이 콘텐츠 제목과 맞는' pptx 하나만 찾아 구글 슬라이드로 변환한다.
// 폴더 전체를 콘텐츠로 만드는 syncNotebookLmPptxFolder와 달리, 콘텐츠 doc은 만들지 않고
// 변환된 slideUrl만 돌려준다(호출부가 해당 콘텐츠의 theorySlideUrl로 저장). 매칭이 애매하면
// 후보 목록을 돌려 호출부가 직접 고르게 한다(fileId로 재요청).

export interface TheorySlideSyncResult {
  matched: boolean;
  slideUrl?: string;
  fileId?: string;
  fileName?: string;
  candidates?: { id: string; name: string }[];
}

interface SyncTheorySlideParams {
  folderId: string;
  driveAccessToken: string;
  title?: string;
  fileId?: string;
}

export const validateTheorySlidePayload = (body: unknown): SyncTheorySlideParams => {
  const payload = body as {
    folderId?: unknown;
    driveAccessToken?: unknown;
    title?: unknown;
    fileId?: unknown;
  };
  const folderId = typeof payload?.folderId === 'string' ? payload.folderId.trim() : '';
  const driveAccessToken =
    typeof payload?.driveAccessToken === 'string' ? payload.driveAccessToken.trim() : '';
  const title = typeof payload?.title === 'string' ? payload.title.trim() : '';
  const fileId = typeof payload?.fileId === 'string' ? payload.fileId.trim() : '';

  if (!folderId) {
    throw new Error('folderId is required.');
  }
  if (!driveAccessToken) {
    throw new Error('driveAccessToken is required.');
  }

  return { folderId, driveAccessToken, title, fileId };
};

// 제목/파일명을 느슨하게 비교하기 위한 정규화(공백·기호·확장자·'회차/시수' 토큰 제거, 소문자화).
const normalizeForMatch = (raw: string) =>
  raw
    .replace(/\.(pptx|pdf|key|ppt)$/i, '')
    .toLowerCase()
    .replace(/회차|차시|시수|교시/g, '')
    .replace(/[\s_\-().]/g, '')
    .trim();

export const syncTheorySlideFromFolder = async ({
  folderId,
  driveAccessToken,
  title,
  fileId,
}: SyncTheorySlideParams): Promise<TheorySlideSyncResult> => {
  const drive = getDriveClientFromAccessToken(driveAccessToken);
  await assertUsableFolder(drive, folderId);
  const convertedFolderId = await getOrCreateFolder(drive, folderId, CONVERTED_FOLDER_NAME);
  const pptxFiles = (await listTopLevelFiles(drive, folderId)).filter(isPptxFile);

  // 호출부가 후보 중 하나를 직접 고른 경우 — 그 파일을 변환한다.
  if (fileId) {
    const picked = pptxFiles.find((file) => file.id === fileId);
    if (!picked) {
      throw new Error('선택한 파일을 폴더에서 찾을 수 없습니다.');
    }
    const converted = await createConvertedPresentation(drive, picked, convertedFolderId);
    return { matched: true, slideUrl: converted.slideUrl, fileId: picked.id, fileName: picked.name };
  }

  if (pptxFiles.length === 0) {
    return { matched: false, candidates: [] };
  }

  const target = normalizeForMatch(title || '');
  let chosen: SourceDriveFile | undefined;

  if (target) {
    const exact = pptxFiles.filter((file) => normalizeForMatch(file.name) === target);
    if (exact.length === 1) {
      chosen = exact[0];
    } else if (exact.length === 0) {
      const partial = pptxFiles.filter((file) => {
        const name = normalizeForMatch(file.name);
        return name.length > 0 && (name.includes(target) || target.includes(name));
      });
      if (partial.length === 1) {
        chosen = partial[0];
      }
    }
  }

  // 딱 하나로 못 좁히면(0개거나 여러 개) 후보를 돌려 직접 고르게 한다.
  if (!chosen) {
    return {
      matched: false,
      candidates: pptxFiles.map((file) => ({ id: file.id, name: file.name })),
    };
  }

  const converted = await createConvertedPresentation(drive, chosen, convertedFolderId);
  return { matched: true, slideUrl: converted.slideUrl, fileId: chosen.id, fileName: chosen.name };
};
