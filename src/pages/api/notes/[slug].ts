import type { APIRoute } from "astro";
import { sessions } from "../../../data/schedule";
import { saveNote } from "../../../lib/notes";

export const POST: APIRoute = async ({ params, request, locals }) => {
  const slug = params.slug ?? "";
  const session = sessions.find((entry) => entry.slug === slug);

  if (!session) {
    return new Response("Session not found.", { status: 404 });
  }

  const formData = await request.formData();
  const content = String(formData.get("content") ?? "");
  const saved = await saveNote(slug, content, locals);

  return Response.json({
    ok: true,
    updatedAt: saved?.updatedAt ?? null,
  });
};
