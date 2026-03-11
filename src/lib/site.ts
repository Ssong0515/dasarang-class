export const COOKIE_NAME = "dasarang_access";

export const normalizeBase = (value = import.meta.env.BASE_URL) => {
  if (!value || value === "/") {
    return "";
  }

  return value.endsWith("/") ? value.slice(0, -1) : value;
};

export const withBase = (path: string) => {
  const normalizedBase = normalizeBase();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (!normalizedBase) {
    return normalizedPath;
  }

  return `${normalizedBase}${normalizedPath}`;
};

export const stripBase = (pathname: string) => {
  const normalizedBase = normalizeBase();

  if (!normalizedBase || !pathname.startsWith(normalizedBase)) {
    return pathname;
  }

  const stripped = pathname.slice(normalizedBase.length);
  return stripped || "/";
};
