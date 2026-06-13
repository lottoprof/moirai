/*
 * admin-overview.ts — server helpers для /admin overview-страницы.
 *
 * 5 функций, по одному назначению, чтобы /admin/index.astro оставалась
 * thin. Все queries — индексированные path'ы без table scans:
 *   - cohorts(lead_instructor_id, paid_count, status)
 *   - enrollments(status, enrolled_at)
 *   - user_roles(role, user_id)
 *   - applications(status, created_at)
 *
 * Threshold для overload: running > 2 (см. discussion 2026-06-13).
 */

// ============================================================
// Needs-attention
// ============================================================

export async function countUnassignedCohorts(
  env: Cloudflare.Env,
): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n
       FROM cohorts
      WHERE lead_instructor_id IS NULL
        AND paid_count > 0
        AND status IN ('open', 'running')`,
  ).first<{ n: number }>();
  return row?.n ?? 0;
}

// ============================================================
// Key metrics
// ============================================================

export interface OverviewMetrics {
  active_students: number;
  new_students_7d: number;
  /** running AND paid_count > 0 — реально идут с оплаченными студентами.
   *  Чистого `status='running'` считать нельзя: seed/publish создаёт
   *  open-cohorts на год вперёд, часть может быть помечена running
   *  без студентов (артефакт публикации). См. feedback 2026-06-13. */
  cohorts_running: number;
  /** status='open' — опубликованы для apply (могут быть пустыми). */
  cohorts_open: number;
  active_instructors: number;
  revenue_month_cents: number;
}

export async function fetchOverviewMetrics(
  env: Cloudflare.Env,
): Promise<OverviewMetrics> {
  const now = Math.floor(Date.now() / 1000);
  const sevenDaysAgo = now - 7 * 86400;

  // Start of current month — UTC midnight 1-го числа.
  // Админ-уровень round'ит до дня, ET/UTC отклонение в час не критично.
  const d = new Date();
  const monthStart = Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000);

  const [students, cohorts, instructors, revenue] = await env.DB.batch([
    env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM enrollments
           WHERE status='active' AND archived_at IS NULL) AS active_count,
         (SELECT COUNT(*) FROM enrollments
           WHERE status='active' AND archived_at IS NULL
             AND enrolled_at >= ?) AS new_7d`,
    ).bind(sevenDaysAgo),
    env.DB.prepare(
      `SELECT
         SUM(CASE WHEN status='running' AND paid_count > 0 THEN 1 ELSE 0 END) AS running_n,
         SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) AS open_n
        FROM cohorts
       WHERE status IN ('running','open')`,
    ),
    env.DB.prepare(
      `SELECT COUNT(*) AS n
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
        WHERE ur.role = 'instructor'
          AND u.deactivated_at IS NULL`,
    ),
    env.DB.prepare(
      `SELECT COALESCE(SUM(price_paid_amount), 0) AS cents
         FROM enrollments
        WHERE enrolled_at >= ?`,
    ).bind(monthStart),
  ]);

  const studentsRow = students.results[0] as { active_count: number; new_7d: number } | undefined;
  const cohortsRow = cohorts.results[0] as { running_n: number | null; open_n: number | null } | undefined;
  const instructorsRow = instructors.results[0] as { n: number } | undefined;
  const revenueRow = revenue.results[0] as { cents: number } | undefined;

  return {
    active_students: studentsRow?.active_count ?? 0,
    new_students_7d: studentsRow?.new_7d ?? 0,
    cohorts_running: cohortsRow?.running_n ?? 0,
    cohorts_open: cohortsRow?.open_n ?? 0,
    active_instructors: instructorsRow?.n ?? 0,
    revenue_month_cents: revenueRow?.cents ?? 0,
  };
}

// ============================================================
// Instructor workload
// ============================================================

export interface InstructorWorkloadRow {
  user_id: string;
  name: string | null;
  email: string;
  running_cohorts: number;
  open_cohorts: number;
  pending_homework: number;
  next_session_at: number | null;
}

export async function listInstructorWorkload(
  env: Cloudflare.Env,
): Promise<InstructorWorkloadRow[]> {
  const now = Math.floor(Date.now() / 1000);
  const rows = await env.DB.prepare(
    `SELECT u.id AS user_id, u.email, u.name,
            (SELECT COUNT(*) FROM cohorts c
              WHERE c.lead_instructor_id = u.id
                AND c.status = 'running') AS running_cohorts,
            (SELECT COUNT(*) FROM cohorts c
              WHERE c.lead_instructor_id = u.id
                AND c.status = 'open') AS open_cohorts,
            (SELECT COUNT(*)
               FROM homework_submissions hs
               JOIN enrollments e ON e.id = hs.enrollment_id
              WHERE e.lead_instructor_id = u.id
                AND hs.status = 'pending') AS pending_homework,
            (SELECT MIN(s.scheduled_at)
               FROM sessions s
               JOIN cohorts c ON c.id = s.cohort_id
              WHERE (s.substitute_instructor_id = u.id
                  OR (s.substitute_instructor_id IS NULL
                      AND c.lead_instructor_id = u.id))
                AND s.status IN ('scheduled','rescheduled')
                AND s.scheduled_at > ?) AS next_session_at
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
      WHERE ur.role = 'instructor'
        AND u.deactivated_at IS NULL
      ORDER BY running_cohorts DESC, pending_homework DESC, u.name`,
  ).bind(now).all<InstructorWorkloadRow>();

  return rows.results;
}

export const OVERLOAD_RUNNING_THRESHOLD = 2;

// ============================================================
// Pipeline funnel (7d)
// ============================================================

export interface PipelineFunnel {
  new_apps_7d: number;
  awaiting_payment: number;
  paid: number;
  running: number;
}

export async function fetchPipelineFunnel(
  env: Cloudflare.Env,
): Promise<PipelineFunnel> {
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
  const [newApps, statusCounts] = await env.DB.batch([
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM applications WHERE created_at >= ?`,
    ).bind(sevenDaysAgo),
    env.DB.prepare(
      `SELECT status, COUNT(*) AS n FROM applications
        WHERE status IN ('awaiting_payment','paid','running')
        GROUP BY status`,
    ),
  ]);

  const newRow = newApps.results[0] as { n: number } | undefined;
  const byStatus = new Map<string, number>();
  for (const row of statusCounts.results as { status: string; n: number }[]) {
    byStatus.set(row.status, row.n);
  }

  return {
    new_apps_7d: newRow?.n ?? 0,
    awaiting_payment: byStatus.get('awaiting_payment') ?? 0,
    paid: byStatus.get('paid') ?? 0,
    running: byStatus.get('running') ?? 0,
  };
}
