/*
 * POST /api/admin/applications/[id]/refund (Stage 14s)
 *
 * Admin-triggered refund по FLOW-9a 3-окнам:
 *   - До T-14 → 100% refund (full)
 *   - T-14 до T-7 → 50% refund (half)
 *   - T-7 до T → credit-only (no cash; admin вручную credits next cohort)
 *   - После T → none (no refund per EU Directive 2011/83 Art. 16(m))
 *
 * Flow:
 *   1. Admin guard (requireRoleApi)
 *   2. Application + cohort lookup
 *   3. Validate status (paid/running)
 *   4. computeRefundTier по cohort.start_date
 *   5. Если 'none' → reject 'refund_window_closed'
 *   6. provider.refund() (для mock — фейк-success)
 *   7. markAsRefunded (UPDATE application + cohort.paid_count--)
 *   8. audit_log event='refund_processed' (FLOW-24)
 *   9. Response { tier, amount_cents, refund_id }
 *
 * Опционально override через body: { tier: 'full|half|credit_only|none', reason: string }.
 * Override логируется в audit (admin manual override window).
 */

import type { APIRoute } from "astro";
import { z } from "zod";
import { requireRoleApi } from "../../../../../lib/server/guards";
import {
  findApplicationById,
  markAsRefunded,
  computeRefundTier,
  type RefundTier,
} from "../../../../../lib/server/applications";
import { getCohortById } from "../../../../../lib/server/cohorts";
import { getPaymentProvider } from "../../../../../lib/server/payment";
import { logAuth } from "../../../../../lib/server/audit";
import { findUserById } from "../../../../../lib/server/user-ops";
import { sendEmail } from "../../../../../lib/server/email";

export const prerender = false;

const RefundSchema = z.object({
  /** Override autoсomputed tier (admin discretion). Если undefined — use computed. */
  tier_override: z.enum(["full", "half", "credit_only", "none"]).optional(),
  reason: z.string().min(1).max(500).optional(),
});

function jsonError(code: string, status: number): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonOk(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ ok: true, ...body }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function tierToFraction(tier: RefundTier): number {
  if (tier === "full") return 1;
  if (tier === "half") return 0.5;
  // credit_only / none — no cash refund (caller обрабатывает credit отдельно)
  return 0;
}

export const POST: APIRoute = async (ctx) => {
  // 1. Admin guard
  const adminOrRes = await requireRoleApi(ctx, "admin");
  if (adminOrRes instanceof Response) return adminOrRes;
  const admin = adminOrRes;

  const { request, locals, params } = ctx;
  const env = locals.runtime.env;
  const applicationId = params.id;
  if (!applicationId) return jsonError("invalid_application", 400);

  // 2. Parse override
  let raw: unknown = {};
  try { raw = await request.json(); } catch { /* allow empty body */ }
  const parsed = RefundSchema.safeParse(raw);
  if (!parsed.success) return jsonError("invalid_input", 400);
  const { tier_override, reason } = parsed.data;

  // 3. Application lookup
  const application = await findApplicationById(env, applicationId);
  if (!application) return jsonError("application_not_found", 404);
  if (application.status !== "paid" && application.status !== "running") {
    return jsonError("application_not_refundable", 409);
  }

  // 4. Cohort + tier
  const cohort = await getCohortById(env, application.cohort_id);
  if (!cohort) return jsonError("cohort_not_found", 500);

  const computedTier = computeRefundTier(cohort.start_date);
  const effectiveTier = tier_override ?? computedTier;

  if (effectiveTier === "none" && tier_override !== "none") {
    return jsonError("refund_window_closed", 409);
  }

  // 5. Provider refund (для credit_only / none — провайдера не вызываем)
  let providerRefundId: string | null = null;
  let refundAmountCents = 0;
  if (effectiveTier === "full" || effectiveTier === "half") {
    if (!application.stripe_payment_id) {
      return jsonError("no_payment_to_refund", 409);
    }
    const fraction = tierToFraction(effectiveTier);
    refundAmountCents = Math.floor((application.amount_cents ?? 0) * fraction);

    const provider = getPaymentProvider(env);
    try {
      const result = await provider.refund(env, application.stripe_payment_id, refundAmountCents);
      providerRefundId = result.refund_id;
    } catch (err) {
      console.error("[admin/refund] provider.refund failed:", err);
      return jsonError("provider_failed", 502);
    }
  }

  // 6. markAsRefunded — update D1 (idempotent if already refunded)
  try {
    await markAsRefunded(env, application.id);
  } catch (err) {
    console.error("[admin/refund] markAsRefunded failed:", err);
    return jsonError("db_error", 500);
  }

  // 7. Send refund confirmation email
  const user = await findUserById(env, application.user_id);
  if (user) {
    const url = new URL(request.url);
    await sendEmail(env, {
      to: user.email,
      locale: user.locale,
      kind: "refund_processed",
      actionUrl: `${url.origin}/${user.locale}/apply`,
      recipientName: user.name,
    });
  }

  // 8. Audit log (FLOW-24)
  await logAuth(env, "refund_processed", application.user_id, "password", request, {
    application_id: application.id,
    cohort_id: cohort.id,
    cohort_start_date: cohort.start_date,
    computed_tier: computedTier,
    effective_tier: effectiveTier,
    tier_overridden: tier_override !== undefined,
    override_reason: reason ?? null,
    refund_amount_cents: refundAmountCents,
    original_amount_cents: application.amount_cents,
    currency: application.currency,
    provider_refund_id: providerRefundId,
    stripe_payment_id: application.stripe_payment_id,
    by_admin_id: admin.id,
  });

  return jsonOk({
    application_id: application.id,
    tier: effectiveTier,
    refund_amount_cents: refundAmountCents,
    currency: application.currency,
    provider_refund_id: providerRefundId,
  });
};
