/*
 * src/lib/server/email/feedback.ts
 *
 * Resend feedback email для Student LK v2.
 *
 * Triggered from instructor review endpoint. One-shot per submission
 * — idempotency через feedback_email_sent_at column.
 *
 * Spec: docs/student-lk-v2-spec.md § 4.3 + § 6 (cron не нужен — отправка
 * inline в review endpoint).
 *
 * Best-effort: ошибки не блокируют review action (logged).
 */

import type { SubmissionForReview } from '../instructor-homework';

const FROM = 'Moirai <feedback@moiraionline.pro>';
const REPLY_TO = 'feedback@moiraionline.pro';
const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const BASE_URL = 'https://moiraionline.pro';

interface ResendResponse {
  id?: string;
  message?: string;
}

/**
 * Get student email + locale + check whether email уже sent.
 */
async function getRecipientContext(
  env: Cloudflare.Env,
  submissionId: string,
): Promise<{ email: string; name: string | null; locale: 'en' | 'ru'; alreadySent: boolean } | null> {
  const row = await env.DB.prepare(
    `SELECT u.email, u.name, u.locale, u.notifications_email,
            hs.feedback_email_sent_at
       FROM homework_submissions hs
       JOIN enrollments e ON e.id = hs.enrollment_id
       JOIN users u ON u.id = e.user_id
      WHERE hs.id = ?`,
  )
    .bind(submissionId)
    .first<{
      email: string;
      name: string | null;
      locale: string;
      notifications_email: number;
      feedback_email_sent_at: number | null;
    }>();

  if (!row) return null;
  if (row.notifications_email === 0) return null; // user opted out
  const locale: 'en' | 'ru' = row.locale === 'ru' ? 'ru' : 'en';
  return {
    email: row.email,
    name: row.name,
    locale,
    alreadySent: row.feedback_email_sent_at != null,
  };
}

/**
 * Mark email sent (idempotency).
 */
async function markEmailSent(env: Cloudflare.Env, submissionId: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE homework_submissions SET feedback_email_sent_at = ? WHERE id = ?`,
  )
    .bind(now, submissionId)
    .run();
}

interface FeedbackTemplate { subject: string; text: string; html: string; }

function getTemplate(
  locale: 'en' | 'ru',
  moduleTitle: string,
  status: 'approved' | 'needs_revision',
  instructorName: string,
  commentSnippet: string | null,
  dashboardUrl: string,
): FeedbackTemplate {
  if (locale === 'ru') {
    const subjectStatus = status === 'approved' ? 'Принято' : 'На доработку';
    const greeting = 'Здравствуйте!';
    const intro = status === 'approved'
      ? `Преподаватель ${instructorName} принял вашу работу по модулю «${moduleTitle}».`
      : `Преподаватель ${instructorName} оставил замечания по вашей работе по модулю «${moduleTitle}». Внесите правки и загрузите новую версию.`;
    const commentBlock = commentSnippet
      ? `\n\nКомментарий преподавателя:\n${commentSnippet}\n`
      : '';
    const cta = `\nПосмотреть в кабинете: ${dashboardUrl}`;
    const text = `${greeting}\n\n${intro}${commentBlock}${cta}\n\n--\nMoirai`;
    const html = `<!doctype html>
<html><body style="font-family: system-ui, -apple-system, sans-serif; color: #0d0b09; max-width: 600px; margin: 0 auto; padding: 24px;">
<p>${greeting}</p>
<p>${intro}</p>
${commentSnippet ? `<blockquote style="border-left: 3px solid #d4820a; padding: 8px 16px; color: #555; margin: 16px 0;"><strong>Комментарий преподавателя:</strong><br>${escapeHtml(commentSnippet)}</blockquote>` : ''}
<p><a href="${dashboardUrl}" style="display: inline-block; padding: 12px 24px; background: #d4820a; color: #0d0b09; text-decoration: none; border-radius: 2px; font-weight: 500;">Открыть в кабинете</a></p>
<p style="color: #999; font-size: 12px; margin-top: 32px;">Moirai · <a href="${BASE_URL}" style="color: #999;">moiraionline.pro</a></p>
</body></html>`;
    return { subject: `${subjectStatus}: ${moduleTitle}`, text, html };
  }

  // EN
  const subjectStatus = status === 'approved' ? 'Approved' : 'Needs revision';
  const greeting = 'Hello,';
  const intro = status === 'approved'
    ? `Your instructor ${instructorName} approved your submission for "${moduleTitle}".`
    : `Your instructor ${instructorName} requested revisions on your submission for "${moduleTitle}". Please address the notes and upload a new version.`;
  const commentBlock = commentSnippet
    ? `\n\nInstructor comment:\n${commentSnippet}\n`
    : '';
  const cta = `\nView in dashboard: ${dashboardUrl}`;
  const text = `${greeting}\n\n${intro}${commentBlock}${cta}\n\n--\nMoirai`;
  const html = `<!doctype html>
<html><body style="font-family: system-ui, -apple-system, sans-serif; color: #0d0b09; max-width: 600px; margin: 0 auto; padding: 24px;">
<p>${greeting}</p>
<p>${intro}</p>
${commentSnippet ? `<blockquote style="border-left: 3px solid #d4820a; padding: 8px 16px; color: #555; margin: 16px 0;"><strong>Instructor comment:</strong><br>${escapeHtml(commentSnippet)}</blockquote>` : ''}
<p><a href="${dashboardUrl}" style="display: inline-block; padding: 12px 24px; background: #d4820a; color: #0d0b09; text-decoration: none; border-radius: 2px; font-weight: 500;">Open in dashboard</a></p>
<p style="color: #999; font-size: 12px; margin-top: 32px;">Moirai · <a href="${BASE_URL}" style="color: #999;">moiraionline.pro</a></p>
</body></html>`;
  return { subject: `${subjectStatus}: ${moduleTitle}`, text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Send feedback email — best effort, idempotent.
 *
 * @param env
 * @param submission     — SubmissionForReview row (для context).
 * @param instructorName — для подписи в email.
 */
export async function sendFeedbackEmail(
  env: Cloudflare.Env,
  submission: SubmissionForReview,
  instructorName: string,
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.error('[email/feedback] RESEND_API_KEY not configured — skipped');
    return;
  }

  if (submission.status !== 'approved' && submission.status !== 'needs_revision') {
    return; // не шлём для pending/auto_approved
  }

  const ctx = await getRecipientContext(env, submission.id);
  if (!ctx) return; // not found или opted out
  if (ctx.alreadySent) return; // idempotency

  const commentSnippet = submission.instructor_comment
    ? (submission.instructor_comment.length > 200
        ? submission.instructor_comment.slice(0, 200) + '…'
        : submission.instructor_comment)
    : null;

  const dashboardUrl = `${BASE_URL}/${ctx.locale}/dashboard/homework?focus=${submission.id}`;

  const tpl = getTemplate(
    ctx.locale,
    submission.module_title ?? submission.module_slug,
    submission.status,
    instructorName,
    commentSnippet,
    dashboardUrl,
  );

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: [ctx.email],
        reply_to: REPLY_TO,
        subject: tpl.subject,
        text: tpl.text,
        html: tpl.html,
      }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => null) as ResendResponse | null;
      console.error('[email/feedback] Resend HTTP error:', res.status, errBody?.message);
      return;
    }

    // Mark sent only on success
    await markEmailSent(env, submission.id);
  } catch (err) {
    console.error('[email/feedback] fetch failed:', err);
  }
}
