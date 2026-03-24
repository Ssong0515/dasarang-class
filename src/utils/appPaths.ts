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
