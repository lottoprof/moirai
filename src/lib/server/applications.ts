/*
 * Applications — query helpers + status transitions.
 *
 * Stage 14c. Используется в:
 *   - POST /api/apply (createApplication)
 *   - POST /api/stripe/webhook (markAsPaid)
 *   - /admin/applications (list, cancel, transfer, refund)
 *   - scheduled / manual cron (expireOverdue)
 *
 * Уровень абстракции: запросы к D1 + транзитивная логика counter-полей
 * cohorts (apply_count, paid_count). Бизнес-валидация (правила
 * дублирования из FLOW-25) — в endpoint'ах поверх.
 *
 * Counter maintenance — app-side (не триггерами): status transitions
 * сложные, явный transactional batch проще для debug + тестирования.
 *
 * D1 batch semantics: env.DB.batch([...]) применяет все statements
 * атомарно — либо все ок, либо ничего. Используем для INSERT+UPDATE
 * пар где порядок важен.
 */

import type {
  ApplicationRow,
  ApplicationStatus,
} from "../../../db/types";

const APP_COLUMNS = `
  id, user_id, programme_id, cohort_id, enrollment_id, status,
  country, marketing_opt_in, age_confirmed,
  terms_version, refund_version, privacy_version,
  stripe_session_id, stripe_payment_id, amount_cents, currency,
  created_at, updated_at
`;

/** Status'ы которые считаются "active" — занимают место в cohort'е. */
const ACTIVE_STATUSES: readonly ApplicationStatus[] = [
  "awaiting_payment",
  "paid",
  "running",
] as const;

function isActive(status: ApplicationStatus): boolean {
  return (ACTIVE_STATUSES as readonly string[]).includes(status);
}

// ============================================================
// SELECT
// ============================================================

/** SELECT application by id. */
export async function findApplicationById(
  env: Cloudflare.Env,
  id: string,
): Promise<ApplicationRow | null> {
  const row = await env.DB.prepare(
    `SELECT ${APP_COLUMNS} FROM applications WHERE id = ?`,
  )
    .bind(id)
    .first<ApplicationRow>();
  return row ?? null;
}

/**
 * Найти активную application user'a на конкретную programme.
 * Active = status IN (awaiting_payment, paid, running).
 *
 * FLOW-25 enforcement: partial unique index гарантирует ≤ 1 row.
 */
export async function findActiveApplicationByUserProgramme(
  env: Cloudflare.Env,
  userId: string,
  programmeId: string,
): Promise<ApplicationRow | null> {
  const row = await env.DB.prepare(
    `SELECT ${APP_COLUMNS}
       FROM applications
       WHERE user_id = ? AND programme_id = ?
         AND status IN ('awaiting_payment', 'paid', 'running')
       LIMIT 1`,
  )
    .bind(userId, programmeId)
    .first<ApplicationRow>();
  return row ?? null;
}

/** SELECT all applications user'a — для /dashboard и /admin user-drawer. */
export async function listApplicationsByUser(
  env: Cloudflare.Env,
  userId: string,
): Promise<ApplicationRow[]> {
  const result = await env.DB.prepare(
    `SELECT ${APP_COLUMNS}
       FROM applications
       WHERE user_id = ?
       ORDER BY created_at DESC`,
  )
    .bind(userId)
    .all<ApplicationRow>();
  return result.results;
}

/** SELECT applications для cohort'ы — для instructor cohort-view + admin filter. */
export async function listApplicationsByCohort(
  env: Cloudflare.Env,
  cohortId: string,
): Promise<ApplicationRow[]> {
  const result = await env.DB.prepare(
    `SELECT ${APP_COLUMNS}
       FROM applications
       WHERE cohort_id = ?
       ORDER BY created_at ASC`,
  )
    .bind(cohortId)
    .all<ApplicationRow>();
  return result.results;
}

// ============================================================
// CREATE — Apply submit
// ============================================================

export interface CreateApplicationInput {
  userId: string;
  programmeId: string;
  cohortId: string;
  country: string | null;
}

/**
 * Создать новую application + увеличить cohort.apply_count.
 *
 * Атомарно через D1 batch. Если partial unique index срабатывает
 * (user уже имеет active application на эту программу) — throw,
 * caller обрабатывает (FLOW-25: показывает "уже подали → dashboard").
 */
export async function createApplication(
  env: Cloudflare.Env,
  input: CreateApplicationInput,
): Promise<ApplicationRow> {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO applications
         (id, user_id, programme_id, cohort_id, status, country,
          marketing_opt_in, age_confirmed, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'awaiting_payment', ?, 0, 0, ?, ?)`,
    ).bind(id, input.userId, input.programmeId, input.cohortId, input.country, now, now),
    env.DB.prepare(
      `UPDATE cohorts SET apply_count = apply_count + 1 WHERE id = ?`,
    ).bind(input.cohortId),
  ]);

  const created = await findApplicationById(env, id);
  if (!created) {
    throw new Error(`createApplication: row inserted but findApplicationById('${id}') returned null`);
  }
  return created;
}

// ============================================================
// STATUS TRANSITIONS
// ============================================================

export interface CheckoutSnapshot {
  termsVersion: string;
  refundVersion: string;
  privacyVersion: string;
  stripeSessionId: string;
  amountCents: number;
  currency: string;
  marketingOptIn: boolean;
  ageConfirmed: boolean;
}

/**
 * UPDATE application snapshot полями со стороны checkout (FLOW-18).
 * Вызывается при инициации Stripe Checkout — фиксирует версии legal
 * docs + согласия. После платежа enrollment_id и stripe_payment_id
 * проставляются в markAsPaid.
 */
export async function attachCheckoutSnapshot(
  env: Cloudflare.Env,
  applicationId: string,
  snap: CheckoutSnapshot,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE applications
       SET terms_version = ?, refund_version = ?, privacy_version = ?,
           stripe_session_id = ?, amount_cents = ?, currency = ?,
           marketing_opt_in = ?, age_confirmed = ?
       WHERE id = ?`,
  )
    .bind(
      snap.termsVersion,
      snap.refundVersion,
      snap.privacyVersion,
      snap.stripeSessionId,
      snap.amountCents,
      snap.currency,
      snap.marketingOptIn ? 1 : 0,
      snap.ageConfirmed ? 1 : 0,
      applicationId,
    )
    .run();
}

/**
 * Перевести application в `paid` после успешного Stripe webhook'а.
 * - UPDATE status + stripe_payment_id + enrollment_id
 * - INCREMENT cohort.paid_count
 *
 * Caller (webhook handler) дополнительно:
 *   - создаёт enrollment row (передаёт сюда enrollment_id)
 *   - пишет audit_log event='offer_accepted'
 *   - шлёт confirmation email
 */
export async function markAsPaid(
  env: Cloudflare.Env,
  applicationId: string,
  stripePaymentId: string,
  enrollmentId: string,
): Promise<void> {
  const app = await findApplicationById(env, applicationId);
  if (!app) throw new Error(`markAsPaid: application '${applicationId}' not found`);
  if (app.status !== "awaiting_payment") {
    // Idempotency: webhook может прийти дважды. Если уже paid — no-op.
    if (app.status === "paid") return;
    throw new Error(`markAsPaid: application '${applicationId}' status='${app.status}', expected 'awaiting_payment'`);
  }

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE applications
         SET status = 'paid',
             stripe_payment_id = ?,
             enrollment_id = ?
         WHERE id = ?`,
    ).bind(stripePaymentId, enrollmentId, applicationId),
    env.DB.prepare(
      `UPDATE cohorts SET paid_count = paid_count + 1 WHERE id = ?`,
    ).bind(app.cohort_id),
  ]);
}

/**
 * Cancel application — user сам или admin. Если был active —
 * decrement cohort.apply_count (и paid_count если уже paid).
 *
 * Caller пишет audit_log event='application_cancelled' с reason.
 */
export async function cancelApplication(
  env: Cloudflare.Env,
  applicationId: string,
): Promise<void> {
  const app = await findApplicationById(env, applicationId);
  if (!app) throw new Error(`cancelApplication: application '${applicationId}' not found`);
  if (app.status === "cancelled" || app.status === "expired" || app.status === "refunded" || app.status === "completed") {
    return; // idempotent
  }

  const wasActive = isActive(app.status);
  const wasPaid = app.status === "paid" || app.status === "running";

  const stmts = [
    env.DB.prepare(
      `UPDATE applications SET status = 'cancelled' WHERE id = ?`,
    ).bind(applicationId),
  ];
  if (wasActive) {
    stmts.push(
      env.DB.prepare(
        `UPDATE cohorts SET apply_count = apply_count - 1 WHERE id = ?`,
      ).bind(app.cohort_id),
    );
  }
  if (wasPaid) {
    stmts.push(
      env.DB.prepare(
        `UPDATE cohorts SET paid_count = paid_count - 1 WHERE id = ?`,
      ).bind(app.cohort_id),
    );
  }
  await env.DB.batch(stmts);
}

/**
 * Перевод awaiting_payment application'ов в `expired` когда cohort
 * стартовала без оплаты. Cron / manual call в /admin.
 *
 * Возвращает кол-во expired applications. Decrement counter не нужен —
 * cohort уже стартовала, apply_count за неё нерелевантен после старта.
 */
export async function expireOverdueApplications(
  env: Cloudflare.Env,
): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const result = await env.DB.prepare(
    `UPDATE applications
       SET status = 'expired'
       WHERE status = 'awaiting_payment'
         AND cohort_id IN (
           SELECT id FROM cohorts WHERE start_date <= ?
         )`,
  )
    .bind(now)
    .run();
  return result.meta.changes;
}

/**
 * Transfer application на другую cohort'у (FLOW-25, admin action).
 * Old cohort.apply_count--, new cohort.apply_count++. Только для
 * awaiting_payment (paid transfers — отдельный refund+rebook flow).
 *
 * Caller пишет audit_log event='application_transferred'.
 */
export async function transferApplication(
  env: Cloudflare.Env,
  applicationId: string,
  newCohortId: string,
): Promise<void> {
  const app = await findApplicationById(env, applicationId);
  if (!app) throw new Error(`transferApplication: application '${applicationId}' not found`);
  if (app.status !== "awaiting_payment") {
    throw new Error(`transferApplication: only awaiting_payment can be transferred; status='${app.status}'`);
  }
  if (app.cohort_id === newCohortId) return; // no-op

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE applications SET cohort_id = ? WHERE id = ?`,
    ).bind(newCohortId, applicationId),
    env.DB.prepare(
      `UPDATE cohorts SET apply_count = apply_count - 1 WHERE id = ?`,
    ).bind(app.cohort_id),
    env.DB.prepare(
      `UPDATE cohorts SET apply_count = apply_count + 1 WHERE id = ?`,
    ).bind(newCohortId),
  ]);
}

/**
 * Mark application as refunded после Stripe refund. Decrement paid_count.
 * Caller (admin endpoint) пишет audit_log event='refund_processed'.
 */
export async function markAsRefunded(
  env: Cloudflare.Env,
  applicationId: string,
): Promise<void> {
  const app = await findApplicationById(env, applicationId);
  if (!app) throw new Error(`markAsRefunded: application '${applicationId}' not found`);
  if (app.status === "refunded") return; // idempotent
  if (app.status !== "paid" && app.status !== "running") {
    throw new Error(`markAsRefunded: only paid/running can be refunded; status='${app.status}'`);
  }

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE applications SET status = 'refunded' WHERE id = ?`,
    ).bind(applicationId),
    env.DB.prepare(
      `UPDATE cohorts SET paid_count = paid_count - 1 WHERE id = ?`,
    ).bind(app.cohort_id),
  ]);
}

// ============================================================
// Refund window calculator (FLOW-9a)
// ============================================================

export type RefundTier = "full" | "half" | "credit_only" | "none";

/**
 * Вычислить refund tier для application по 3-окнам (FLOW-9a):
 *   - до T-14 дней: 100% (full)
 *   - T-14 до T-7: 50% (half)
 *   - T-7 до T:    credit_only
 *   - после T:     none
 *
 * T = cohort.start_date. Если application не оплачено / уже refunded —
 * caller обрабатывает отдельно (refund невозможен).
 */
export function computeRefundTier(
  cohortStartDate: number,
  nowSec: number = Math.floor(Date.now() / 1000),
): RefundTier {
  const DAY = 24 * 3600;
  const t14 = cohortStartDate - 14 * DAY;
  const t7 = cohortStartDate - 7 * DAY;

  if (nowSec < t14) return "full";
  if (nowSec < t7) return "half";
  if (nowSec < cohortStartDate) return "credit_only";
  return "none";
}
