/*
 * Module catalog operations.
 *
 * Модули живут в D1 (table `modules`), source — external repo
 * (sync pipeline Sprint 2). Sprint 21 — read-only access из admin
 * panel + resolve dependencies при INSERT в enrollment_modules.
 *
 * См. decisions_archive.md 2026-05-17 §модули.
 */

import type { ModuleRow, ModuleStatus, Locale } from "../../../db/types";

/**
 * Получить module row по slug + locale.
 * Возвращает null если модуль не существует ИЛИ status='archived' и
 * caller не запросил `{ includeArchived: true }`.
 */
export async function findModule(
  env: Cloudflare.Env,
  slug: string,
  locale: Locale,
  opts: { includeArchived?: boolean } = {},
): Promise<ModuleRow | null> {
  const row = await env.DB.prepare(
    `SELECT * FROM modules WHERE slug = ? AND locale = ?`,
  )
    .bind(slug, locale)
    .first<ModuleRow>();

  if (!row) return null;
  if (row.status === "archived" && !opts.includeArchived) return null;
  return row;
}

/**
 * Список модулей в catalogue (filter by status, default published).
 */
export async function listModules(
  env: Cloudflare.Env,
  locale: Locale,
  opts: { status?: ModuleStatus | "all" } = {},
): Promise<ModuleRow[]> {
  const status = opts.status ?? "published";
  if (status === "all") {
    const rows = await env.DB.prepare(
      `SELECT * FROM modules WHERE locale = ? ORDER BY slug`,
    )
      .bind(locale)
      .all<ModuleRow>();
    return rows.results;
  }
  const rows = await env.DB.prepare(
    `SELECT * FROM modules WHERE locale = ? AND status = ? ORDER BY slug`,
  )
    .bind(locale, status)
    .all<ModuleRow>();
  return rows.results;
}

/**
 * Resolve transitive `requires_modules` для одного slug'a.
 * DFS с visited set (защита от циклов на runtime — CI external repo
 * не должен дать им пройти, но runtime safe).
 *
 * Возвращает массив slug'ов в post-order — зависимости идут раньше
 * зависящего (для правильного order_idx при INSERT'е).
 *
 * Локаль `en` для метаданных (requires_modules одинаков между
 * локалями — это про структуру, не контент).
 */
export async function resolveDependencies(
  env: Cloudflare.Env,
  rootSlug: string,
): Promise<string[]> {
  const visited = new Set<string>();
  const result: string[] = [];

  async function walk(slug: string): Promise<void> {
    if (visited.has(slug)) return;
    visited.add(slug);

    const row = await env.DB.prepare(
      `SELECT requires_modules_json FROM modules
       WHERE slug = ? AND locale = 'en' AND status = 'published'`,
    )
      .bind(slug)
      .first<{ requires_modules_json: string }>();

    // Модуль не найден или archived — добавляем сам slug без deps,
    // вызывающий код решит как обработать (как правило — отвергнет
    // INSERT с ошибкой).
    if (!row) {
      result.push(slug);
      return;
    }

    let deps: string[] = [];
    try {
      const parsed: unknown = JSON.parse(row.requires_modules_json);
      if (Array.isArray(parsed)) {
        deps = parsed.filter((x): x is string => typeof x === "string");
      }
    } catch {
      // Невалидный JSON — пустые deps
    }

    for (const dep of deps) await walk(dep);

    result.push(slug);
  }

  await walk(rootSlug);
  return result;
}

/**
 * Получить список модулей в enrollment'е которые depend on `slug`.
 * Используется при попытке remove module — если есть dependents,
 * UI блокирует removal или предлагает remove-all.
 */
export async function getDependentsInEnrollment(
  env: Cloudflare.Env,
  enrollmentId: string,
  slug: string,
): Promise<string[]> {
  const rows = await env.DB.prepare(
    `SELECT em.module_slug, m.requires_modules_json
     FROM enrollment_modules em
     LEFT JOIN modules m ON m.slug = em.module_slug AND m.locale = 'en'
     WHERE em.enrollment_id = ?`,
  )
    .bind(enrollmentId)
    .all<{ module_slug: string; requires_modules_json: string | null }>();

  return rows.results
    .filter((r) => {
      if (!r.requires_modules_json) return false;
      try {
        const parsed: unknown = JSON.parse(r.requires_modules_json);
        return Array.isArray(parsed) && parsed.includes(slug);
      } catch {
        return false;
      }
    })
    .map((r) => r.module_slug);
}
