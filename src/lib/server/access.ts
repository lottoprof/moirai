/*
 * Централизованная проверка доступа к module body / media.
 *
 * Используется везде где рендерится приватный контент (видео,
 * текст модуля, homework prompt). См. decisions_archive.md 2026-05-17
 * §16.
 *
 * Правила:
 *   1. Deactivated user не имеет доступа ни к чему (даже completed
 *      enrollments — re-activation возвращает доступ).
 *   2. Доступ есть если у user'a есть active enrollment + модуль
 *      в enrollment_modules.
 *   3. Refunded/cancelled/completed enrollments → НЕТ доступа
 *      (исключение — completed может позднее быть архивным режимом
 *      доступа, Sprint 2+).
 */

export async function hasAccessToModule(
  env: Cloudflare.Env,
  userId: string,
  moduleSlug: string,
): Promise<boolean> {
  // 1. Deactivated check
  const userRow = await env.DB.prepare(
    `SELECT deactivated_at FROM users WHERE id = ?`,
  )
    .bind(userId)
    .first<{ deactivated_at: number | null }>();

  if (!userRow || userRow.deactivated_at !== null) return false;

  // 2. Active enrollment + module присутствует
  const r = await env.DB.prepare(
    `SELECT 1
     FROM enrollments e
     JOIN enrollment_modules em ON em.enrollment_id = e.id
     WHERE e.user_id = ?
       AND em.module_slug = ?
       AND e.status = 'active'
     LIMIT 1`,
  )
    .bind(userId, moduleSlug)
    .first();

  return r !== null;
}
