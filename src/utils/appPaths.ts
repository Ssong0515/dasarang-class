/** 참고 시간표 웹사이트 (calendar.damuna.org). 클래스/커리큘럼 화면에서 새 탭으로 연결한다. */
export const CALENDAR_SITE_URL = 'https://calendar.damuna.org';

const normalizeBaseUrl = (value?: string) => {
  const trimmed = (value || '/').trim();
  if (!trimmed || trimmed === '/') {
    return '/';
  }

  return `${trimmed.replace(/\/+$/, '')}/`;
};

export const getAppBaseUrl = () => normalizeBaseUrl(import.meta.env.BASE_URL as string | undefined);

export const resolveAppPath = (relativePath: string) => {
  const normalizedPath = relativePath.replace(/^\/+/, '');
  const baseUrl = getAppBaseUrl();
  return baseUrl === '/' ? `/${normalizedPath}` : `${baseUrl}${normalizedPath}`;
};
