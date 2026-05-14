/*
 * GET /api/auth/verify-email?token=...
 *
 * Конечная точка email-verify link'a из письма (register flow).
 * Consume one-time token из KV_VERIFY_TOKENS → UPDATE
 * users.email_verified_at → редирект на /{locale}/account?verified=1.
 *
 * Невалидный/протухший токен → redirect на /{locale}/verify-email-pending?error=invalid_token.
 *
 * 303 See Other (а не 302) — корректный код для GET-link → redirect
 * после "обработки".
 */

import type { APIRoute } from "astro";
import { consumeVerifyToken } from "../../../lib/server/verify-tokens";
import { findUserById, markEmailVerified } from "../../../lib/server/user-ops";
import { logAuth } from "../../../lib/server/audit";

export const prerender = false;

function redirect(location: string): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: location },
  });
}

export const GET: APIRoute = async ({ url, request, locals }) => {
  const env = locals.runtime.env;
  const token = url.searchParams.get("token");

  if (!token || token.length < 8) {
    return redirect("/en/verify-email-pending?error=invalid_token");
  }

  const payload = await consumeVerifyToken(env, token, "email_verify");
  if (!payload) {
    return redirect("/en/verify-email-pending?error=invalid_token");
  }

  const user = await findUserById(env, payload.userId);
  if (!user) {
    return redirect(`/${payload.locale}/verify-email-pending?error=invalid_token`);
  }

  // Идемпотентно — если уже verified, просто повторяем UPDATE (timestamp перезапишется)
  await markEmailVerified(env, user.id);
  await logAuth(env, "email_verify", user.id, null, request, {
    email_domain: user.email.split("@")[1] ?? "",
  });

  return redirect(`/${user.locale}/account?verified=1`);
};
