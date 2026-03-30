/* eslint-disable @typescript-eslint/no-explicit-any */

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

const DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

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

async function getAccessToken(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_READONLY_SCOPE,
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

export interface DriveFolder {
  id: string;
  name: string;
}

export async function openDriveFolderPicker(
  apiKey: string,
  clientId: string
): Promise<DriveFolder | null> {
  await Promise.all([loadGapiPicker(), loadGis()]);

  const accessToken = await getAccessToken(clientId);

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
          resolve({ id: doc.id, name: doc.name });
        } else if (data.action === window.google.picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();

    picker.setVisible(true);
  });
}
