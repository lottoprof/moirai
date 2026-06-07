/*
 * POST /api/instructor/homework/submissions/[id]/review
 *
 * Student LK v2 Stage D/D2 — instructor sets review verdict.
 *
 * Body: { status: 'approved' | 'needs_revision', comment?: string }
 *
 * Validation:
 *   - needs_revision требует non-empty comment.
 *   - comment ≤ LK_CONFIG.instructor_comment_max_chars.
 *   - Submission must be pending (idempotent).
 *
 * Side effects:
 *   - UPDATE homework_submissions (status, instructor_comment, reviewed_*).
 *   - Send feedback email через Resend (one-shot, idempotency через
 *     feedback_email_sent_at).
 *
 * Spec: docs/student-lk-v2-spec.md § 4.3.
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireRoleApi } from '../../../../../../lib/server/guards';
import { LK_CONFIG } from '../../../../../../lib/config/lk';
import { submitReview, getSubmissionForReview } from '../../../../../../lib/server/instructor-homework';
import { sendFeedbackEmail } from '../../../../../../lib/server/email/feedback';

export const prerender = false;

const BodySchema = z.object({
  status: z.enum(['approved', 'needs_revision']),
  comment: z.string().max(LK_CONFIG.instructor_comment_max_chars).optional(),
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
  const { status, comment } = parsed.data;

  if (status === 'needs_revision' && (!comment || comment.trim().length === 0)) {
    return jsonError('comment_required', 400);
  }

  const env = ctx.locals.runtime.env;
  const result = await submitReview(env, {
    submissionId,
    instructorId: user.id,
    status,
    comment: comment ?? null,
  });

  if (!result.success) {
    if (result.current_status && result.current_status !== 'pending') {
      return jsonError('already_reviewed', 409);
    }
    return jsonError('not_found_or_forbidden', 404);
  }

  // Fire-and-forget feedback email (best effort, не блокирует response)
  // Idempotency через feedback_email_sent_at в email helper.
  ctx.locals.runtime.ctx.waitUntil(
    (async () => {
      const submission = await getSubmissionForReview(env, user.id, submissionId, 'en');
      if (submission) {
        await sendFeedbackEmail(env, submission, user.name ?? user.email);
      }
    })().catch((err: unknown) => {
      console.error('[review] feedback email failed:', err);
    }),
  );

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
