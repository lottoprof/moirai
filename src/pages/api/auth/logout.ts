/*
 * POST /api/auth/logout
 *
 * Идемпотентно: всегда возвращает 200, всегда очищает cookie. Если
 * refresh cookie был валидный — soft-revoke сессии в D1. Если не было
 * или уже expired/revoked — просто clean response.
 *
 * Без CSRF token — SameSite=Lax на cookie блокирует cross-site form POST.
 */

import type { APIRoute } from "astro";
import {
  buildLogoutCookieHeader,
  readRefreshCookie,
  revokeRefreshSession,
  verifyRefreshSession,
} from "../../../lib/server/session";
import { logAuth } from "../../../lib/server/audit";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;

  const cookie = readRefreshCookie(request);
  if (cookie) {
    const session = await verifyRefreshSession(env, request);
    if (session) {
      await revokeRefreshSession(env, session.sessionId);
      await logAuth(env, "logout", session.userId, null, request);
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": buildLogoutCookieHeader(),
    },
  });
};
