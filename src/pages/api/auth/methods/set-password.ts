/*
 * POST /api/auth/methods/set-password
 *
 * Установить password method для уже залогиненного user'а у которого
 * password ещё нет (например, OAuth-only регистрация через Google).
 *
 * Auth: refresh cookie должен быть валиден (verifyRefreshSession).
 * Это endpoint для logged-in flow, НЕ для anonymous reset.
 *
 * Если password method УЖЕ есть → reject `password_already_set` —
 * для смены пароля использовать `password-reset` flow с email-токеном
 * (UI должен скрывать "Set password" кнопку когда method уже linked).
 *
 * Не revoke'ит другие сессии — user уже залогинен, не нужно вышибать.
 *
 * Body:  { password: string }
 * Resp:
 *   200 { ok: true }
 *   400 { error: "invalid_input" | "too_short" | "too_long" | "too_common" }
 *   401 { error: "unauthenticated" }
 *   409 { error: "password_already_set" }
 *   429 { error: "rate_limited" }
 */

import type { APIRoute } from "astro";
import { z } from "zod";
import {
  hashPassword,
  validatePasswordStrength,
} from "../../../../lib/server/password";
import {
  findUserById,
  findAuthMethod,
  linkAuthMethod,
} from "../../../../lib/server/user-ops";
import { verifyRefreshSession } from "../../../../lib/server/session";
import { extractRequestInfo } from "../../../../lib/server/hash";
import { checkRateLimit } from "../../../../lib/server/ratelimit";
import { logAuth } from "../../../../lib/server/audit";

export const prerender = false;

const Schema = z.object({
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

  // 1. Auth
  const session = await verifyRefreshSession(env, request);
  if (!session) return jsonError("unauthenticated", 401);

  const user = await findUserById(env, session.userId);
  if (!user) return jsonError("unauthenticated", 401);

  // 2. Rate limit per user (3/час — анти-абуз "set password" спама)
  const rl = await checkRateLimit(env, `methods:set-password:user:${user.id}`, {
    max: 3,
    windowSec: 3600,
  });
  if (!rl.allowed) return jsonError("rate_limited", 429);

  // 3. Body validation
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError("invalid_json", 400);
  }
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) return jsonError("invalid_input", 400);
  const { password } = parsed.data;

  // 4. Password strength
  const pwErr = validatePasswordStrength(password);
  if (pwErr) return jsonError(pwErr.code, 400, { message: pwErr.message });

  // 5. Conflict — password method уже есть
  const existing = await findAuthMethod(env, user.id, "password");
  if (existing) {
    return jsonError("password_already_set", 409);
  }

  // 6. Hash + INSERT
  const hash = await hashPassword(password);
  await linkAuthMethod(env, {
    userId: user.id,
    kind: "password",
    secretHash: hash,
  });

  // 7. Audit
  await logAuth(env, "password_set", user.id, "password", request, {
    via: "first_time_set",
    other_methods_count: 1, // OAuth у user уже был, иначе он бы не был залогинен
  });
  void ip;       // resolved для лога, не нужен дальше

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
