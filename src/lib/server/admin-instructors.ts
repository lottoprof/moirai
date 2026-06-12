/*
 * admin-instructors.ts — server helpers для admin instructor management
 * (qualifications, cohort assignment, substitute, handover, delete guard).
 *
 * Spec: .agent/plans/done/admin-instructor-management.md +
 *       .agent/plans/active/cohort-conflict-implementation.md (S2/S3).
 */

import { LK_CONFIG } from '../config/lk';

export interface InstructorListRow {
  user_id: string;
  email: string;
  name: string | null;
  qualified_count: number;
  running_count: number;     // status='running' — ведёт сейчас
  upcoming_count: number;    // status='open' — будущие запуски
}

/**
 * Все users с role='instructor' + counts qualified modules + split running/open
 * cohort counts. Для /admin/instructors overview.
 */
export async function listInstructorsWithQualifications(
  env: Cloudflare.Env,
): Promise<InstructorListRow[]> {
  const rows = await env.DB.prepare(
    `SELECT u.id AS user_id, u.email, u.name,
            (SELECT COUNT(*) FROM instructor_qualifications iq WHERE iq.user_id = u.id) AS qualified_count,
            (SELECT COUNT(*) FROM cohorts c WHERE c.lead_instructor_id = u.id AND c.status = 'running') AS running_count,
            (SELECT COUNT(*) FROM cohorts c WHERE c.lead_instructor_id = u.id AND c.status = 'open') AS upcoming_count
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
      WHERE ur.role = 'instructor'
        AND u.deleted_at IS NULL
        AND u.deactivated_at IS NULL
      ORDER BY u.name, u.email`,
  ).all<InstructorListRow>();

  return rows.results;
}

/**
 * Set qualified module slugs для instructor'а (qualifications). Возвращает
 * актуальный snapshot после изменений.
 */
export async function getInstructorQualifications(
  env: Cloudflare.Env,
  userId: string,
): Promise<Set<string>> {
  const rows = await env.DB.prepare(
    `SELECT module_slug FROM instructor_qualifications WHERE user_id = ?`,
  ).bind(userId).all<{ module_slug: string }>();
  return new Set(rows.results.map((r) => r.module_slug));
}

/**
 * Full-replace qualifications для instructor'а. Удаляет всё, что не в slugs,
 * добавляет новое. Возвращает actual snapshot.
 *
 * Idempotent: повторный вызов с тем же набором — no-op.
 */
export async function setInstructorQualifications(
  env: Cloudflare.Env,
  userId: string,
  moduleSlugs: string[],
  grantedBy: string,
): Promise<Set<string>> {
  const now = Math.floor(Date.now() / 1000);
  const existing = await getInstructorQualifications(env, userId);
  // Dedupe target — клиент может прислать дубликаты (например через UI
  // где programme показывает одни и те же модули в разных секциях).
  const target = new Set(moduleSlugs);

  const toDelete = Array.from(existing).filter((s) => !target.has(s));
  const toAdd = Array.from(target).filter((s) => !existing.has(s));

  if (toDelete.length > 0) {
    const placeholders = toDelete.map(() => '?').join(',');
    await env.DB.prepare(
      `DELETE FROM instructor_qualifications
        WHERE user_id = ? AND module_slug IN (${placeholders})`,
    ).bind(userId, ...toDelete).run();
  }

  if (toAdd.length > 0) {
    const stmt = env.DB.prepare(
      `INSERT INTO instructor_qualifications (user_id, module_slug, granted_by, granted_at)
       VALUES (?, ?, ?, ?)`,
    );
    await env.DB.batch(toAdd.map((slug) => stmt.bind(userId, slug, grantedBy, now)));
  }

  return target;
}

export interface QualifiedInstructorCandidate {
  user_id: string;
  email: string;
  name: string | null;
  /** Если задан conflict window — true если у instructor нет live-session
   *  в other active cohort в window. False = занят (но всё равно вернём
   *  в списке для info, UI пометит). */
  available: boolean;
}

/**
 * Найти qualified instructors для набора module_slugs. Если задан
 * conflictWindow — пометит available=false для тех у кого session в окне.
 *
 * `requireAllModules`:
 *   true (default) → qualified по ВСЕМ модулям (для lead_instructor cohort'ы)
 *   false → qualified хотя бы по одному (для substitute single session)
 *
 * `conflictWindow`:
 *   sessionAtSec — unix time когда стартует target session
 *   durationMin  — длительность session (default LK_CONFIG.default_session_duration_min)
 *
 *   Helper внутри padает window до [sessionAtSec - rest, sessionAtSec + dur + rest]
 *   где rest = LK_CONFIG.min_instructor_rest_min (Q6 hard rule, decisions
 *   archive 2026-06-11). Caller не должен знать про rest period.
 */
export async function findQualifiedInstructors(
  env: Cloudflare.Env,
  moduleSlugs: string[],
  opts?: {
    requireAllModules?: boolean;
    conflictWindow?: { sessionAtSec: number; durationMin?: number };
    excludeUserId?: string;
  },
): Promise<QualifiedInstructorCandidate[]> {
  const requireAll = opts?.requireAllModules ?? true;
  if (moduleSlugs.length === 0) return [];

  const slugPlaceholders = moduleSlugs.map(() => '?').join(',');
  const requirementClause = requireAll
    ? `HAVING COUNT(DISTINCT iq.module_slug) = ?`
    : `HAVING COUNT(iq.module_slug) > 0`;
  const requirementBind = requireAll ? [moduleSlugs.length] : [];

  const candidates = await env.DB.prepare(
    `SELECT u.id AS user_id, u.email, u.name
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN instructor_qualifications iq ON iq.user_id = u.id
      WHERE ur.role = 'instructor'
        AND u.deleted_at IS NULL
        AND u.deactivated_at IS NULL
        AND iq.module_slug IN (${slugPlaceholders})
        ${opts?.excludeUserId ? 'AND u.id != ?' : ''}
      GROUP BY u.id, u.email, u.name
      ${requirementClause}
      ORDER BY u.name, u.email`,
  )
    .bind(
      ...moduleSlugs,
      ...(opts?.excludeUserId ? [opts.excludeUserId] : []),
      ...requirementBind,
    )
    .all<{ user_id: string; email: string; name: string | null }>();

  const candidatesList = candidates.results;
  if (candidatesList.length === 0) return [];
  if (!opts?.conflictWindow) {
    return candidatesList.map((c) => ({ ...c, available: true }));
  }

  // Compute window with rest period padding (Q6 hard rule, ≥30 min gap)
  const restSec = LK_CONFIG.min_instructor_rest_min * 60;
  const durSec = (opts.conflictWindow.durationMin
    ?? LK_CONFIG.default_session_duration_min) * 60;
  const fromSec = opts.conflictWindow.sessionAtSec - restSec;
  const toSec = opts.conflictWindow.sessionAtSec + durSec + restSec;

  // Conflict check: у кого есть scheduled live-session в padded window
  const userIds = candidatesList.map((c) => c.user_id);
  const userPlaceholders = userIds.map(() => '?').join(',');
  const conflicts = await env.DB.prepare(
    `SELECT DISTINCT instr.user_id
       FROM (
         SELECT c.lead_instructor_id AS user_id, s.scheduled_at
           FROM sessions s
           JOIN cohorts c ON c.id = s.cohort_id
          WHERE s.status = 'scheduled'
            AND c.lead_instructor_id IN (${userPlaceholders})
            AND s.substitute_instructor_id IS NULL
            AND s.scheduled_at BETWEEN ? AND ?
         UNION ALL
         SELECT s.substitute_instructor_id AS user_id, s.scheduled_at
           FROM sessions s
          WHERE s.status = 'scheduled'
            AND s.substitute_instructor_id IN (${userPlaceholders})
            AND s.scheduled_at BETWEEN ? AND ?
       ) AS instr`,
  ).bind(
    ...userIds, fromSec, toSec,
    ...userIds, fromSec, toSec,
  ).all<{ user_id: string }>();

  const busySet = new Set(conflicts.results.map((r) => r.user_id));
  return candidatesList.map((c) => ({ ...c, available: !busySet.has(c.user_id) }));
}

export interface BlockingCohort {
  cohort_id: string;
  programme_slug: string;
  start_date: number;
  status: string;
}

/**
 * Проверка можно ли удалить аккаунт user'а — если он lead_instructor
 * в active/open cohort'е, блокируем. UI должен направить юзера к admin'у.
 */
export async function checkAccountDeleteBlocked(
  env: Cloudflare.Env,
  userId: string,
): Promise<BlockingCohort[]> {
  const rows = await env.DB.prepare(
    `SELECT id AS cohort_id, programme_id AS programme_slug, start_date, status
       FROM cohorts
      WHERE lead_instructor_id = ?
        AND status IN ('open','running')
      ORDER BY start_date ASC`,
  ).bind(userId).all<BlockingCohort>();

  return rows.results;
}

/**
 * Assign cohort.lead_instructor_id (admin action). Без quolification
 * pre-check — caller обязан фильтровать findQualifiedInstructors'ом.
 * Возвращает true если update прошёл.
 */
export async function assignCohortLead(
  env: Cloudflare.Env,
  cohortId: string,
  instructorUserId: string | null,
): Promise<boolean> {
  const result = await env.DB.prepare(
    `UPDATE cohorts
        SET lead_instructor_id = ?,
            updated_at = unixepoch()
      WHERE id = ?`,
  ).bind(instructorUserId, cohortId).run();
  return result.meta.changes > 0;
}

/**
 * Set sessions.substitute_instructor_id (admin action). Аналогично assignCohortLead.
 */
export async function setSessionSubstitute(
  env: Cloudflare.Env,
  sessionId: string,
  substituteUserId: string | null,
): Promise<boolean> {
  const result = await env.DB.prepare(
    `UPDATE sessions
        SET substitute_instructor_id = ?,
            updated_at = unixepoch()
      WHERE id = ?`,
  ).bind(substituteUserId, sessionId).run();
  return result.meta.changes > 0;
}

/**
 * Все active/open cohorts где user — lead. Для handover UI.
 */
export async function listActiveLeadCohortsForUser(
  env: Cloudflare.Env,
  userId: string,
): Promise<BlockingCohort[]> {
  return checkAccountDeleteBlocked(env, userId); // same query
}

export interface InstructorSlotConflict {
  slot_id: string;
  programme_id: string;
  conflicting_days: string[];     // intersection of requested days with existing slot's days
  time_et: string;
}

/**
 * Q3 (decisions_archive 2026-06-11) — найти конфликты по structural
 * расписанию для instructor'а: existing slots где (day, time_et) совпадает
 * с запрошенным.
 *
 * Используется при создании/редактировании slot'а:
 *   1. Если возвращает не-пустой список — UI hard-block (Q3 = A).
 *   2. Constraint per-instructor: разные instructors могут иметь одинаковое
 *      расписание (параллельные группы — основной use case).
 *
 * @param days   weekday codes ['mon','thu'] для нового/edited slot
 * @param timeEt 'HH:MM' формат
 * @param excludeSlotId  при PATCH — id того же slot'а, чтобы не сравнивать с собой
 */
export async function findInstructorSlotConflicts(
  env: Cloudflare.Env,
  instructorId: string,
  days: string[],
  timeEt: string,
  excludeSlotId?: string,
): Promise<InstructorSlotConflict[]> {
  if (days.length === 0) return [];

  const rows = await env.DB.prepare(
    `SELECT id, programme_id, days_json, time_et
       FROM slots
      WHERE instructor_id = ?
        AND active = 1
        AND time_et = ?
        ${excludeSlotId ? 'AND id != ?' : ''}`,
  )
    .bind(...[instructorId, timeEt, ...(excludeSlotId ? [excludeSlotId] : [])])
    .all<{ id: string; programme_id: string; days_json: string; time_et: string }>();

  const requestedSet = new Set(days);
  const conflicts: InstructorSlotConflict[] = [];
  for (const r of rows.results) {
    let existingDays: string[];
    try { existingDays = JSON.parse(r.days_json) as string[]; }
    catch { continue; }
    const overlap = existingDays.filter((d) => requestedSet.has(d));
    if (overlap.length > 0) {
      conflicts.push({
        slot_id: r.id,
        programme_id: r.programme_id,
        conflicting_days: overlap,
        time_et: r.time_et,
      });
    }
  }
  return conflicts;
}
