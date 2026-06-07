/*
 * POST /api/student/homework/submissions
 *
 * Student LK v2 Stage C/C3b — finalize submission после client PUT
 * на R2.
 *
 * Body: { submissionId, moduleSlug, fileR2Key, contentType, sizeBytes,
 *         studentComment?, idempotencyKey }
 *
 * Flow:
 *   1. Auth + validate input.
 *   2. Find enrollment_id (user owns module_slug).
 *   3. HEAD R2 verify object exists + size matches.
 *   4. createSubmission (idempotent через idempotencyKey).
 *
 * Spec: docs/student-lk-v2-spec.md § 4.2.
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireRoleApi } from '../../../../lib/server/guards';
import { LK_CONFIG } from '../../../../lib/config/lk';
import { createSubmission } from '../../../../lib/server/homework';
import { objectExists } from '../../../../lib/server/r2-signed';

export const prerender = false;

const BodySchema = z.object({
  submissionId: z.string().uuid(),
  moduleSlug: z.string().min(1).max(100),
  fileR2Key: z.string().min(1).max(500),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  studentComment: z.string().max(LK_CONFIG.student_comment_max_chars).optional(),
  idempotencyKey: z.string().uuid(),
});

function jsonError(code: string, status: number): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async (ctx) => {
  const userOrRes = await requireRoleApi(ctx, 'student');
  if (userOrRes instanceof Response) return userOrRes;
  const user = userOrRes;

  let raw: unknown;
  try { raw = await ctx.request.json(); } catch { return jsonError('invalid_json', 400); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return jsonError('invalid_input', 400);
  const body = parsed.data;

  const env = ctx.locals.runtime.env;

  // Find enrollment + verify ownership of module
  const row = await env.DB.prepare(
    `SELECT e.id AS enrollment_id
       FROM enrollments e
       JOIN enrollment_modules em ON em.enrollment_id = e.id
      WHERE e.user_id = ?
        AND em.module_slug = ?
        AND e.status = 'active'
        AND e.archived_at IS NULL
      LIMIT 1`,
  )
    .bind(user.id, body.moduleSlug)
    .first<{ enrollment_id: string }>();

  if (!row) return jsonError('module_not_found', 404);

  // R2 path должен match enrollment_id (prevent cross-enrollment writes)
  const expectedPrefix = `homework/${row.enrollment_id}/`;
  if (!body.fileR2Key.startsWith(expectedPrefix)) {
    return jsonError('invalid_file_path', 400);
  }

  // HEAD R2 verify
  const head = await objectExists(env, body.fileR2Key);
  if (!head.exists) return jsonError('file_not_uploaded', 404);
  if (head.size != null && head.size !== body.sizeBytes) {
    return jsonError('size_mismatch', 400);
  }

  // Finalize
  const result = await createSubmission(env, {
    submissionId: body.submissionId,
    enrollmentId: row.enrollment_id,
    moduleSlug: body.moduleSlug,
    idempotencyKey: body.idempotencyKey,
    fileR2Key: body.fileR2Key,
    contentType: body.contentType,
    sizeBytes: body.sizeBytes,
    studentComment: body.studentComment,
  });

  return new Response(
    JSON.stringify({ id: result.id, created: result.created }),
    { status: result.created ? 201 : 200, headers: { 'Content-Type': 'application/json' } },
  );
};
