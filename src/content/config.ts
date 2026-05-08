/*
 * Content Collections — zod-схемы для 7 коллекций из
 * docs/Architecture.md §4 + Home_page_SEO.md §6.
 *
 * Конвенция файлов: `[id].{locale}.mdx` (locale в [en, ru], см.
 * astro.config.mjs). Astro трактует каждый файл как отдельный
 * entry с id = "{base}.{locale}". Translation-pair check
 * (каждый base-id во всех активных локалях, либо
 * `monolingual: true`) — build-time скрипт, добавится отдельно.
 *
 * Anti-hardcode: цены живут только в tiers[]; никакие денежные
 * значения свободным текстом в MDX-теле не допускаются (см.
 * .agent/rules/forbidden.md §Anti-hardcode + pre-commit hook).
 */

import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

/**
 * Helper: glob loader для коллекций с конвенцией `[id].{locale}.mdx`.
 * Сохраняет точки в id ("home.en", "beginner.ru"); по умолчанию
 * Astro их стирает (homeen / beginnerru). Locale вытаскивается на
 * стороне template/utility — split('.').pop().
 */
function localeAwareGlob(name: string) {
  return glob({
    pattern: "**/*.{md,mdx}",
    base: `./src/content/${name}`,
    generateId: ({ entry }) => entry.replace(/\.mdx?$/, ""),
  });
}

// ============================================================
// Shared sub-schemas
// ============================================================

/**
 * SEO-блок присутствует в каждом публичном frontmatter.
 * Title/description границы — рекомендации SERP, не жёсткие лимиты.
 */
const seoSchema = z.object({
  title: z.string().min(10).max(70),
  description: z.string().min(50).max(180),
  og_image: z.string().optional(), // R2 ключ: "media/og/home.en.jpg"
  noindex: z.boolean().optional(),
});

/**
 * Открытое множество фич тира (Architecture v0.8.1 §5).
 * Ключи определяют методисты/админ; используются в:
 *  - сравнительной таблице на странице программы
 *  - Worker assertAccess / resolveAndAuthorize для проверок доступа
 */
const tierFeaturesSchema = z.record(
  z.string(),
  z.union([z.boolean(), z.number().int().nonnegative(), z.string()]),
);

/** Базовый tier — общий между programme и bundle. */
const tierBaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  base_price_amount: z.number().int().nonnegative(), // центы
  base_price_currency: z.string().length(3), // ISO 4217
  features: tierFeaturesSchema,
});

/** Bundle tier — добавляет savings_vs_separate. */
const bundleTierSchema = tierBaseSchema.extend({
  savings_vs_separate: z.number().int().nonnegative().optional(),
});

/** Monolingual override — для контента без translation pair. */
const monolingualField = { monolingual: z.boolean().optional() } as const;

// ============================================================
// Collections
// ============================================================

const programmes = defineCollection({
  loader: localeAwareGlob("programmes"),
  schema: z.object({
    title: z.string().min(1),
    summary: z.string().min(1),
    duration_weeks: z.number().int().positive().optional(), // производная для отображения
    tiers: z.array(tierBaseSchema).min(1),
    seo: seoSchema,
    ...monolingualField,
  }),
});

const bundles = defineCollection({
  loader: localeAwareGlob("bundles"),
  schema: z.object({
    title: z.string().min(1),
    summary: z.string().min(1),
    includes_programmes: z.array(z.string().min(1)).min(2), // ссылки на programme id (build-time валидация — отдельно)
    tiers: z.array(bundleTierSchema).min(1),
    seo: seoSchema,
    ...monolingualField,
  }),
});

const instructors = defineCollection({
  loader: localeAwareGlob("instructors"),
  schema: z.object({
    name: z.string().min(1),
    role: z.string().min(1), // "Film Director and Educator"
    photo_r2_key: z.string().optional(), // "media/instructors/<id>/photo.jpg"
    bio_short: z.string().optional(),
    social: z.record(z.string(), z.string().url()).optional(),
    seo: seoSchema.optional(),
    ...monolingualField,
  }),
});

const segments = defineCollection({
  loader: localeAwareGlob("segments"),
  schema: z.object({
    title: z.string().min(1),
    audience: z.string().min(1), // "Content creators going deeper"
    description: z.string().min(1),
    seo: seoSchema,
    ...monolingualField,
  }),
});

/**
 * pages — about, faq, contact, legal-*, home.
 * Free-form `sections`-объект — каждая страница может декларировать
 * свою структуру; рендер в .astro знает, какие секции ожидать.
 * Тип уточним когда появятся первые страницы (home + faq).
 */
const pages = defineCollection({
  loader: localeAwareGlob("pages"),
  schema: z.object({
    title: z.string().min(1),
    sections: z.record(z.string(), z.unknown()).optional(),
    faqs: z
      .array(
        z.object({
          q: z.string().min(1),
          a: z.string().min(1),
        }),
      )
      .optional(),
    seo: seoSchema,
    ...monolingualField,
  }),
});

const journal = defineCollection({
  loader: localeAwareGlob("journal"),
  schema: z.object({
    title: z.string().min(1),
    slug: z.string().min(1),
    date: z.coerce.date(),
    author: z.string().min(1), // имя редактора (агенты не подписываются)
    tags: z.array(z.string()).default([]),
    cover_r2_key: z.string().optional(),
    excerpt: z.string().min(1),
    seo: seoSchema,
    ...monolingualField,
  }),
});

const works = defineCollection({
  loader: localeAwareGlob("works"),
  schema: z.object({
    title: z.string().min(1),
    slug: z.string().min(1),
    year: z.number().int().min(1900).max(2100),
    director: z.string().min(1), // имя студента
    filmmakers: z
      .array(
        z.object({
          role: z.string().min(1),
          name: z.string().min(1),
        }),
      )
      .default([]),
    thumbnail_r2_key: z.string().optional(),
    video_r2_key: z.string().optional(),
    runtime_seconds: z.number().int().positive().optional(),
    programme_id: z.string().optional(), // ссылка на programme id, опционально
    seo: seoSchema,
    ...monolingualField,
  }),
});

export const collections = {
  programmes,
  bundles,
  instructors,
  segments,
  pages,
  journal,
  works,
};
