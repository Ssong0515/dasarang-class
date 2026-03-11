import { defineMiddleware } from "astro:middleware";
import { createAccessToken, getSitePassword } from "./lib/auth";
import { COOKIE_NAME, stripBase, withBase } from "./lib/site";

const publicPaths = new Set([
  "/login",
  "/login/",
  "/api/login",
  "/api/login/",
  "/favicon.ico",
  "/robots.txt",
]);

export const onRequest = defineMiddleware(async (context, next) => {
  const pathname = stripBase(new URL(context.request.url).pathname);

  if (pathname.startsWith("/_astro/") || publicPaths.has(pathname)) {
    return next();
  }

  const password = getSitePassword(context.locals);

  if (!password) {
    return new Response("SITE_PASSWORD is not configured.", {
      status: 500,
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    });
  }

  const expectedToken = await createAccessToken(password);
  const currentToken = context.cookies.get(COOKIE_NAME)?.value;

  if (currentToken === expectedToken) {
    return next();
  }

  const loginUrl = new URL(withBase("/login"), context.request.url);
  const currentUrl = new URL(context.request.url);
  loginUrl.searchParams.set("next", `${currentUrl.pathname}${currentUrl.search}`);

  return context.redirect(loginUrl.toString());
});
