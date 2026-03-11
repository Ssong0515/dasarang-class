import type { APIRoute } from "astro";
import { COOKIE_NAME, withBase } from "../../lib/site";

export const POST: APIRoute = async ({ cookies, redirect }) => {
  cookies.delete(COOKIE_NAME, {
    path: "/",
  });

  return redirect(withBase("/login/"));
};
