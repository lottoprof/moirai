/*
 * POST /api/student/modules/[slug]/complete (Stage 26e)
 *
 * Student отмечает module как done. Auth: requireRoleApi('student').
 * Verify ownership через getModuleForStudent (включает enrollment check).
 *
 * Body: { locale: 'en' | 'ru' }
 */

import type { APIRoute } from "astro";
import { z } from "zod";
import { requireRoleApi } from "../../../../../lib/server/guards";
import {
  getModuleForStudent,
  markModuleComplete,
} from "../../../../../lib/server/student-modules";

export const prerender = false;

const Schema = z.object({
  locale: z.enum(["en", "ru"]),
});

function jsonError(code: string, status: number): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async (ctx) => {
  const userOrRes = await requireRoleApi(ctx, "student");
  if (userOrRes instanceof Response) return userOrRes;
  const user = userOrRes;

  const slug = ctx.params.slug;
  if (!slug || typeof slug !== "string") return jsonError("invalid_slug", 400);

  let raw: unknown;
  try { raw = await ctx.request.json(); } catch { return jsonError("invalid_json", 400); }
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) return jsonError("invalid_input", 400);
  const { locale } = parsed.data;

  const env = ctx.locals.runtime.env;
  const module_ = await getModuleForStudent(env, user.id, slug, locale);
  if (!module_) return jsonError("module_not_found", 404);
  // unlocked не требуется — даже locked модуль теоретически можно отметить done
  // (admin override flow). Sprint 2 — добавим explicit "admin marks for student".

  await markModuleComplete(env, module_.enrollment_id, module_.slug, locale);

  return new Response(
    JSON.stringify({ ok: true, slug: module_.slug }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
