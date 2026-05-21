/*
 * Shared checkout post-payment logic (Stage 14m).
 *
 * Вызывается из webhook handler'ов (LemonSqueezy + Mock) когда provider
 * подтверждает успешный платёж. Идемпотентно — повторный webhook со
 * тем же payment_id → no-op (markAsPaid внутри это обрабатывает).
 *
 * Шаги:
 *   1. Lookup application (+ ownership/status check)
 *   2. Lookup cohort + programme
 *   3. INSERT enrollments row (snapshot programme + lead_instructor from slot)
 *   4. markAsPaid (UPDATE application + cohort.paid_count++) — атомарно
 *   5. audit_log event='offer_accepted' с полным consent snapshot (FLOW-2 / E5)
 *   6. audit_log event='application_status_changed' (awaiting_payment → paid)
 *   7. Send payment_confirmation email
 *
 * Возвращает { ok, applicationId, enrollmentId } для caller'a (webhook
 * шлёт 200, mock-complete делает redirect).
 */

import { getEntry } from "astro:content";
import {
  findApplicationById,
  markAsPaid,
} from "./applications";
import { getCohortById } from "./cohorts";
import { findUserById } from "./user-ops";
import { logAuth } from "./audit";
import { sendEmail } from "./email";

export interface ProcessCheckoutSuccessInput {
  applicationId: string;
  paymentId: string;
  request: Request;
  origin: string;
}

export interface ProcessCheckoutSuccessResult {
  ok: boolean;
  alreadyPaid?: boolean;
  enrollmentId?: string;
  error?: string;
}

export async function processCheckoutSuccess(
  env: Cloudflare.Env,
  input: ProcessCheckoutSuccessInput,
): Promise<ProcessCheckoutSuccessResult> {
  const application = await findApplicationById(env, input.applicationId);
  if (!application) return { ok: false, error: "application_not_found" };

  // Idempotency: повторный webhook → already paid → no-op
  if (application.status === "paid" || application.status === "running" || application.status === "completed") {
    return { ok: true, alreadyPaid: true };
  }
  if (application.status !== "awaiting_payment") {
    return { ok: false, error: `unexpected_status_${application.status}` };
  }

  const cohort = await getCohortById(env, application.cohort_id);
  if (!cohort) return { ok: false, error: "cohort_not_found" };

  const user = await findUserById(env, application.user_id);
  if (!user) return { ok: false, error: "user_not_found" };

  const programme = await getEntry("programmes", `${application.programme_id}.${user.locale}`);
  if (!programme) return { ok: false, error: "programme_not_found" };

  // 1. INSERT enrollments — snapshot price + features
  const enrollmentId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  // lead_instructor_id — берём из slot если назначен (slot хранится у cohort)
  // SELECT slots.instructor_id WHERE id = cohort.slot_id (avoid extra trip — use slot_id only)
  const slotRow = await env.DB.prepare(`SELECT instructor_id FROM slots WHERE id = ?`)
    .bind(cohort.slot_id)
    .first<{ instructor_id: string | null }>();
  const leadInstructorId = slotRow?.instructor_id ?? null;

  const featuresJson = JSON.stringify(programme.data.features);
  await env.DB.prepare(
    `INSERT INTO enrollments
       (id, user_id, programme_slug, status, price_paid_amount, price_paid_currency,
        features_json, lead_instructor_id, enrolled_at, created_at, updated_at)
     VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      enrollmentId,
      user.id,
      application.programme_id,
      application.amount_cents ?? programme.data.price_amount,
      application.currency ?? programme.data.price_currency,
      featuresJson,
      leadInstructorId,
      now,
      now,
      now,
    )
    .run();

  // 1b. INSERT enrollment_modules — копируем programme.modules как ordered list.
  // added_by = system (используем user.id как marker; Sprint 2 — system-user
  // через явный constant). Lazy progress: module_progress rows создаются
  // при первом open страницы модуля (см. student-modules.ts).
  const modules = programme.data.modules;
  if (modules.length > 0) {
    const stmts = modules.map((slug: string, idx: number) =>
      env.DB.prepare(
        `INSERT INTO enrollment_modules (enrollment_id, module_slug, order_idx, added_by, added_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(enrollmentId, slug, idx, user.id, now),
    );
    await env.DB.batch(stmts);
  }

  // 2. markAsPaid (atomic: UPDATE applications + cohort.paid_count++)
  await markAsPaid(env, application.id, input.paymentId, enrollmentId);

  // 3. audit_log offer_accepted (FLOW-2 / E5) — GDPR consent proof
  await logAuth(env, "offer_accepted", user.id, "password", input.request, {
    application_id: application.id,
    enrollment_id: enrollmentId,
    programme_id: application.programme_id,
    cohort_id: application.cohort_id,
    cohort_start_date: cohort.start_date,
    payment_id: input.paymentId,
    amount_cents: application.amount_cents,
    currency: application.currency,
    terms_version: application.terms_version,
    refund_version: application.refund_version,
    privacy_version: application.privacy_version,
    age_confirmed: application.age_confirmed === 1,
    marketing_opt_in: application.marketing_opt_in === 1,
  });

  // 4. audit_log status_changed
  await logAuth(env, "application_status_changed", user.id, "password", input.request, {
    application_id: application.id,
    from_status: "awaiting_payment",
    to_status: "paid",
    actor: "system",
    via: "payment_webhook",
  });

  // 5. Confirmation email
  const dashboardUrl = `${input.origin}/${user.locale}/dashboard`;
  await sendEmail(env, {
    to: user.email,
    locale: user.locale,
    kind: "payment_confirmation",
    actionUrl: dashboardUrl,
    recipientName: user.name,
  });

  return { ok: true, enrollmentId };
}
