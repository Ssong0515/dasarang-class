/* eslint-disable @typescript-eslint/no-explicit-any */

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

const DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const DRIVE_SYNC_SCOPE = 'https://www.googleapis.com/auth/drive';

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

async function loadGapiPicker(): Promise<void> {
  await loadScript('https://apis.google.com/js/api.js');
  await new Promise<void>((resolve) => {
    window.gapi.load('picker', { callback: resolve });
  });
}

async function loadGis(): Promise<void> {
  await loadScript('https://accounts.google.com/gsi/client');
}

// 같은 세션 동안 스코프별로 액세스 토큰을 캐시해, 버튼을 다시 눌러도 구글 창이 안 뜨게 한다.
const tokenCache: Record<string, { token: string; expiresAt: number }> = {};

async function getAccessToken(
  clientId: string,
  hintEmail?: string,
  scope = DRIVE_READONLY_SCOPE
): Promise<string> {
  const cached = tokenCache[scope];
  // 만료 1분 전까지는 캐시된 토큰을 그대로 재사용 (구글 호출 자체를 건너뜀)
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
  }
  return new Promise((resolve, reject) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope,
      hint: hintEmail,
      // 빈 문자열 = 이미 권한을 준 계정이면 계정 선택 창 없이 조용히 토큰을 재발급.
      // (권한을 한 번도 안 준 최초 1회에만 동의 창이 뜨고, 이후로는 바로 진행)
      prompt: '',
      callback: (response: any) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        const token = response.access_token as string;
        const expiresInSec = Number(response.expires_in) || 3600;
        tokenCache[scope] = { token, expiresAt: Date.now() + expiresInSec * 1000 };
        resolve(token);
      },
    });
    tokenClient.requestAccessToken();
  });
}

const getPickerDocValue = (doc: any, fieldName: string) => {
  const pickerField = window.google?.picker?.Document?.[fieldName];
  return (pickerField && doc[pickerField]) || doc[fieldName.toLowerCase()] || doc[fieldName] || '';
};

export async function requestDriveSyncAccessToken(
  clientId: string,
  hintEmail?: string
): Promise<string> {
  await loadGis();
  return getAccessToken(clientId, hintEmail, DRIVE_SYNC_SCOPE);
}

export interface DriveFolder {
  id: string;
  name: string;
}

export interface DriveSlideFile {
  id: string;
  name: string;
  mimeType: string;
  embedUrl: string;
}

const SLIDES_MIME = 'application/vnd.google-apps.presentation';
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

export async function openDriveSlidePicker(
  apiKey: string,
  clientId: string,
  hintEmail?: string
): Promise<DriveSlideFile | null> {
  await Promise.all([loadGapiPicker(), loadGis()]);

  const accessToken = await getAccessToken(clientId, hintEmail);

  return new Promise((resolve) => {
    const view = new window.google.picker.DocsView()
      .setMimeTypes(`${SLIDES_MIME},${PPTX_MIME}`)
      .setIncludeFolders(true);

    const picker = new window.google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(apiKey)
      .setTitle('슬라이드 파일 선택')
      .setCallback((data: any) => {
        if (data.action === window.google.picker.Action.PICKED) {
          const doc = data.docs[0];
          const id = getPickerDocValue(doc, 'ID') || doc.id;
          const name = getPickerDocValue(doc, 'NAME') || doc.name || '선택한 슬라이드';
          const mimeType = getPickerDocValue(doc, 'MIME_TYPE') || doc.mimeType;
          const isGoogleSlides = mimeType === SLIDES_MIME;
          const embedUrl = isGoogleSlides
            ? `https://docs.google.com/presentation/d/${id}/embed`
            : `https://drive.google.com/file/d/${id}/preview`;
          resolve({ id, name, mimeType, embedUrl });
        } else if (data.action === window.google.picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();

    picker.setVisible(true);
  });
}

export async function openDriveFolderPicker(
  apiKey: string,
  clientId: string,
  hintEmail?: string
): Promise<DriveFolder | null> {
  await Promise.all([loadGapiPicker(), loadGis()]);

  const accessToken = await getAccessToken(clientId, hintEmail);

  return new Promise((resolve) => {
    const view = new window.google.picker.DocsView(window.google.picker.ViewId.FOLDERS)
      .setMimeTypes('application/vnd.google-apps.folder')
      .setSelectFolderEnabled(true);

    const picker = new window.google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(apiKey)
      .setCallback((data: any) => {
        if (data.action === window.google.picker.Action.PICKED) {
          const doc = data.docs[0];
          const id = getPickerDocValue(doc, 'ID') || doc.id;
          const name = getPickerDocValue(doc, 'NAME') || doc.name || '선택한 Drive 폴더';
          resolve({ id, name });
        } else if (data.action === window.google.picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();

    picker.setVisible(true);
  });
}
