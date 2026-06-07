/*
 * POST /api/instructor/homework/submissions/[id]/annotation-finalize
 *
 * Student LK v2 Stage D/D2 — finalize annotation upload (set R2 key в D1).
 *
 * Body: { fileR2Key }
 *
 * Spec: docs/student-lk-v2-spec.md § 4.3.
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireRoleApi } from '../../../../../../lib/server/guards';
import { finalizeAnnotation } from '../../../../../../lib/server/instructor-homework';
import { objectExists } from '../../../../../../lib/server/r2-signed';

export const prerender = false;

const BodySchema = z.object({
  fileR2Key: z.string().min(1).max(500),
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

  const submissionId = ctx.params.id;
  if (!submissionId || typeof submissionId !== 'string') return jsonError('invalid_id', 400);

  let raw: unknown;
  try { raw = await ctx.request.json(); } catch { return jsonError('invalid_json', 400); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return jsonError('invalid_input', 400);
  const { fileR2Key } = parsed.data;

  const env = ctx.locals.runtime.env;

  // R2 path must end в .annotated.<ext> и содержать submission_id
  if (!fileR2Key.includes(submissionId) || !fileR2Key.includes('.annotated.')) {
    return jsonError('invalid_file_path', 400);
  }

  // HEAD R2 verify
  const head = await objectExists(env, fileR2Key);
  if (!head.exists) return jsonError('file_not_uploaded', 404);

  const ok = await finalizeAnnotation(env, {
    submissionId,
    instructorId: user.id,
    fileR2Key,
    uploadedAt: Math.floor(Date.now() / 1000),
  });

  if (!ok) return jsonError('not_found_or_forbidden', 404);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
