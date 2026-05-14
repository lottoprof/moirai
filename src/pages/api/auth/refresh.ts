/*
 * POST /api/auth/refresh
 *
 * Проверить refresh-cookie → выдать новый access JWT.
 * Refresh token plaintext НЕ ротируется (current scope — token rotation
 * на следующий stage если понадобится).
 *
 * Response:
 *   200 { ok: true, access_token, expires_in }
 *   401 { error: "invalid_refresh" } — нет cookie / expired / revoked
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

  const session = await verifyRefreshSession(env, request);
  if (!session) {
    return new Response(JSON.stringify({ error: "invalid_refresh" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Получить user для role в JWT (role мог измениться с момента issue refresh)
  const user = await findUserById(env, session.userId);
  if (!user) {
    return new Response(JSON.stringify({ error: "invalid_refresh" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const accessToken = await signJWT(
    { sub: user.id, role: user.role, sid: session.sessionId },
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
