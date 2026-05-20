/*
 * POST /api/auth/magic-link/request (Stage 14o, FLOW-19)
 *
 * Запрос на magic-link для входа без пароля.
 *
 * Flow:
 *   Turnstile → rate-limit → find user by email → generate token →
 *   send email → возвращаем generic ok (no-leak: тот же ответ для
 *   несуществующих email'ов).
 *
 * Threat model:
 *   - Атакующий не получает доступ просто по знанию email — letter уходит
 *     ВЛАДЕЛЬЦУ inbox'a. Чтобы войти, нужен реальный inbox-access.
 *   - Identity-проверка через клик из email = ownership of email proof.
 *     Эквивалент password-reset с точки зрения security model.
 *
 * Response:
 *   200 { ok: true } всегда (как password-reset/request) — нет
 *   email enumeration vector.
 *   403 { error: "turnstile_failed" }
 *   429 { error: "rate_limited" }
 */

import type { APIRoute } from "astro";
import { z } from "zod";
import { findUserByEmail } from "../../../../lib/server/user-ops";
import { verifyTurnstile } from "../../../../lib/server/turnstile";
import { checkRateLimit, RATE_LIMITS } from "../../../../lib/server/ratelimit";
import { extractRequestInfo } from "../../../../lib/server/hash";
import { createVerifyToken, TTL_MAGIC_LINK } from "../../../../lib/server/verify-tokens";
import { sendEmail } from "../../../../lib/server/email";
import { logAuth } from "../../../../lib/server/audit";

export const prerender = false;

const RequestSchema = z.object({
  email: z.string().email().max(254),
  turnstileToken: z.string().min(1).max(2048),
  return_to: z.string().max(2048).optional(),
});

function jsonError(code: string, status: number): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonOk(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async ({ request, locals, url }) => {
  const env = locals.runtime.env;
  const { ip } = extractRequestInfo(request);

  // 1. Parse
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError("invalid_json", 400);
  }
  const parsed = RequestSchema.safeParse(raw);
  if (!parsed.success) return jsonError("invalid_input", 400);
  const { email, turnstileToken, return_to } = parsed.data;

  // 2. Turnstile
  const ok = await verifyTurnstile(turnstileToken, ip, env);
  if (!ok) return jsonError("turnstile_failed", 403);

  // 3. Rate-limit (reuse password-reset limits если есть, иначе loginByEmail)
  const rlIp = await checkRateLimit(env, `magic:ip:${ip}`, RATE_LIMITS.loginByIp);
  if (!rlIp.allowed) return jsonError("rate_limited", 429);
  const rlEmail = await checkRateLimit(env, `magic:email:${email.toLowerCase()}`, RATE_LIMITS.loginByEmail);
  if (!rlEmail.allowed) return jsonError("rate_limited", 429);

  // 4. Lookup user (no-leak — always 200)
  const user = await findUserByEmail(env, email);
  if (!user) {
    await logAuth(env, "login_failed", null, "password", request, {
      reason: "magic_link_unknown_email",
    });
    return jsonOk();
  }
  if (user.deactivated_at !== null) {
    await logAuth(env, "login_failed", user.id, "password", request, {
      reason: "magic_link_deactivated",
    });
    return jsonOk();
  }

  // 5. Token + email
  const token = await createVerifyToken(env, {
    kind: "magic_link",
    userId: user.id,
    email: user.email,
    locale: user.locale,
  }, TTL_MAGIC_LINK);

  const returnToParam = return_to ? `&return_to=${encodeURIComponent(return_to)}` : "";
  const actionUrl = `${url.origin}/api/auth/magic-link/confirm?token=${token}${returnToParam}`;

  await sendEmail(env, {
    to: user.email,
    locale: user.locale,
    kind: "magic_link",
    actionUrl,
    recipientName: user.name,
  });

  return jsonOk();
};
