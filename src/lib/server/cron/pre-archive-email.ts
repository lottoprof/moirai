/*
 * src/lib/server/cron/pre-archive-email.ts
 *
 * Pre-archive warning email cron — Stage F.
 *
 * Trigger: daily 04:00 UTC.
 *
 * Logic: для enrollments в 23-24 дня после completed_at/cancelled_at,
 * не отправляли pre_archive_email, шлём warning "Files will be removed
 * in 7 days, download now".
 *
 * Spec: docs/student-lk-v2-spec.md § 6.4.
 */

import { LK_CONFIG } from '../../config/lk';

interface CandidateRow {
  enrollment_id: string;
  user_email: string;
  user_name: string | null;
  user_locale: string;
  trigger_date: number;
}

export interface PreArchiveResult {
  emails_sent: number;
  errors: number;
  duration_ms: number;
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const FROM = 'MoiraiOnline <noreply@moiraionline.pro>';
const BASE_URL = 'https://moiraionline.pro';

function getTemplate(
  locale: 'en' | 'ru',
  daysLeft: number,
): { subject: string; text: string; html: string } {
  if (locale === 'ru') {
    return {
      subject: 'Ваши работы будут удалены через 7 дней',
      text: `Здравствуйте!\n\nЧерез ${daysLeft.toString()} дней мы удалим ваши домашние работы из системы (политика хранения данных).\n\nЕсли хотите сохранить файлы — скачайте их сейчас: ${BASE_URL}/ru/dashboard/homework\n\n--\nMoirai`,
      html: `<!doctype html>
<html><body style="font-family: system-ui, sans-serif; color: #0d0b09; max-width: 600px; margin: 0 auto; padding: 24px;">
<p>Здравствуйте!</p>
<p>Через <strong>${daysLeft.toString()} дней</strong> мы удалим ваши домашние работы из системы (политика хранения данных).</p>
<p>Если хотите сохранить файлы — скачайте их сейчас:</p>
<p><a href="${BASE_URL}/ru/dashboard/homework" style="display: inline-block; padding: 12px 24px; background: #d4820a; color: #0d0b09; text-decoration: none; border-radius: 2px; font-weight: 500;">Открыть кабинет</a></p>
<p style="color: #999; font-size: 12px; margin-top: 32px;">MoiraiOnline · moiraionline.pro</p>
</body></html>`,
    };
  }
  return {
    subject: 'Your homework will be removed in 7 days',
    text: `Hello,\n\nIn ${daysLeft.toString()} days we'll remove your homework submissions per our retention policy.\n\nTo save your files, download them now: ${BASE_URL}/en/dashboard/homework\n\n--\nMoirai`,
    html: `<!doctype html>
<html><body style="font-family: system-ui, sans-serif; color: #0d0b09; max-width: 600px; margin: 0 auto; padding: 24px;">
<p>Hello,</p>
<p>In <strong>${daysLeft.toString()} days</strong> we'll remove your homework submissions per our retention policy.</p>
<p>To save your files, download them now:</p>
<p><a href="${BASE_URL}/en/dashboard/homework" style="display: inline-block; padding: 12px 24px; background: #d4820a; color: #0d0b09; text-decoration: none; border-radius: 2px; font-weight: 500;">Open dashboard</a></p>
<p style="color: #999; font-size: 12px; margin-top: 32px;">MoiraiOnline · moiraionline.pro</p>
</body></html>`,
  };
}

export async function runPreArchiveEmail(env: Cloudflare.Env): Promise<PreArchiveResult> {
  const start = Date.now();
  const now = Math.floor(start / 1000);
  const triggerDays = LK_CONFIG.retention_grace_days - LK_CONFIG.pre_archive_email_days_before;
  const windowStart = now - (triggerDays + 1) * 86400;
  const windowEnd = now - triggerDays * 86400;

  if (!env.RESEND_API_KEY) {
    console.error('[cron/pre-archive-email] RESEND_API_KEY not configured');
    return { emails_sent: 0, errors: 0, duration_ms: Date.now() - start };
  }

  const rows = await env.DB.prepare(
    `SELECT e.id AS enrollment_id, u.email AS user_email, u.name AS user_name,
            u.locale AS user_locale,
            COALESCE(e.completed_at, e.cancelled_at) AS trigger_date
       FROM enrollments e
       JOIN users u ON u.id = e.user_id
      WHERE e.archived_at IS NULL
        AND e.pre_archive_email_sent_at IS NULL
        AND u.deleted_at IS NULL
        AND u.notifications_email = 1
        AND (
          (e.completed_at IS NOT NULL AND e.completed_at BETWEEN ? AND ?)
          OR
          (e.cancelled_at IS NOT NULL AND e.cancelled_at BETWEEN ? AND ?)
        )
      LIMIT ?`,
  )
    .bind(windowStart, windowEnd, windowStart, windowEnd, LK_CONFIG.cron_batch_size)
    .all<CandidateRow>();

  let sent = 0;
  let errors = 0;

  for (const r of rows.results) {
    const locale: 'en' | 'ru' = r.user_locale === 'ru' ? 'ru' : 'en';
    const tpl = getTemplate(locale, LK_CONFIG.pre_archive_email_days_before);

    try {
      const res = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM,
          to: [r.user_email],
          subject: tpl.subject,
          text: tpl.text,
          html: tpl.html,
        }),
      });
      if (!res.ok) {
        console.error('[cron/pre-archive-email] resend failed', res.status);
        errors++;
        continue;
      }
      await env.DB.prepare(
        `UPDATE enrollments SET pre_archive_email_sent_at = ? WHERE id = ?`,
      )
        .bind(now, r.enrollment_id)
        .run();
      sent++;
    } catch (err) {
      console.error('[cron/pre-archive-email] error для', r.enrollment_id, err);
      errors++;
    }
  }

  return { emails_sent: sent, errors, duration_ms: Date.now() - start };
}
