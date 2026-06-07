/*
 * POST /api/instructor/homework/submissions/[id]/annotation-upload-url
 *
 * Student LK v2 Stage D/D2 — pre-signed PUT URL для annotated copy.
 *
 * Body: { contentType, sizeBytes }
 * Returns: { uploadUrl, fileR2Key, expiresAt }
 *
 * Spec: docs/student-lk-v2-spec.md § 4.3.
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireRoleApi } from '../../../../../../lib/server/guards';
import { LK_CONFIG } from '../../../../../../lib/config/lk';
import { HOMEWORK_ALLOWED_MIME, extensionForMime } from '../../../../../../lib/server/homework';
import { generateUploadUrl } from '../../../../../../lib/server/r2-signed';

export const prerender = false;

const BodySchema = z.object({
  contentType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
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
  const { contentType, sizeBytes } = parsed.data;

  if (!HOMEWORK_ALLOWED_MIME.has(contentType)) return jsonError('unsupported_content_type', 415);
  if (sizeBytes > LK_CONFIG.homework_upload_cap_bytes) return jsonError('file_too_large', 413);

  const env = ctx.locals.runtime.env;

  // ACL check + get enrollment_id
  const row = await env.DB.prepare(
    `SELECT hs.enrollment_id
       FROM homework_submissions hs
       JOIN enrollments e ON e.id = hs.enrollment_id
      WHERE hs.id = ?
        AND e.lead_instructor_id = ?
        AND e.archived_at IS NULL`,
  )
    .bind(submissionId, user.id)
    .first<{ enrollment_id: string }>();

  if (!row) return jsonError('not_found_or_forbidden', 404);

  const ext = extensionForMime(contentType);
  const fileR2Key = `homework/${row.enrollment_id}/${submissionId}.annotated.${ext}`;

  let signed;
  try {
    signed = await generateUploadUrl(
      env, fileR2Key, contentType,
      LK_CONFIG.signed_url_expiration_hours * 3600,
    );
  } catch (err) {
    console.error('[annotation-upload-url] R2 sign failed:', err);
    return jsonError('signing_failed', 500);
  }

  return new Response(
    JSON.stringify({ uploadUrl: signed.url, fileR2Key, expiresAt: signed.expiresAt }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};
