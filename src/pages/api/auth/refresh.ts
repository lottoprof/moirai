/*
 * POST /api/auth/refresh
 *
 * Проверить refresh-cookie → выдать новый access JWT.
 * Refresh token plaintext НЕ ротируется (current scope — token rotation
 * на следующий stage если понадобится).
 *
 * Response:
 *   200 { ok: true, access_token, expires_in }   — валидная cookie
 *   200 { ok: false }                             — нет cookie / expired / revoked
 *
 * Stage 8: для отсутствующей/невалидной cookie возвращаем 200 c
 * `ok: false` вместо 401. Nav.astro дёргает этот endpoint на каждой
 * загрузке для опциональной авто-аутентификации — 401 для анонимных
 * visits плодил console errors и снижал PSI Best Practices.
 * Это probe-style endpoint, не auth-gated; реальные protected endpoints
 * (verifyRefreshSession в middleware/guards) остаются на 401/302.
 */

import type { APIRoute } from "astro";
import { verifyRefreshSession } from "../../../lib/server/session";
import { signJWT } from "../../../lib/server/jwt";
import { findUserById } from "../../../lib/server/user-ops";
import { extractRequestInfo } from "../../../lib/server/hash";

export const prerender = false;

const ACCESS_TTL_SECONDS = 15 * 60;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const { ip, ua } = extractRequestInfo(request);

  const noSessionResponse = new Response(JSON.stringify({ ok: false }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

  const session = await verifyRefreshSession(env, request);
  if (!session) return noSessionResponse;

  // Получить user для role в JWT (role мог измениться с момента issue refresh)
  const user = await findUserById(env, session.userId);
  if (!user) return noSessionResponse;

  // JWT без role с migration 0003 (multi-role). См. decisions 2026-05-17.
  const accessToken = await signJWT(
    { sub: user.id, sid: session.sessionId },
    env,
    { expiresIn: `${ACCESS_TTL_SECONDS.toString()}s`, fingerprint: { ip, ua } },
  );

  return new Response(
    JSON.stringify({
      ok: true,
      access_token: accessToken,
      expires_in: ACCESS_TTL_SECONDS,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
};
