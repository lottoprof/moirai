/*
 * POST /api/apply
 *
 * Apply submit (Stage 14i, см. apply-flow-spec.md шаг 3):
 *   Turnstile → rate-limit → cohort lookup → user upsert →
 *   active-dup check (FLOW-25) → createApplication → createRefreshSession
 *   → welcome email → audit_log → 200 { access_token, redirect }
 *
 * Создаёт immediate session (FLOW-16): HttpOnly cookie + access_token в body.
 * После redirect клиент попадает в /dashboard сразу, без email-click.
 *
 * Welcome email — save-point convenience (FLOW-16). Если клиент потеряет
 * сессию — он может вернуться через /login → "Send me a sign-in link"
 * (FLOW-19, инфраструктура magic-link в Stage 14o).
 *
 * Дубли (FLOW-25):
 *   - existing active application same programme → reject 'duplicate_active'
 *     (admin может transfer/cancel вручную; client redirects на /dashboard)
 *   - completed/cancelled/expired/refunded → allow re-take (partial unique
 *     index пропустит, т.к. status NOT IN active set)
 */

import type { APIRoute } from "astro";
import { z } from "zod";
import { findUserByEmail, createUser } from "../../lib/server/user-ops";
import { verifyTurnstile } from "../../lib/server/turnstile";
import { checkRateLimit, RATE_LIMITS } from "../../lib/server/ratelimit";
import { extractRequestInfo } from "../../lib/server/hash";
import { createRefreshSession } from "../../lib/server/session";
import { signJWT } from "../../lib/server/jwt";
import { logAuth } from "../../lib/server/audit";
import { sendEmail } from "../../lib/server/email";
import { getCohortById } from "../../lib/server/cohorts";
import {
  createApplication,
  findActiveApplicationByUserProgramme,
} from "../../lib/server/applications";

export const prerender = false;

const ApplySchema = z.object({
  cohort_id: z.string().min(1).max(64),
  email: z.string().email().max(254),
  name: z.string().min(1).max(120),
  country: z.string().regex(/^[A-Z]{2}$/).nullable().optional(),
  turnstileToken: z.string().min(1).max(2048),
});

const ACCESS_TTL_SECONDS = 15 * 60;

function jsonError(code: string, status: number): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonOk(body: Record<string, unknown>, cookieHeader: string): Response {
  return new Response(JSON.stringify({ ok: true, ...body }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": cookieHeader,
    },
  });
}

export const POST: APIRoute = async ({ request, locals, url }) => {
  const env = locals.runtime.env;
  const { ip, ua } = extractRequestInfo(request);

  // 1. Parse + validate
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError("invalid_json", 400);
  }
  const parsed = ApplySchema.safeParse(raw);
  if (!parsed.success) return jsonError("invalid_email", 400);
  const { cohort_id, email, name, country, turnstileToken } = parsed.data;

  // 2. Turnstile
  const turnstileOk = await verifyTurnstile(turnstileToken, ip, env);
  if (!turnstileOk) return jsonError("turnstile_failed", 403);

  // 3. Rate-limit (reuse register limits — Apply ≈ registration в плане cost)
  const rlIp = await checkRateLimit(env, `apply:ip:${ip}`, RATE_LIMITS.registerByIp);
  if (!rlIp.allowed) return jsonError("rate_limited", 429);
  const rlEmail = await checkRateLimit(env, `apply:email:${email.toLowerCase()}`, RATE_LIMITS.registerByEmail);
  if (!rlEmail.allowed) return jsonError("rate_limited", 429);

  // 4. Cohort lookup + status check
  const cohort = await getCohortById(env, cohort_id);
  if (!cohort) return jsonError("cohort_unavailable", 404);
  if (cohort.status !== "open") return jsonError("cohort_unavailable", 409);

  // 5. User upsert
  // Locale: для existing user — берём из его профиля; для new — из URL.
  const urlLocaleMatch = url.pathname.match(/^\/(en|ru)\//);
  const fallbackLocale: "en" | "ru" =
    urlLocaleMatch && urlLocaleMatch[1] === "ru" ? "ru" : "en";

  let user = await findUserByEmail(env, email);
  let isNewUser = false;
  if (!user) {
    user = await createUser(env, {
      email,
      name,
      locale: fallbackLocale,
      emailVerified: false,
    });
    isNewUser = true;
  }

  // 6. FLOW-25: active application на эту programme → reject
  const activeExisting = await findActiveApplicationByUserProgramme(
    env,
    user.id,
    cohort.programme_id,
  );
  if (activeExisting) {
    // Не утечка email enumeration — user уже создан (если new), просто говорим
    // 409 + редирект на /dashboard. Client UI знает что делать.
    return jsonError("duplicate_active", 409);
  }

  // 7. INSERT application + cohort.apply_count++
  let application;
  try {
    application = await createApplication(env, {
      userId: user.id,
      programmeId: cohort.programme_id,
      cohortId: cohort.id,
      country: country ?? null,
    });
  } catch (err) {
    // Partial unique index срабатывает если двойной submit за миллисекунды
    console.error("[apply] createApplication failed:", err);
    return jsonError("duplicate_active", 409);
  }

  // 8. createRefreshSession — mode='remember' (7d), Apply подразумевает
  // возврат позже (FLOW-16, FLOW-9 pay anytime)
  const { sessionId, cookieHeader } = await createRefreshSession(
    env,
    user.id,
    request,
    "remember",
  );

  // 9. Access JWT для immediate dashboard
  const accessToken = await signJWT(
    { sub: user.id, sid: sessionId },
    env,
    { expiresIn: `${ACCESS_TTL_SECONDS.toString()}s`, fingerprint: { ip, ua } },
  );

  // 10. Welcome email (save-point convenience)
  const dashboardUrl = `${url.origin}/${user.locale}/dashboard?welcome=1`;
  await sendEmail(env, {
    to: user.email,
    locale: user.locale,
    kind: "apply_welcome",
    actionUrl: dashboardUrl,
    recipientName: user.name,
  });

  // 11. Audit
  await logAuth(env, "apply_submitted", user.id, "password", request, {
    application_id: application.id,
    programme_id: cohort.programme_id,
    cohort_id: cohort.id,
    cohort_start_date: cohort.start_date,
    is_new_user: isNewUser,
    country: country ?? null,
  });
  if (isNewUser) {
    await logAuth(env, "register", user.id, "password", request, {
      via: "apply_flow",
    });
  }

  return jsonOk(
    {
      access_token: accessToken,
      expires_in: ACCESS_TTL_SECONDS,
      redirect: `/${user.locale}/dashboard?welcome=1`,
      application_id: application.id,
    },
    cookieHeader,
  );
};
