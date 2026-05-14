/*
 * POST /api/auth/register
 *
 * Регистрация по email+password:
 *   Turnstile → rate-limit → strength check → email collision →
 *   hash password → INSERT user + auth_methods(password) →
 *   issue verify token → send email (stub) → return 201
 *
 * Email НЕ верифицируется автоматически — пользователь должен пройти
 * по ссылке из письма (см. /api/auth/verify-email). До верификации
 * login работает, но email-зависимые операции (apply, payment) будут
 * блокироваться на app-уровне.
 *
 * Идемпотентность: повторный register с тем же email возвращает 409
 * `email_exists` (не утекает: мы информируем что email занят — это
 * accepted UX trade-off).
 */

import type { APIRoute } from "astro";
import { z } from "zod";
import { hashPassword, validatePasswordStrength } from "../../../lib/server/password";
import { findUserByEmail, createUser, linkAuthMethod } from "../../../lib/server/user-ops";
import { verifyTurnstile } from "../../../lib/server/turnstile";
import { checkRateLimit, RATE_LIMITS } from "../../../lib/server/ratelimit";
import { extractRequestInfo } from "../../../lib/server/hash";
import { createVerifyToken } from "../../../lib/server/verify-tokens";
import { sendEmail } from "../../../lib/server/email";
import { logAuth } from "../../../lib/server/audit";

export const prerender = false;

const RegisterSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
  name: z.string().min(1).max(120).optional(),
  locale: z.enum(["en", "ru"]),
  turnstileToken: z.string().min(1).max(2048),
});

function jsonError(code: string, status: number, extra?: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ error: code, ...extra }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonOk(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify({ ok: true, ...body }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async ({ request, locals, url }) => {
  const env = locals.runtime.env;
  const { ip } = extractRequestInfo(request);

  // 1. Parse body
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError("invalid_json", 400);
  }
  const parsed = RegisterSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError("invalid_input", 400, { issues: parsed.error.issues });
  }
  const { email, password, name, locale, turnstileToken } = parsed.data;

  // 2. Turnstile
  const turnstileOk = await verifyTurnstile(turnstileToken, ip, env);
  if (!turnstileOk) return jsonError("turnstile_failed", 403);

  // 3. Rate limits (IP + email буддингом)
  const rlIp = await checkRateLimit(env, `register:ip:${ip}`, RATE_LIMITS.registerByIp);
  if (!rlIp.allowed) return jsonError("rate_limited", 429);
  const rlEmail = await checkRateLimit(env, `register:email:${email.toLowerCase()}`, RATE_LIMITS.registerByEmail);
  if (!rlEmail.allowed) return jsonError("rate_limited", 429);

  // 4. Password strength
  const pwErr = validatePasswordStrength(password);
  if (pwErr) return jsonError(pwErr.code, 400, { message: pwErr.message });

  // 5. Email collision
  const existing = await findUserByEmail(env, email);
  if (existing) {
    await logAuth(env, "login_failed", null, "password", request, {
      reason: "email_exists_on_register",
      attempted_email_domain: email.split("@")[1] ?? "",
    });
    return jsonError("email_exists", 409);
  }

  // 6. Create user + password method
  const passwordHash = await hashPassword(password);
  const user = await createUser(env, { email, name, locale, emailVerified: false });
  await linkAuthMethod(env, {
    userId: user.id,
    kind: "password",
    secretHash: passwordHash,
  });

  // 7. Issue verify token + send email
  const token = await createVerifyToken(env, {
    kind: "email_verify",
    userId: user.id,
    email: user.email,
    locale: user.locale,
  });
  const actionUrl = `${url.origin}/${user.locale}/verify-email?token=${token}`;
  await sendEmail(env, {
    to: user.email,
    locale: user.locale,
    kind: "verify",
    actionUrl,
    recipientName: user.name,
  });

  // 8. Audit
  await logAuth(env, "register", user.id, "password", request);

  return jsonOk({ status: "verification_sent", email: user.email }, 201);
};
