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

    return {
      fileId: sourceFile.id,
      fileName: sourceFile.name,
      status: 'updated',
      contentId: existingContent.id,
      slideUrl: existingContent.slideUrl,
      message: 'Already converted; sync metadata refreshed.',
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
    await db.collection(CONTENTS_COLLECTION).doc(existingContent.id).set(syncData, { merge: true });
    await trashDriveFileIfPossible(drive, existingContent.convertedDriveFileId);

    return {
      fileId: sourceFile.id,
      fileName: sourceFile.name,
      status: 'updated',
      contentId: existingContent.id,
      slideUrl: converted.slideUrl,
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

  return {
    fileId: sourceFile.id,
    fileName: sourceFile.name,
    status: 'created',
    contentId: contentRef.id,
    slideUrl: converted.slideUrl,
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
