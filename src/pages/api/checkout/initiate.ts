/*
 * POST /api/checkout/initiate (Stage 14l)
 *
 * Создаёт payment session через PaymentProvider abstraction.
 *
 * Flow (apply-flow-spec шаг 5, FLOW-18):
 *   1. Auth-guard + application ownership check + status='awaiting_payment'
 *   2. Validate consents (terms+age required, marketing optional)
 *   3. Set password (если ещё не задан + validatePasswordStrength)
 *   4. Save marketing_opt_in на user (users.marketing_opt_in)
 *   5. Resolve legal doc versions (Content Collections)
 *   6. attachCheckoutSnapshot — фиксируем version'ы + amount/currency
 *      + age_confirmed + marketing_opt_in на application
 *   7. provider.createCheckoutSession → URL
 *   8. Response { url } → клиент redirected
 *
 * Audit (на webhook success — отдельно): event='offer_accepted' с
 * полным snapshot для GDPR consent proof (FLOW-2 / E5).
 */

import type { APIRoute } from "astro";
import { z } from "zod";
import { getEntry } from "astro:content";
import { verifyRefreshSession } from "../../../lib/server/session";
import { findUserById, findAuthMethod, linkAuthMethod } from "../../../lib/server/user-ops";
import { findApplicationById, attachCheckoutSnapshot } from "../../../lib/server/applications";
import { getCohortById } from "../../../lib/server/cohorts";
import { hashPassword, validatePasswordStrength } from "../../../lib/server/password";
import { getPaymentProvider } from "../../../lib/server/payment";

export const prerender = false;

const InitiateSchema = z.object({
  application_id: z.string().min(1).max(64),
  password: z.string().min(1).max(256).optional(),
  accept_terms: z.boolean(),
  age_confirmed: z.boolean(),
  marketing_opt_in: z.boolean().optional(),
});

function jsonError(code: string, status: number): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async ({ request, locals, url }) => {
  const env = locals.runtime.env;

  // 1. Parse + validate
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError("invalid_json", 400);
  }
  const parsed = InitiateSchema.safeParse(raw);
  if (!parsed.success) return jsonError("invalid_input", 400);
  const { application_id, password, accept_terms, age_confirmed, marketing_opt_in } = parsed.data;

  // 2. Required consents (FLOW-18)
  if (!accept_terms) return jsonError("consent_required", 400);
  if (!age_confirmed) return jsonError("age_required", 400);

  // 3. Auth-guard
  const session = await verifyRefreshSession(env, request);
  if (!session) return jsonError("unauthorized", 401);
  const user = await findUserById(env, session.userId);
  if (!user) return jsonError("unauthorized", 401);

  // 4. Application lookup + ownership + status
  const application = await findApplicationById(env, application_id);
  if (!application || application.user_id !== user.id) return jsonError("application_not_found", 404);
  if (application.status !== "awaiting_payment") return jsonError("application_state_invalid", 409);

  // 5. Cohort still open?
  const cohort = await getCohortById(env, application.cohort_id);
  if (!cohort || cohort.status !== "open") return jsonError("cohort_unavailable", 409);

  // 6. Password setup (если ещё не задан)
  const existingPasswordMethod = await findAuthMethod(env, user.id, "password");
  if (!existingPasswordMethod?.secret_hash) {
    if (!password) return jsonError("password_required", 400);
    const pwErr = validatePasswordStrength(password);
    if (pwErr) return jsonError(`password_${pwErr.code}`, 400);
    const hash = await hashPassword(password);
    await linkAuthMethod(env, {
      userId: user.id,
      kind: "password",
      secretHash: hash,
    });
  }

  // 7. Save marketing opt-in on user
  if (typeof marketing_opt_in === "boolean") {
    await env.DB.prepare(`UPDATE users SET marketing_opt_in = ? WHERE id = ?`)
      .bind(marketing_opt_in ? 1 : 0, user.id)
      .run();
  }

  // 8. Resolve legal doc versions (FLOW-2 / E5)
  const programme = await getEntry("programmes", `${application.programme_id}.${user.locale}`);
  if (!programme) return jsonError("programme_not_found", 500);

  const [termsEntry, refundEntry, privacyEntry] = await Promise.all([
    getEntry("legal", `terms.${user.locale}`),
    getEntry("legal", `refund.${user.locale}`),
    getEntry("legal", `privacy.${user.locale}`),
  ]);
  const termsVersion = termsEntry?.data.version ?? "0.0";
  const refundVersion = refundEntry?.data.version ?? "0.0";
  const privacyVersion = privacyEntry?.data.version ?? "0.0";

  // 9. Provider checkout session
  const provider = getPaymentProvider(env);
  const successUrl = `${url.origin}/${user.locale}/checkout/success?application=${application.id}`;
  const cancelUrl = `${url.origin}/${user.locale}/dashboard`;

  let checkout;
  try {
    checkout = await provider.createCheckoutSession({
      application,
      user,
      successUrl,
      cancelUrl,
      items: [
        {
          name: programme.data.title,
          description: programme.data.summary,
          amount_cents: programme.data.price_amount,
          currency: programme.data.price_currency,
          quantity: 1,
        },
      ],
      metadata: {
        application_id: application.id,
        programme_id: application.programme_id,
        cohort_id: application.cohort_id,
        user_id: user.id,
      },
    });
  } catch (err) {
    console.error("[checkout/initiate] provider failed:", err);
    return jsonError("provider_failed", 502);
  }

  // 10. Attach snapshot (FLOW-2, E5)
  await attachCheckoutSnapshot(env, application.id, {
    termsVersion,
    refundVersion,
    privacyVersion,
    stripeSessionId: checkout.session_id,
    amountCents: programme.data.price_amount,
    currency: programme.data.price_currency,
    marketingOptIn: marketing_opt_in === true,
    ageConfirmed: true,
  });

  return new Response(
    JSON.stringify({ ok: true, url: checkout.url }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
