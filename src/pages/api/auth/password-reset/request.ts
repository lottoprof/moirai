/*
 * POST /api/auth/password-reset/request
 *
 * Запрос на сброс пароля. **Всегда возвращает 200** — нельзя
 * различать "email существует" / "не существует" (info-hiding,
 * прямое email enumeration). Email уходит только если:
 *   - user найден
 *   - user имеет password method (не только OAuth)
 * Иначе response 200 без отправки.
 *
 * Body:  { email, locale, turnstileToken }
 * Resp:  200 { ok: true } (всегда, даже если email не существует)
 *        403 { error: "turnstile_failed" }
 *        429 { error: "rate_limited" }
 */

import type { APIRoute } from "astro";
import { z } from "zod";
import {
  findUserByEmail,
  findAuthMethod,
} from "../../../../lib/server/user-ops";
import { verifyTurnstile } from "../../../../lib/server/turnstile";
import { checkRateLimit, RATE_LIMITS } from "../../../../lib/server/ratelimit";
import { extractRequestInfo } from "../../../../lib/server/hash";
import { createVerifyToken } from "../../../../lib/server/verify-tokens";
import { sendEmail } from "../../../../lib/server/email";
import { logAuth } from "../../../../lib/server/audit";

export const prerender = false;

const Schema = z.object({
  email: z.string().email().max(254),
  locale: z.enum(["en", "ru"]),
  turnstileToken: z.string().min(1).max(2048),
});

function ok(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonError(code: string, status: number): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async ({ request, locals, url }) => {
  const env = locals.runtime.env;
  const { ip } = extractRequestInfo(request);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError("invalid_json", 400);
  }
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) return jsonError("invalid_input", 400);
  const { email, locale, turnstileToken } = parsed.data;

  const turnstileOk = await verifyTurnstile(turnstileToken, ip, env);
  if (!turnstileOk) return jsonError("turnstile_failed", 403);

  const rl = await checkRateLimit(env, `reset:email:${email.toLowerCase()}`, RATE_LIMITS.resetByEmail);
  if (!rl.allowed) return jsonError("rate_limited", 429);

  // Lookup без раскрытия результата клиенту
  const user = await findUserByEmail(env, email);
  if (!user) return ok();      // info-hiding

  const method = await findAuthMethod(env, user.id, "password");
  if (!method) return ok();    // у user только OAuth — reset не применим

  const token = await createVerifyToken(env, {
    kind: "password_reset",
    userId: user.id,
    email: user.email,
    locale: user.locale,
  });
  const actionUrl = `${url.origin}/${locale}/password-reset?token=${token}`;

  await sendEmail(env, {
    to: user.email,
    locale,
    kind: "password_reset",
    actionUrl,
    recipientName: user.name,
  });

  await logAuth(env, "password_reset", user.id, "password", request, {
    stage: "requested",
  });

  return ok();
};
