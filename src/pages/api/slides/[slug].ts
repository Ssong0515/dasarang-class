import type { APIRoute } from "astro";
import { createSlideForSession, updateSlideMetaForSession } from "../../../lib/slide-files";
import { deleteSlideFromSession, saveSlideOrder } from "../../../lib/slide-state";

export const prerender = false;

export const POST: APIRoute = async ({ params, request }) => {
  const slug = params.slug ?? "";

  if (!slug) {
    return new Response(JSON.stringify({ ok: false, error: "missing_slug" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const action = typeof (payload as { action?: unknown })?.action === "string"
    ? (payload as { action: string }).action
    : "";

  if (action === "reorder") {
    const order = Array.isArray((payload as { order?: unknown[] }).order)
      ? (payload as { order: unknown[] }).order.filter((entry): entry is string => typeof entry === "string")
      : [];

    await saveSlideOrder(slug, order);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (action === "delete") {
    const slideId = typeof (payload as { slideId?: unknown })?.slideId === "string"
      ? (payload as { slideId: string }).slideId
      : "";

    if (!slideId) {
      return new Response(JSON.stringify({ ok: false, error: "missing_slide_id" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    await deleteSlideFromSession(slug, slideId);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (action === "add") {
    const created = await createSlideForSession(slug);

    return new Response(JSON.stringify({ ok: true, created }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (action === "update-meta") {
    const slideId = typeof (payload as { slideId?: unknown })?.slideId === "string"
      ? (payload as { slideId: string }).slideId
      : "";
    const title = typeof (payload as { title?: unknown })?.title === "string"
      ? (payload as { title: string }).title
      : undefined;
    const helpLabel = typeof (payload as { helpLabel?: unknown })?.helpLabel === "string"
      ? (payload as { helpLabel: string }).helpLabel
      : undefined;

    if (!slideId) {
      return new Response(JSON.stringify({ ok: false, error: "missing_slide_id" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    await updateSlideMetaForSession(slug, slideId, {
      title,
      helpLabel,
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: false, error: "unknown_action" }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
};
