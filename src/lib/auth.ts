type RuntimeEnv = {
  SITE_PASSWORD?: string;
};

type RuntimeLocals = {
  runtime?: {
    env?: RuntimeEnv;
  };
};

const encoder = new TextEncoder();

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer), (value) => value.toString(16).padStart(2, "0")).join("");

export const getSitePassword = (locals?: RuntimeLocals) =>
  locals?.runtime?.env?.SITE_PASSWORD ?? process.env.SITE_PASSWORD ?? "";

export const createAccessToken = async (password: string) => {
  const payload = encoder.encode(`dasarang:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return toHex(digest);
};
