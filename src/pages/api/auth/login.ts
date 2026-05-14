/*
 * POST /api/auth/login
 *
 * Login по email+password:
 *   Turnstile → rate-limit → find user → find password method →
 *   verifyPassword → issue refresh session (cookie) + access JWT (body)
 *
 * Все fail-ветки возвращают **generic** `invalid_login` (401) — НЕ
 * различаем "email не существует" / "нет password method" /
 * "неверный пароль". Info-hiding, см. decisions_archive.md 2026-05-12.
 *
 * Под формой login UI рендерит статичный hint:
 *   "Forgot password? Or sign in with Google / Discord."
 * — это покрывает оба кейса (no password method + wrong password)
 * без раскрытия деталей.
 *
 * Response:
 *   200 { ok: true, access_token, expires_in, user }
 *        Set-Cookie: __Host-moirai_refresh=...
 *   401 { error: "invalid_login" }
 *   403 { error: "turnstile_failed" }
 *   429 { error: "rate_limited" }
 */

import type { APIRoute } from "astro";
import { z } from "zod";
import { verifyPassword } from "../../../lib/server/password";
import { findUserByEmail, findAuthMethod, touchAuthMethod } from "../../../lib/server/user-ops";
import { verifyTurnstile } from "../../../lib/server/turnstile";
import { checkRateLimit, RATE_LIMITS } from "../../../lib/server/ratelimit";
import { extractRequestInfo } from "../../../lib/server/hash";
import { createRefreshSession } from "../../../lib/server/session";
import { signJWT } from "../../../lib/server/jwt";
import { logAuth } from "../../../lib/server/audit";

export const prerender = false;

const LoginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
  turnstileToken: z.string().min(1).max(2048),
});

const ACCESS_TTL_SECONDS = 15 * 60;     // 15 min — синхронно с DEFAULT_ACCESS_TTL в jwt.ts

function jsonError(code: string, status: number): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const { ip, ua } = extractRequestInfo(request);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError("invalid_json", 400);
  }
  const parsed = LoginSchema.safeParse(raw);
  if (!parsed.success) return jsonError("invalid_input", 400);
  const { email, password, turnstileToken } = parsed.data;

  // Turnstile
  const turnstileOk = await verifyTurnstile(turnstileToken, ip, env);
  if (!turnstileOk) return jsonError("turnstile_failed", 403);

  // Rate limits
  const rlIp = await checkRateLimit(env, `login:ip:${ip}`, RATE_LIMITS.loginByIp);
  if (!rlIp.allowed) return jsonError("rate_limited", 429);
  const rlEmail = await checkRateLimit(env, `login:email:${email.toLowerCase()}`, RATE_LIMITS.loginByEmail);
  if (!rlEmail.allowed) return jsonError("rate_limited", 429);

  // Lookup user (no-leak — все fail-ветки возвращают invalid_login)
  const user = await findUserByEmail(env, email);
  if (!user) {
    await logAuth(env, "login_failed", null, "password", request, {
      reason: "user_not_found",
    });
    return jsonError("invalid_login", 401);
  }

  const method = await findAuthMethod(env, user.id, "password");
  if (!method?.secret_hash) {
    await logAuth(env, "login_failed", user.id, "password", request, {
      reason: "no_password_method",
    });
    return jsonError("invalid_login", 401);
  }

  const passwordOk = await verifyPassword(password, method.secret_hash);
  if (!passwordOk) {
    await logAuth(env, "login_failed", user.id, "password", request, {
      reason: "bad_password",
    });
    return jsonError("invalid_login", 401);
  }

  // Success: refresh session + access JWT + audit
  const { sessionId, cookieHeader } = await createRefreshSession(env, user.id, request);
  await touchAuthMethod(env, method.id);

  const accessToken = await signJWT(
    { sub: user.id, role: user.role, sid: sessionId },
    env,
    { expiresIn: `${ACCESS_TTL_SECONDS.toString()}s`, fingerprint: { ip, ua } },
  );

  await logAuth(env, "login", user.id, "password", request);

  return new Response(
    JSON.stringify({
      ok: true,
      access_token: accessToken,
      expires_in: ACCESS_TTL_SECONDS,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        locale: user.locale,
        role: user.role,
        email_verified: user.email_verified_at !== null,
      },
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": cookieHeader,
      },
    },
  );
};
