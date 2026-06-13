/*
 * Post-login redirect logic.
 *
 * Используется в /api/auth/login, /api/auth/oauth/{provider}/callback,
 * /api/auth/verify-email — везде где после успешной auth нужно
 * вычислить куда отправить user'a.
 *
 * См. decisions_archive.md 2026-05-17 §18.
 */

import type { Role, UserWithRoles } from "../../../db/types";
import { primaryRole } from "./guards";

/**
 * Вычислить целевой URL после успешной auth.
 *
 * Правила:
 *   1. Deactivated user → /{locale}/inactive (даже если есть return_to)
 *   2. Если есть валидный return_to для роли пользователя → return_to
 *   3. Если primary='student' И у user 0 enrollments (никогда не
 *      записывался ни на одну программу) → /{locale}/apply (новый
 *      юзер сразу выбирает когорту, минуя пустой dashboard).
 *   4. Иначе role-home (admin > instructor > student priority).
 *
 * Async — query D1 для check'a enrollments в случае 3. Все 5 callers
 * await'ят: login.ts, verify-email.ts, magic-link/confirm.ts,
 * oauth/google/callback.ts, oauth/discord/callback.ts.
 */
export async function computeRedirectTarget(
  env: Cloudflare.Env,
  user: UserWithRoles,
  returnTo?: string | null,
): Promise<string> {
  if (user.deactivated_at !== null) {
    return `/${user.locale}/inactive`;
  }

  if (returnTo) {
    const safe = sanitizeReturnTo(returnTo, user.roles);
    if (safe) return safe;
  }

  // Новый студент (никаких enrollments) → /apply вместо пустого dashboard.
  // Только если primary роль = student (admin/instructor имеют своё home).
  const primary = primaryRole(user.roles);
  if (primary === "student") {
    const hasAnyEnrollment = await env.DB.prepare(
      `SELECT 1 FROM enrollments WHERE user_id = ? LIMIT 1`,
    ).bind(user.id).first<{ "1": number }>();
    if (!hasAnyEnrollment) {
      return `/${user.locale}/apply`;
    }
  }

  return roleHomeUrl(user);
}

/**
 * Role-home URL по primary role + user.locale.
 * admin → /admin/ (без локали)
 * instructor → /{locale}/instructor/
 * student → /{locale}/dashboard/
 *
 * Sync — для случаев когда уже знаем что role-home подходит (не нужно
 * учитывать «новый студент»).
 */
export function roleHomeUrl(user: UserWithRoles): string {
  const primary = primaryRole(user.roles);
  if (primary === "admin") return "/admin/";
  if (primary === "instructor") return `/${user.locale}/instructor/`;
  return `/${user.locale}/dashboard/`;
}

/**
 * Валидировать `return_to` — оставляем только same-origin path'и
 * на роуты доступные user'ской роли. Если return_to ведёт в чужую
 * зону → возвращаем null (caller сделает silent fallback на role-home).
 *
 * Защищает от open-redirect (внешние URL) и от роль-elevation
 * (student с return_to=/admin/users — silent fallback на /dashboard/).
 */
export function sanitizeReturnTo(
  returnTo: string,
  roles: Set<Role>,
): string | null {
  // Same-origin only — path должен начинаться с одного "/"
  if (!returnTo.startsWith("/")) return null;
  if (returnTo.startsWith("//")) return null; // anti-protocol-relative

  // Admin zone — только admin
  if (returnTo.startsWith("/admin/") || returnTo === "/admin") {
    return roles.has("admin") ? returnTo : null;
  }

  // Instructor zone — только instructor
  if (/^\/(en|ru)\/instructor(\/|$)/.test(returnTo)) {
    return roles.has("instructor") ? returnTo : null;
  }

  // Student dashboard — только student
  if (/^\/(en|ru)\/dashboard(\/|$)/.test(returnTo)) {
    return roles.has("student") ? returnTo : null;
  }

  // Public path или /account — любая аутентификация
  return returnTo;
}
