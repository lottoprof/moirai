/*
 * GET /api/checkout/mock-complete?application_id=<id>&session_id=mock_cs_<uuid>
 *
 * Stage 14m — mock provider redirect target.
 *
 * Имитирует successful payment webhook'a: запускает processCheckoutSuccess
 * (та же логика что для реального LemonSqueezy webhook'a) и редиректит
 * клиента на /[locale]/checkout/success.
 *
 * Гарантии безопасности:
 *   - Работает только при env.PAYMENT_PROVIDER='mock' (или unset → default mock)
 *   - session_id должен иметь префикс 'mock_cs_'
 *   - application должен принадлежать current user (через session cookie)
 *
 * Когда переключим на LemonSqueezy:
 *   1. env.PAYMENT_PROVIDER='lemonsqueezy' → этот endpoint вернёт 403
 *   2. Real webhook /api/stripe/webhook будет вызывать processCheckoutSuccess
 *      из POST со Stripe-style signature verification
 */

import type { APIRoute } from "astro";
import { verifyRefreshSession } from "../../../lib/server/session";
import { findApplicationById } from "../../../lib/server/applications";
import { findUserById } from "../../../lib/server/user-ops";
import { processCheckoutSuccess } from "../../../lib/server/checkout-process";

export const prerender = false;

export const GET: APIRoute = async ({ request, locals, url }) => {
  const env = locals.runtime.env;

  // 1. Provider gating
  const provider = env.PAYMENT_PROVIDER ?? "mock";
  if (provider !== "mock") {
    return new Response("Not available", { status: 403 });
  }

  // 2. Parse query
  const applicationId = url.searchParams.get("application_id");
  const sessionId = url.searchParams.get("session_id");
  if (!applicationId || !sessionId) {
    return new Response("Missing params", { status: 400 });
  }
  if (!sessionId.startsWith("mock_cs_")) {
    return new Response("Invalid session_id format", { status: 400 });
  }

  // 3. Auth + ownership
  const session = await verifyRefreshSession(env, request);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  const user = await findUserById(env, session.userId);
  if (!user) return new Response("Unauthorized", { status: 401 });

  const application = await findApplicationById(env, applicationId);
  if (!application || application.user_id !== user.id) {
    return new Response("Application not found", { status: 404 });
  }

  // 4. Process payment success (same logic as real webhook)
  const paymentId = `mock_pi_${crypto.randomUUID()}`;
  const result = await processCheckoutSuccess(env, {
    applicationId,
    paymentId,
    request,
    origin: url.origin,
  });

  if (!result.ok) {
    console.error("[mock-complete] processCheckoutSuccess failed:", result.error);
    return Response.redirect(
      `${url.origin}/${user.locale}/dashboard?error=${encodeURIComponent(result.error ?? "generic")}`,
      302,
    );
  }

  // 5. Success → /checkout/success
  return Response.redirect(
    `${url.origin}/${user.locale}/checkout/success?application=${applicationId}`,
    302,
  );
};
