import type { APIRoute } from "astro";
import { createAccessToken, getSitePassword } from "../../lib/auth";
import { COOKIE_NAME, withBase } from "../../lib/site";

export const POST: APIRoute = async ({ request, locals, cookies, redirect, url }) => {
  const formData = await request.formData();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? withBase("/"));
  const sitePassword = getSitePassword(locals);

  if (!sitePassword) {
    return new Response("SITE_PASSWORD is not configured.", {
      status: 500,
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    });
  }

  if (password !== sitePassword) {
    const loginUrl = new URL(withBase("/login"), url);
    loginUrl.searchParams.set("error", "1");
    loginUrl.searchParams.set("next", next);
    return redirect(loginUrl.toString());
  }

  cookies.set(COOKIE_NAME, await createAccessToken(sitePassword), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:",
    maxAge: 60 * 60 * 24 * 30,
  });

  return redirect(next);
};
