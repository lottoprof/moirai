/*
 * POST/DELETE /api/instructor/enrollment-modules/[eid]/[slug]/unlock-override
 *
 * Student LK v2 Stage D/D2 — instructor manual unlock override.
 *
 * POST body: { reason?: string }
 * DELETE: (no body) — undo override (set NULLs).
 *
 * ACL: lead_instructor для этого enrollment'a.
 *
 * Spec: docs/student-lk-v2-spec.md § 4.3 + Q1.A review.
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireRoleApi } from '../../../../../../lib/server/guards';
import { createOverride, removeOverride } from '../../../../../../lib/server/instructor-homework';

export const prerender = false;

const PostBodySchema = z.object({
  reason: z.string().max(500).optional(),
});

function jsonError(code: string, status: number): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async (ctx) => {
  const userOrRes = await requireRoleApi(ctx, 'instructor');
  if (userOrRes instanceof Response) return userOrRes;
  const user = userOrRes;

  const enrollmentId = ctx.params.eid;
  const moduleSlug = ctx.params.slug;
  if (!enrollmentId || !moduleSlug) return jsonError('invalid_params', 400);

  let raw: unknown = {};
  try { raw = await ctx.request.json(); } catch { /* empty body OK */ }
  const parsed = PostBodySchema.safeParse(raw);
  if (!parsed.success) return jsonError('invalid_input', 400);

  const env = ctx.locals.runtime.env;
  const ok = await createOverride(env, {
    enrollmentId,
    moduleSlug,
    instructorId: user.id,
    reason: parsed.data.reason,
  });

  if (!ok) return jsonError('not_found_or_forbidden', 404);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const DELETE: APIRoute = async (ctx) => {
  const userOrRes = await requireRoleApi(ctx, 'instructor');
  if (userOrRes instanceof Response) return userOrRes;
  const user = userOrRes;

  const enrollmentId = ctx.params.eid;
  const moduleSlug = ctx.params.slug;
  if (!enrollmentId || !moduleSlug) return jsonError('invalid_params', 400);

  const env = ctx.locals.runtime.env;
  const ok = await removeOverride(env, {
    enrollmentId,
    moduleSlug,
    instructorId: user.id,
  });

  if (!ok) return jsonError('not_found_or_forbidden', 404);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
