/*
 * GET /api/student/homework/submissions/[id]/file-url
 *
 * Student LK v2 Stage C/C3c — signed GET URL для playback/download
 * оригинала submission'a.
 *
 * ACL: own submission OR lead instructor OR admin.
 * Returns: { url, expiresAt }
 *
 * Spec: docs/student-lk-v2-spec.md § 4.2.
 */

import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../../../lib/server/guards';
import { LK_CONFIG } from '../../../../../../lib/config/lk';
import { getSubmissionForAcl } from '../../../../../../lib/server/homework';
import { generateGetUrl } from '../../../../../../lib/server/r2-signed';

export const prerender = false;

function jsonError(code: string, status: number): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET: APIRoute = async (ctx) => {
  const userOrRes = await requireAuth(ctx);
  if (userOrRes instanceof Response) return userOrRes;
  const user = userOrRes;

  const submissionId = ctx.params.id;
  if (!submissionId || typeof submissionId !== 'string') {
    return jsonError('invalid_id', 400);
  }

  const env = ctx.locals.runtime.env;
  const isAdmin = user.roles.has('admin');

  const acl = await getSubmissionForAcl(env, submissionId, user.id, isAdmin);
  if (!acl) return jsonError('not_found', 404);

  // Check actual R2 existence via Worker binding (HEAD на signed URL
  // блокируется CORS, поэтому делаем здесь). Если объекта нет —
  // 404, UI покажет placeholder без рендера broken player.
  try {
    const obj = await env.HOMEWORK_BUCKET.head(acl.file_r2_key);
    if (!obj) return jsonError('file_not_found', 404);
  } catch (err) {
    console.error('[file-url] R2 head failed:', err);
    return jsonError('file_check_failed', 500);
  }

  let signed;
  try {
    signed = await generateGetUrl(
      env,
      acl.file_r2_key,
      LK_CONFIG.signed_get_url_ttl_seconds,
    );
  } catch (err) {
    console.error('[file-url] R2 sign failed:', err);
    return jsonError('signing_failed', 500);
  }

  return new Response(
    JSON.stringify({ url: signed.url, expiresAt: signed.expiresAt }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};
