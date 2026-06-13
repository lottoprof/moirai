/*
 * GET /api/auth/verify-email?token=...
 *
 * Конечная точка email-verify link'a из письма (register flow).
 * Consume one-time token из KV_VERIFY_TOKENS → UPDATE
 * users.email_verified_at → **auto-login** (создаём refresh-сессию
 * в этом браузере) → 303 redirect на /{locale}/account?verified=1.
 *
 * Auto-login по клику на email link решает мульти-браузерный кейс:
 * юзер регистрируется в Browser A, открывает письмо в Browser B —
 * клик по link логинит в Browser B автоматически. Стандартный
 * UX-паттерн (Slack, Linear, Notion). Security trade-off accepted:
 *   - token single-use (consumed at click)
 *   - TTL 1 час
 *   - email compromise в этот час → attacker может войти; это
 *     общая дыра в "email = identity" модели, не специфично нам.
 *
 * Невалидный/протухший токен → redirect на /{locale}/verify-email-pending?error=invalid_token.
 *
 * 303 See Other — корректный код для GET-link → redirect после
 * "обработки".
 */

import type { APIRoute } from "astro";
import { consumeVerifyToken } from "../../../lib/server/verify-tokens";
import { findUserById, markEmailVerified } from "../../../lib/server/user-ops";
import { createRefreshSession } from "../../../lib/server/session";
import { logAuth } from "../../../lib/server/audit";
import { getUserWithRoles } from "../../../lib/server/guards";
import { computeRedirectTarget } from "../../../lib/server/auth-redirect";

export const prerender = false;

function redirect(location: string, cookieHeader?: string): Response {
  const headers: Record<string, string> = { Location: location };
  if (cookieHeader) headers["Set-Cookie"] = cookieHeader;
  return new Response(null, {
    status: 303,
    headers,
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

  // Идемпотентно — если уже verified, повторяем UPDATE (timestamp перезапишется)
  await markEmailVerified(env, user.id);
  await logAuth(env, "email_verify", user.id, null, request, {
    email_domain: user.email.split("@")[1] ?? "",
  });

  // Auto-login: создаём refresh-сессию в текущем браузере.
  // Решает мульти-браузерный кейс (register в Browser A, click link в Browser B).
  // См. comment в header'е файла.
  const { sessionId, cookieHeader } = await createRefreshSession(env, user.id, request);
  await logAuth(env, "login", user.id, null, request, {
    via: "email_verify",
    session_id: sessionId,
  });

  // Role-based redirect (admin → /admin/, instructor → /instructor/,
  // иначе /dashboard/). Добавляем ?verified=1 query для toast.
  // См. decisions 2026-05-17 §18.
  const userWithRoles = await getUserWithRoles(env, user.id);
  const baseTarget = userWithRoles
    ? await computeRedirectTarget(env, userWithRoles, null)
    : `/${user.locale}/dashboard/`;
  const sep = baseTarget.includes("?") ? "&" : "?";
  return redirect(`${baseTarget}${sep}verified=1`, cookieHeader);
};
