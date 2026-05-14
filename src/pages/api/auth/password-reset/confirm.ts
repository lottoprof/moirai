/*
 * POST /api/auth/password-reset/confirm
 *
 * Завершение сброса пароля по one-time токену из email.
 *   - Consume KV token (`password_reset` kind)
 *   - Validate new password strength
 *   - UPDATE auth_methods.secret_hash
 *   - REVOKE all user sessions (force re-login на всех устройствах —
 *     стандартная защита против compromised account)
 *   - Audit
 *
 * Body: { token, password }
 * Resp:
 *   200 { ok: true }
 *   400 { error: "invalid_token" | "weak_password" }
 *   429 { error: "rate_limited" }
 */

import type { APIRoute } from "astro";
import { z } from "zod";
import {
  hashPassword,
  validatePasswordStrength,
} from "../../../../lib/server/password";
import {
  updatePasswordHash,
  findUserById,
  findAuthMethod,
  linkAuthMethod,
} from "../../../../lib/server/user-ops";
import { consumeVerifyToken } from "../../../../lib/server/verify-tokens";
import { revokeAllUserSessions } from "../../../../lib/server/session";
import { extractRequestInfo } from "../../../../lib/server/hash";
import { checkRateLimit } from "../../../../lib/server/ratelimit";
import { logAuth } from "../../../../lib/server/audit";

export const prerender = false;

const Schema = z.object({
  token: z.string().min(8).max(128),
  password: z.string().min(1).max(256),
});

function jsonError(code: string, status: number, extra?: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ error: code, ...extra }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const { ip } = extractRequestInfo(request);

  // IP-rate-limit (token уже dropp'нется при попытке brute-force,
  // но IP-flood защищаем отдельно)
  const rl = await checkRateLimit(env, `reset:confirm:ip:${ip}`, {
    max: 20,
    windowSec: 3600,
  });
  if (!rl.allowed) return jsonError("rate_limited", 429);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError("invalid_json", 400);
  }
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) return jsonError("invalid_input", 400);
  const { token, password } = parsed.data;

  const payload = await consumeVerifyToken(env, token, "password_reset");
  if (!payload) return jsonError("invalid_token", 400);

  // Validate password strength ПОСЛЕ consume — token уже сожжён,
  // weak_password не позволяет «угадать» что токен был валиден
  const pwErr = validatePasswordStrength(password);
  if (pwErr) return jsonError(pwErr.code, 400, { message: pwErr.message });

  const user = await findUserById(env, payload.userId);
  if (!user) return jsonError("invalid_token", 400);

  const newHash = await hashPassword(password);

  // Случай "у user был только OAuth, добавляет password через reset" —
  // password method отсутствует, создаём; иначе UPDATE существующего.
  const existing = await findAuthMethod(env, user.id, "password");
  if (existing) {
    await updatePasswordHash(env, user.id, newHash);
  } else {
    await linkAuthMethod(env, {
      userId: user.id,
      kind: "password",
      secretHash: newHash,
    });
  }

  // Force re-login на всех устройствах — стандартная защита после reset
  await revokeAllUserSessions(env, user.id);

  await logAuth(env, "password_reset", user.id, "password", request, {
    stage: "completed",
    was_new_method: !existing,
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
