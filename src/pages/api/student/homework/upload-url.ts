/*
 * POST /api/student/homework/upload-url
 *
 * Student LK v2 Stage C/C3a — generate pre-signed PUT URL для R2 upload.
 *
 * Body: { moduleSlug, contentType, sizeBytes, idempotencyKey }
 * Returns: { submissionId, uploadUrl, expiresAt }
 *
 * Validates:
 *   - contentType в HOMEWORK_ALLOWED_MIME
 *   - sizeBytes ≤ LK_CONFIG.homework_upload_cap_bytes
 *   - module unlocked (через getUnlockState)
 *   - enrollment active + not archived
 *
 * Spec: docs/student-lk-v2-spec.md § 4.2.
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireRoleApi } from '../../../../lib/server/guards';
import { LK_CONFIG } from '../../../../lib/config/lk';
import { HOMEWORK_ALLOWED_MIME, extensionForMime } from '../../../../lib/server/homework';
import { generateUploadUrl } from '../../../../lib/server/r2-signed';
import { getUnlockState } from '../../../../lib/server/unlock';

export const prerender = false;

const BodySchema = z.object({
  moduleSlug: z.string().min(1).max(100),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
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
  const { moduleSlug, contentType, sizeBytes, idempotencyKey } = parsed.data;

  // Validate mime + size
  if (!HOMEWORK_ALLOWED_MIME.has(contentType)) {
    return jsonError('unsupported_content_type', 415);
  }
  if (sizeBytes > LK_CONFIG.homework_upload_cap_bytes) {
    return jsonError('file_too_large', 413);
  }

  const env = ctx.locals.runtime.env;

  // Find user's active enrollment containing this module
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
    .bind(user.id, moduleSlug)
    .first<{ enrollment_id: string }>();

  if (!row) return jsonError('module_not_found', 404);

  // Unlock check
  const unlock = await getUnlockState(env, row.enrollment_id, moduleSlug);
  if (!unlock.unlocked) return jsonError('module_locked', 403);

  // Generate submission ID + R2 path
  const submissionId = crypto.randomUUID();
  const ext = extensionForMime(contentType);
  const fileR2Key = `homework/${row.enrollment_id}/${submissionId}.${ext}`;

  let signed;
  try {
    signed = await generateUploadUrl(
      env,
      fileR2Key,
      contentType,
      LK_CONFIG.signed_url_expiration_hours * 3600,
    );
  } catch (err) {
    console.error('[upload-url] R2 sign failed:', err);
    return jsonError('signing_failed', 500);
  }

  return new Response(
    JSON.stringify({
      submissionId,
      uploadUrl: signed.url,
      fileR2Key,
      idempotencyKey,
      expiresAt: signed.expiresAt,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};
