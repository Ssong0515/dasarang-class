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

async function getAccessToken(
  clientId: string,
  hintEmail?: string,
  scope = DRIVE_READONLY_SCOPE
): Promise<string> {
  return new Promise((resolve, reject) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope,
      hint: hintEmail,
      callback: (response: any) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        resolve(response.access_token as string);
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
