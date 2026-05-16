/*
 * Auth guards для protected pages.
 *
 * Используется в frontmatter каждого роута внутри role-zones:
 *
 *   const userOrRes = await requireRole(Astro, 'student');
 *   if (userOrRes instanceof Response) return userOrRes;
 *   const user = userOrRes;
 *
 * См. decisions_archive.md 2026-05-17 §16-§17.
 */

import type { APIContext } from "astro";
import type { Role, UserRow, UserWithRoles } from "../../../db/types";
import { verifyRefreshSession } from "./session";
import { findUserById } from "./user-ops";

/**
 * Получить user + его роли. Возвращает null если user не существует.
 * Один индексированный D1-запрос с GROUP_CONCAT (D1 поддерживает).
 */
export async function getUserWithRoles(
  env: Cloudflare.Env,
  userId: string,
): Promise<UserWithRoles | null> {
  const user = await findUserById(env, userId);
  if (!user) return null;

  const rows = await env.DB.prepare(
    `SELECT role FROM user_roles WHERE user_id = ?`,
  )
    .bind(userId)
    .all<{ role: Role }>();

  return {
    ...user,
    roles: new Set(rows.results.map((r) => r.role)),
  };
}

/**
 * Guard для protected pages: проверяет refresh-session, fetch user
 * с ролями, валидирует наличие требуемой роли + deactivated_at.
 *
 * Возвращает Response для:
 *   - 302 redirect на /{locale}/login если не залогинен
 *   - 302 redirect на /{locale}/inactive если deactivated
 *   - 404 если не та роль (info-hiding — не подсказываем что зона
 *     существует, см. decisions 2026-05-17 §17)
 *
 * Возвращает UserWithRoles при успехе.
 */
export async function requireRole(
  ctx: APIContext,
  role: Role,
): Promise<UserWithRoles | Response> {
  const env = ctx.locals.runtime.env;
  const session = await verifyRefreshSession(env, ctx.request);

  // Определяем locale для редиректов (login / inactive)
  const localeParam = ctx.params.locale;
  const locale: "en" | "ru" =
    localeParam === "ru" ? "ru" : "en";

  if (!session) {
    const returnTo = ctx.url.pathname + ctx.url.search;
    return ctx.redirect(
      `/${locale}/login?return_to=${encodeURIComponent(returnTo)}`,
    );
  }

  const user = await getUserWithRoles(env, session.userId);
  if (!user) {
    // Stale session — user удалён. Logout и redirect.
    return ctx.redirect(`/${locale}/login`);
  }

  if (user.deactivated_at !== null) {
    // user может login'иться, но access redirects на inactive
    return ctx.redirect(`/${user.locale}/inactive`);
  }

  if (!user.roles.has(role)) {
    // Info-hiding: 404 вместо 403, чтобы не подсказывать что зона
    // существует пользователю без подходящей роли.
    return new Response(null, { status: 404 });
  }

  return user;
}

/**
 * Soft guard для cross-zone страниц (`/account`, `/inactive`):
 * требует auth, но не специфичной роли. Deactivated пропускается
 * для `/account` (чтобы user мог управлять профилем).
 *
 * Опция `allowDeactivated: true` нужна для `/inactive` и `/account`,
 * иначе guard сам редиректит на `/inactive`.
 */
export async function requireAuth(
  ctx: APIContext,
  opts: { allowDeactivated?: boolean } = {},
): Promise<UserWithRoles | Response> {
  const env = ctx.locals.runtime.env;
  const session = await verifyRefreshSession(env, ctx.request);

  const localeParam = ctx.params.locale;
  const locale: "en" | "ru" =
    localeParam === "ru" ? "ru" : "en";

  if (!session) {
    const returnTo = ctx.url.pathname + ctx.url.search;
    return ctx.redirect(
      `/${locale}/login?return_to=${encodeURIComponent(returnTo)}`,
    );
  }

  const user = await getUserWithRoles(env, session.userId);
  if (!user) {
    return ctx.redirect(`/${locale}/login`);
  }

  if (user.deactivated_at !== null && !opts.allowDeactivated) {
    return ctx.redirect(`/${user.locale}/inactive`);
  }

  return user;
}

/**
 * Возвращает "primary role" по priority — admin > instructor > student.
 * Используется для default landing + dynamic layout selection.
 * Если у user'a 0 ролей — возвращает 'student' (защита, не должно
 * случиться благодаря trigger `prevent_role_orphan`).
 */
export function primaryRole(roles: Set<Role>): Role {
  if (roles.has("admin")) return "admin";
  if (roles.has("instructor")) return "instructor";
  return "student";
}
