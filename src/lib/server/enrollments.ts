/*
 * Enrollment operations.
 *
 * См. decisions_archive.md 2026-05-17 §enrollments,
 * Architecture.md §5 (model).
 */

import type {
  EnrollmentRow,
  EnrollmentModuleRow,
  EnrollmentStatus,
} from "../../../db/types";
import { resolveDependencies, getDependentsInEnrollment } from "./modules";
import { logAuth } from "./audit";

export interface CreateEnrollmentInput {
  userId: string;
  programmeSlug: string;
  priceAmount: number;
  priceCurrency?: string;          // default 'USD'
  featuresJson: string;            // serialized JSON object
  leadInstructorId?: string | null;
  /** Список module slugs из programme.default_modules. Server
   *  expand'нет через resolveDependencies для каждого. */
  defaultModules?: string[];
  /** Кто инициировал создание (admin id для admin-grant, NULL
   *  для self-checkout, system'аем после Sprint 2 платежей). */
  createdBy?: string | null;
}

/**
 * Создать enrollment + (опционально) скопировать default_modules
 * с auto-resolve transitive dependencies.
 *
 * Returns: созданный enrollment.
 */
export async function createEnrollment(
  env: Cloudflare.Env,
  input: CreateEnrollmentInput,
): Promise<EnrollmentRow> {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const currency = input.priceCurrency ?? "USD";
  const addedBy = input.createdBy ?? input.userId; // self-purchase → added_by = student themselves

  // 1. Резолвим все transitive deps из default_modules
  const expandedSlugs = new Set<string>();
  for (const slug of input.defaultModules ?? []) {
    const chain = await resolveDependencies(env, slug);
    chain.forEach((s) => expandedSlugs.add(s));
  }
  const orderedSlugs = [...expandedSlugs];

  // 2. Atomic batch: INSERT enrollment + INSERT enrollment_modules
  const statements = [
    env.DB.prepare(
      `INSERT INTO enrollments
         (id, user_id, programme_slug, status,
          price_paid_amount, price_paid_currency, features_json,
          lead_instructor_id, enrolled_at, created_at, updated_at)
       VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      input.userId,
      input.programmeSlug,
      input.priceAmount,
      currency,
      input.featuresJson,
      input.leadInstructorId ?? null,
      now,
      now,
      now,
    ),
    ...orderedSlugs.map((slug, idx) =>
      env.DB.prepare(
        `INSERT INTO enrollment_modules
           (enrollment_id, module_slug, order_idx, added_by, added_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(id, slug, idx, addedBy, now),
    ),
  ];
  await env.DB.batch(statements);

  const created = await env.DB.prepare(
    `SELECT * FROM enrollments WHERE id = ?`,
  )
    .bind(id)
    .first<EnrollmentRow>();
  if (!created) {
    throw new Error(`createEnrollment: read-back failed for id ${id}`);
  }
  return created;
}

/**
 * Добавить module в enrollment + auto-resolve transitive deps.
 * Idempotent: skip slugs которые уже в enrollment'е.
 *
 * Returns: список slug'ов которые реально были добавлены (для UI).
 */
export async function addModuleToEnrollment(
  env: Cloudflare.Env,
  enrollmentId: string,
  rootSlug: string,
  byUserId: string,
): Promise<{ added: string[]; alreadyPresent: string[] }> {
  // 1. Текущие модули в enrollment'е
  const existing = await env.DB.prepare(
    `SELECT module_slug, MAX(order_idx) OVER () as max_order
     FROM enrollment_modules WHERE enrollment_id = ?`,
  )
    .bind(enrollmentId)
    .all<{ module_slug: string; max_order: number | null }>();
  const existingSlugs = new Set(existing.results.map((r) => r.module_slug));
  const maxOrder = existing.results[0]?.max_order ?? -1;

  // 2. Резолвим транзитивные deps
  const chain = await resolveDependencies(env, rootSlug);

  const toAdd = chain.filter((s) => !existingSlugs.has(s));
  const alreadyPresent = chain.filter((s) => existingSlugs.has(s));

  if (toAdd.length === 0) {
    return { added: [], alreadyPresent };
  }

  const now = Math.floor(Date.now() / 1000);
  await env.DB.batch([
    ...toAdd.map((slug, i) =>
      env.DB.prepare(
        `INSERT INTO enrollment_modules
           (enrollment_id, module_slug, order_idx, added_by, added_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(enrollmentId, slug, maxOrder + 1 + i, byUserId, now),
    ),
    env.DB.prepare(
      `UPDATE enrollments SET updated_at = ? WHERE id = ?`,
    ).bind(now, enrollmentId),
  ]);

  return { added: toAdd, alreadyPresent };
}

/**
 * Удалить module из enrollment.
 *
 * Throws Error('has_dependents') если другие модули в enrollment'е
 * имеют этот slug в requires_modules. UI должен предложить remove-all
 * через повторные вызовы для каждого dependent + root.
 */
export async function removeModuleFromEnrollment(
  env: Cloudflare.Env,
  enrollmentId: string,
  slug: string,
): Promise<{ dependents: string[] } | { removed: true }> {
  const dependents = await getDependentsInEnrollment(env, enrollmentId, slug);
  if (dependents.length > 0) {
    return { dependents };
  }

  const now = Math.floor(Date.now() / 1000);
  await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM enrollment_modules
       WHERE enrollment_id = ? AND module_slug = ?`,
    ).bind(enrollmentId, slug),
    env.DB.prepare(
      `UPDATE enrollments SET updated_at = ? WHERE id = ?`,
    ).bind(now, enrollmentId),
  ]);

  return { removed: true };
}

/**
 * Изменить статус enrollment'a (active → completed/cancelled/refunded).
 * Заполняет соответствующий timestamp.
 */
export async function setEnrollmentStatus(
  env: Cloudflare.Env,
  enrollmentId: string,
  status: EnrollmentStatus,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const stampCol =
    status === "completed"
      ? "completed_at"
      : status === "cancelled"
        ? "cancelled_at"
        : status === "refunded"
          ? "cancelled_at" // refund тоже cancellation timestamp
          : null;

  if (stampCol) {
    await env.DB.prepare(
      `UPDATE enrollments
       SET status = ?, ${stampCol} = ?, updated_at = ?
       WHERE id = ?`,
    )
      .bind(status, now, now, enrollmentId)
      .run();
  } else {
    await env.DB.prepare(
      `UPDATE enrollments SET status = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(status, now, enrollmentId)
      .run();
  }
}

/**
 * Получить enrollments пользователя (default: только active).
 */
export async function listUserEnrollments(
  env: Cloudflare.Env,
  userId: string,
  opts: { status?: EnrollmentStatus | "all" } = {},
): Promise<EnrollmentRow[]> {
  const status = opts.status ?? "active";
  if (status === "all") {
    const rows = await env.DB.prepare(
      `SELECT * FROM enrollments WHERE user_id = ? ORDER BY enrolled_at DESC`,
    )
      .bind(userId)
      .all<EnrollmentRow>();
    return rows.results;
  }
  const rows = await env.DB.prepare(
    `SELECT * FROM enrollments
     WHERE user_id = ? AND status = ?
     ORDER BY enrolled_at DESC`,
  )
    .bind(userId, status)
    .all<EnrollmentRow>();
  return rows.results;
}

/**
 * Получить модули enrollment'а в order_idx порядке.
 */
export async function listEnrollmentModules(
  env: Cloudflare.Env,
  enrollmentId: string,
): Promise<EnrollmentModuleRow[]> {
  const rows = await env.DB.prepare(
    `SELECT * FROM enrollment_modules
     WHERE enrollment_id = ?
     ORDER BY order_idx`,
  )
    .bind(enrollmentId)
    .all<EnrollmentModuleRow>();
  return rows.results;
}

// Suppress unused import warning — logAuth используется в admin endpoints
void logAuth;
