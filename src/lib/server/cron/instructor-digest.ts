/*
 * Instructor LK v2 Q9 — daily digest cron.
 *
 * Шлёт preподу утреннее email со сводкой:
 *   - Subject: "Today: N pending · M sessions"
 *   - Pending submissions (top 10)
 *   - Late submissions (top 5)
 *   - Today's scheduled sessions
 *
 * Trigger: POST /api/internal/cron/run?job=instructor-digest
 *          (ежедневно 13:00 UTC ≈ 09:00 EDT).
 *
 * Opt-in: users.instructor_digest_opt_in = 1 (default).
 *
 * Использует прямой Resend API call (не template-based sendEmail),
 * потому что content полностью динамический per-recipient.
 */

import { formatSessionTime } from "../../format-date";
import type { Locale } from "../../../../db/types";

interface InstructorRow {
  id: string;
  email: string;
  name: string | null;
  locale: Locale;
}

interface PendingRow {
  student_name: string | null;
  student_email: string;
  module_slug: string;
  module_title: string | null;
  uploaded_at: number;
  is_late: number;
  programme_slug: string;
}

interface SessionRow {
  scheduled_at: number;
  programme_slug: string;
  module_slug: string;
  module_title: string | null;
}

export interface InstructorDigestResult {
  candidates: number;          // активные instructors с opt_in=1
  sent: number;                // те у кого был контент
  skipped_empty: number;       // те у кого pending+sessions = 0
  errors: number;
  duration_ms: number;
}

const FROM = "Moirai <noreply@moiraionline.pro>";
const RESEND_ENDPOINT = "https://api.resend.com/emails";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function runInstructorDigest(env: Cloudflare.Env): Promise<InstructorDigestResult> {
  const t0 = Date.now();
  const now = Math.floor(Date.now() / 1000);
  const todayEnd = now + 24 * 3600;

  // Активные instructor'ы с opt_in
  const instructors = await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.locale
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
      WHERE ur.role = 'instructor'
        AND u.deleted_at IS NULL
        AND u.deactivated_at IS NULL
        AND COALESCE(u.instructor_digest_opt_in, 1) = 1`,
  ).all<InstructorRow>();

  const candidates = instructors.results.length;
  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const ins of instructors.results) {
    try {
      // Pending submissions top 10
      const pending = await env.DB.prepare(
        `SELECT u.name AS student_name, u.email AS student_email,
                hs.module_slug, m.title AS module_title,
                hs.uploaded_at, hs.is_late, c.programme_id AS programme_slug
           FROM homework_submissions hs
           JOIN enrollments e ON e.id = hs.enrollment_id
           JOIN users u ON u.id = e.user_id
           JOIN applications a ON a.enrollment_id = e.id
           JOIN cohorts c ON c.id = a.cohort_id
           LEFT JOIN modules m ON m.slug = hs.module_slug AND m.locale = ?
          WHERE e.lead_instructor_id = ?
            AND e.archived_at IS NULL
            AND hs.status = 'pending'
          ORDER BY hs.is_late DESC, hs.uploaded_at ASC
          LIMIT 10`,
      ).bind(ins.locale, ins.id).all<PendingRow>();

      const pendingTotalRow = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM homework_submissions hs
           JOIN enrollments e ON e.id = hs.enrollment_id
          WHERE e.lead_instructor_id = ?
            AND e.archived_at IS NULL
            AND hs.status = 'pending'`,
      ).bind(ins.id).first<{ n: number }>();
      const pendingTotal = pendingTotalRow?.n ?? 0;

      // Сегодняшние sessions
      const sessions = await env.DB.prepare(
        `SELECT s.scheduled_at, c.programme_id AS programme_slug,
                s.module_slug, m.title AS module_title
           FROM sessions s
           JOIN cohorts c ON c.id = s.cohort_id
           LEFT JOIN modules m ON m.slug = s.module_slug AND m.locale = ?
          WHERE (
              c.slot_id IN (SELECT id FROM slots WHERE instructor_id = ?)
              OR c.id IN (
                SELECT DISTINCT a.cohort_id FROM applications a
                  JOIN enrollments e ON e.id = a.enrollment_id
                 WHERE e.lead_instructor_id = ? AND e.archived_at IS NULL
              )
            )
            AND s.status = 'scheduled'
            AND s.scheduled_at BETWEEN ? AND ?
          ORDER BY s.scheduled_at ASC`,
      ).bind(ins.locale, ins.id, ins.id, now, todayEnd).all<SessionRow>();

      if (pendingTotal === 0 && sessions.results.length === 0) {
        skipped++;
        continue;
      }

      const ru = ins.locale === "ru";
      const tCopy = ru
        ? { greeting: ins.name ? `Доброе утро, ${ins.name}!` : "Доброе утро!",
            subjectPending: (n: number) => `${n.toString()} на проверке`,
            subjectSessions: (n: number) => `${n.toString()} занят${n === 1 ? "ие" : "ий"} сегодня`,
            pendingHead: "На проверке",
            pendingMore: (n: number) => `…и ещё ${n.toString()} в очереди.`,
            lateBadge: "просрочка",
            sessionsHead: "Сегодня",
            ctaQueue: "Открыть очередь",
            ctaSchedule: "Расписание",
            footer: "Письмо отправлено автоматически. Отключить можно в /account → Email-уведомления.",
          }
        : { greeting: ins.name ? `Good morning, ${ins.name}!` : "Good morning!",
            subjectPending: (n: number) => `${n.toString()} pending`,
            subjectSessions: (n: number) => `${n.toString()} session${n === 1 ? "" : "s"} today`,
            pendingHead: "Pending review",
            pendingMore: (n: number) => `…and ${n.toString()} more in queue.`,
            lateBadge: "late",
            sessionsHead: "Today",
            ctaQueue: "Open queue",
            ctaSchedule: "Schedule",
            footer: "Auto-sent digest. Disable in /account → Email notifications.",
          };

      const subjectParts: string[] = [];
      if (pendingTotal > 0) subjectParts.push(tCopy.subjectPending(pendingTotal));
      if (sessions.results.length > 0) subjectParts.push(tCopy.subjectSessions(sessions.results.length));
      const subject = `Moirai · ${subjectParts.join(" · ")}`;

      const baseUrl = "https://moiraionline.pro";
      const queueUrl = `${baseUrl}/${ins.locale}/instructor/homework`;
      const scheduleUrl = `${baseUrl}/${ins.locale}/instructor/sessions`;

      // HTML body
      const html = renderHtml({
        greeting: tCopy.greeting,
        pendingHead: tCopy.pendingHead,
        pending: pending.results,
        pendingTotal,
        pendingMore: pendingTotal > pending.results.length ? tCopy.pendingMore(pendingTotal - pending.results.length) : null,
        lateBadge: tCopy.lateBadge,
        sessionsHead: tCopy.sessionsHead,
        sessions: sessions.results.map((s) => ({
          time: formatSessionTime(new Date(s.scheduled_at * 1000), ins.locale),
          module: s.module_title ?? s.module_slug,
          programme: s.programme_slug,
        })),
        queueUrl,
        scheduleUrl,
        ctaQueue: tCopy.ctaQueue,
        ctaSchedule: tCopy.ctaSchedule,
        footer: tCopy.footer,
      });

      const text = renderText({
        greeting: tCopy.greeting,
        pending: pending.results,
        pendingTotal,
        pendingMore: pendingTotal > pending.results.length ? tCopy.pendingMore(pendingTotal - pending.results.length) : null,
        sessions: sessions.results.map((s) => ({
          time: formatSessionTime(new Date(s.scheduled_at * 1000), ins.locale),
          module: s.module_title ?? s.module_slug,
        })),
        queueUrl,
        scheduleUrl,
        footer: tCopy.footer,
      });

      // Direct Resend
      if (!env.RESEND_API_KEY) {
        console.error("[instructor-digest] RESEND_API_KEY missing");
        errors++;
        continue;
      }
      const res = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM, to: [ins.email], subject, text, html }),
      });
      if (!res.ok) {
        const body = await res.text();
        console.error(`[instructor-digest] resend status=${res.status.toString()} to=${ins.email} body=${body}`);
        errors++;
        continue;
      }
      sent++;
    } catch (err) {
      console.error("[instructor-digest] error", ins.email, err);
      errors++;
    }
  }

  return {
    candidates,
    sent,
    skipped_empty: skipped,
    errors,
    duration_ms: Date.now() - t0,
  };
}

interface HtmlParams {
  greeting: string;
  pendingHead: string;
  pending: PendingRow[];
  pendingTotal: number;
  pendingMore: string | null;
  lateBadge: string;
  sessionsHead: string;
  sessions: { time: string; module: string; programme: string }[];
  queueUrl: string;
  scheduleUrl: string;
  ctaQueue: string;
  ctaSchedule: string;
  footer: string;
}

function renderHtml(p: HtmlParams): string {
  const pendingItems = p.pending.map((r) => {
    const name = escapeHtml(r.student_name ?? r.student_email.split("@")[0]);
    const mod = escapeHtml(r.module_title ?? r.module_slug);
    const late = r.is_late === 1 ? ` <span style="color:#D4820A;text-transform:uppercase;font-size:11px">${p.lateBadge}</span>` : "";
    return `<li style="margin:0 0 8px"><strong>${name}</strong> · ${mod}${late}</li>`;
  }).join("");
  const sessionItems = p.sessions.map((s) =>
    `<li style="margin:0 0 8px"><strong>${escapeHtml(s.time)}</strong> · ${escapeHtml(s.module)}</li>`
  ).join("");

  return `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0D0B09;color:#F7F3EC;padding:24px;margin:0">
  <div style="max-width:560px;margin:0 auto;background:#1A1612;padding:32px;border-radius:4px">
    <h1 style="font-family:Georgia,serif;font-weight:400;font-size:24px;margin:0 0 24px">${escapeHtml(p.greeting)}</h1>
    ${p.pending.length > 0 ? `
      <h2 style="font-size:13px;letter-spacing:0.14em;text-transform:uppercase;color:#A39888;margin:24px 0 12px">${escapeHtml(p.pendingHead)} (${p.pendingTotal.toString()})</h2>
      <ul style="list-style:none;padding:0;margin:0">${pendingItems}</ul>
      ${p.pendingMore ? `<p style="color:#A39888;font-size:13px;margin:8px 0 0">${escapeHtml(p.pendingMore)}</p>` : ""}
      <p style="margin:16px 0 0"><a href="${p.queueUrl}" style="display:inline-block;padding:10px 16px;background:#D4820A;color:#0D0B09;text-decoration:none;text-transform:uppercase;font-size:12px;letter-spacing:0.1em">${escapeHtml(p.ctaQueue)}</a></p>
    ` : ""}
    ${p.sessions.length > 0 ? `
      <h2 style="font-size:13px;letter-spacing:0.14em;text-transform:uppercase;color:#A39888;margin:32px 0 12px">${escapeHtml(p.sessionsHead)}</h2>
      <ul style="list-style:none;padding:0;margin:0">${sessionItems}</ul>
      <p style="margin:16px 0 0"><a href="${p.scheduleUrl}" style="color:#F0A830;text-transform:uppercase;font-size:12px;letter-spacing:0.1em">${escapeHtml(p.ctaSchedule)} →</a></p>
    ` : ""}
    <p style="margin:32px 0 0;color:#A39888;font-size:12px;border-top:1px solid #2A2521;padding-top:16px">${escapeHtml(p.footer)}</p>
  </div>
</body></html>`;
}

interface TextParams {
  greeting: string;
  pending: PendingRow[];
  pendingTotal: number;
  pendingMore: string | null;
  sessions: { time: string; module: string }[];
  queueUrl: string;
  scheduleUrl: string;
  footer: string;
}

function renderText(p: TextParams): string {
  const lines: string[] = [p.greeting, ""];
  if (p.pending.length > 0) {
    lines.push(`PENDING (${p.pendingTotal.toString()}):`);
    for (const r of p.pending) {
      const name = r.student_name ?? r.student_email.split("@")[0];
      const mod = r.module_title ?? r.module_slug;
      const late = r.is_late === 1 ? " [LATE]" : "";
      lines.push(`  • ${name} · ${mod}${late}`);
    }
    if (p.pendingMore) lines.push(`  ${p.pendingMore}`);
    lines.push("", `Queue: ${p.queueUrl}`);
  }
  if (p.sessions.length > 0) {
    lines.push("", "TODAY:");
    for (const s of p.sessions) {
      lines.push(`  • ${s.time} · ${s.module}`);
    }
    lines.push("", `Schedule: ${p.scheduleUrl}`);
  }
  lines.push("", p.footer);
  return lines.join("\n");
}
