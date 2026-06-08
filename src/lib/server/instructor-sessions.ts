/*
 * instructor-sessions.ts — server helpers для /instructor/sessions page.
 *
 * Instructor LK v2 Q5 (2026-06-08).
 */

export interface InstructorSessionRow {
  id: string;
  cohort_id: string;
  programme_slug: string;
  cohort_start_date: number;
  module_slug: string;
  module_title: string | null;
  scheduled_at: number;
  meeting_join_url: string | null;     // meeting_host_url (instructor) ?? meeting_url
  status: string;
}

interface RawSessionRow {
  id: string;
  cohort_id: string;
  programme_slug: string;
  cohort_start_date: number;
  module_slug: string;
  module_title: string | null;
  scheduled_at: number;
  meeting_url: string | null;
  meeting_host_url: string | null;
  cohort_meeting_url: string | null;
  cohort_meeting_host_url: string | null;
  status: string;
}

export interface InstructorSessionsResult {
  upcoming: InstructorSessionRow[];
  past: InstructorSessionRow[];
}

/**
 * Все sessions preподa (через slot.instructor_id OR
 * enrollment.lead_instructor_id JOIN на cohort).
 *
 * Возвращает Upcoming (ASC) + Past (DESC LIMIT 30).
 */
export async function listInstructorSessions(
  env: Cloudflare.Env,
  instructorId: string,
  locale: 'en' | 'ru',
): Promise<InstructorSessionsResult> {
  const now = Math.floor(Date.now() / 1000);

  // Все cohort_ids preподa
  const cohortIdsRes = await env.DB.prepare(
    `SELECT DISTINCT c.id
       FROM cohorts c
      WHERE (
        c.slot_id IN (SELECT id FROM slots WHERE instructor_id = ?)
        OR c.id IN (
          SELECT DISTINCT a.cohort_id
            FROM applications a
            JOIN enrollments e ON e.id = a.enrollment_id
           WHERE e.lead_instructor_id = ? AND e.archived_at IS NULL
        )
      )
        AND c.status IN ('open','running','completed')`,
  ).bind(instructorId, instructorId).all<{ id: string }>();

  const cohortIds = cohortIdsRes.results.map((r) => r.id);
  if (cohortIds.length === 0) return { upcoming: [], past: [] };

  const placeholders = cohortIds.map(() => '?').join(',');

  const rows = await env.DB.prepare(
    `SELECT s.id, s.cohort_id, c.programme_id AS programme_slug, c.start_date AS cohort_start_date,
            s.module_slug, m.title AS module_title,
            s.scheduled_at, s.meeting_url, s.meeting_host_url,
            c.meeting_url AS cohort_meeting_url, c.meeting_host_url AS cohort_meeting_host_url,
            s.status
       FROM sessions s
       JOIN cohorts c ON c.id = s.cohort_id
       LEFT JOIN modules m ON m.slug = s.module_slug AND m.locale = ?
      WHERE s.cohort_id IN (${placeholders})
        AND s.status IN ('scheduled','passed','rescheduled')
      ORDER BY s.scheduled_at ASC`,
  ).bind(locale, ...cohortIds).all<RawSessionRow>();

  const mapped: InstructorSessionRow[] = rows.results.map((r) => ({
    id: r.id,
    cohort_id: r.cohort_id,
    programme_slug: r.programme_slug,
    cohort_start_date: r.cohort_start_date,
    module_slug: r.module_slug,
    module_title: r.module_title,
    scheduled_at: r.scheduled_at,
    meeting_join_url: r.meeting_host_url ?? r.meeting_url ?? r.cohort_meeting_host_url ?? r.cohort_meeting_url,
    status: r.status,
  }));

  const upcoming = mapped.filter((s) => s.scheduled_at >= now);
  const past = mapped.filter((s) => s.scheduled_at < now).reverse().slice(0, 30);

  return { upcoming, past };
}
