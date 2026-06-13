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
import { getUserWithRoles } from "../../../../lib/server/guards";
import { createRefreshSession } from "../../../../lib/server/session";
import { computeRedirectTarget } from "../../../../lib/server/auth-redirect";
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

  const user = await getUserWithRoles(env, payload.userId);
  if (!user) {
    return redirectTo(`/${payload.locale}/login?error=magic_link_invalid`);
  }
  // computeRedirectTarget сам редиректит deactivated → /{locale}/inactive

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

  // Role-aware destination: admin → /admin/, instructor →
  // /{locale}/instructor/, student → /{locale}/dashboard/. Учитывает
  // sanitized return_to (silent fallback на role-home если return_to
  // не подходит роли).
  const destination = computeRedirectTarget(user, returnToRaw);

  return redirectTo(destination, cookieHeader);
};
