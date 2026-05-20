/*
 * GET /api/auth/magic-link/confirm?token=<base64url>&return_to=<path>
 *
 * Stage 14o, FLOW-19. Consume one-time magic-link token → createRefreshSession
 * → redirect на /dashboard (или return_to если valid same-origin).
 *
 * Token TTL 30 min, single-use. Re-click expired link → редирект на /login
 * с error message.
 *
 * Security:
 *   - Token validated via KV (eventually consistent но достаточно для
 *     нашего scale — повторное use → null)
 *   - return_to sanitized через sanitizeReturnTo (защита от open-redirect
 *     и role-elevation)
 */

import type { APIRoute } from "astro";
import { consumeVerifyToken } from "../../../../lib/server/verify-tokens";
import { findUserById } from "../../../../lib/server/user-ops";
import { createRefreshSession } from "../../../../lib/server/session";
import { sanitizeReturnTo } from "../../../../lib/server/auth-redirect";
import { logAuth } from "../../../../lib/server/audit";

export const prerender = false;

function redirectTo(location: string, cookieHeader?: string): Response {
  const headers: Record<string, string> = { Location: location };
  if (cookieHeader) headers["Set-Cookie"] = cookieHeader;
  return new Response(null, { status: 302, headers });
}

export const GET: APIRoute = async ({ request, locals, url }) => {
  const env = locals.runtime.env;

  const token = url.searchParams.get("token");
  const returnToRaw = url.searchParams.get("return_to");

  if (!token) {
    return redirectTo(`/en/login?error=magic_link_invalid`);
  }

  const payload = await consumeVerifyToken(env, token, "magic_link");
  if (!payload) {
    return redirectTo(`/en/login?error=magic_link_invalid`);
  }

  const user = await findUserById(env, payload.userId);
  if (!user) {
    return redirectTo(`/${payload.locale}/login?error=magic_link_invalid`);
  }
  if (user.deactivated_at !== null) {
    return redirectTo(`/${user.locale}/inactive`);
  }

  // Issue session (remember mode — magic-link login имитирует "remember me")
  const { cookieHeader } = await createRefreshSession(
    env,
    user.id,
    request,
    "remember",
  );

  await logAuth(env, "login", user.id, "password", request, {
    via: "magic_link",
  });

  // Resolve return_to (sanitized по ролям). Если no/invalid — role-home.
  let destination = `/${user.locale}/dashboard`;
  if (returnToRaw) {
    // Fetch roles inline для sanitize (lightweight 1 query)
    const rolesRows = await env.DB.prepare(
      `SELECT role FROM user_roles WHERE user_id = ?`,
    ).bind(user.id).all<{ role: string }>();
    const roles = new Set(
      rolesRows.results
        .map((r) => r.role)
        .filter((r): r is "admin" | "instructor" | "student" =>
          r === "admin" || r === "instructor" || r === "student",
        ),
    );
    const safe = sanitizeReturnTo(returnToRaw, roles);
    if (safe) destination = safe;
  }

  return redirectTo(destination, cookieHeader);
};
