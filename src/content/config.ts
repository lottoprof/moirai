/*
 * Content Collections — zod-схемы для коллекций из
 * docs/Architecture.md §4 + Home_page_SEO.md §6.
 *
 * Конвенция файлов: `[id].{locale}.mdx` (locale в [en, ru], см.
 * astro.config.mjs). Astro трактует каждый файл как отдельный
 * entry с id = "{base}.{locale}".
 *
 * Anti-hardcode: цены живут только в programme frontmatter; никакие
 * денежные значения свободным текстом в MDX-теле не допускаются (см.
 * .agent/rules/forbidden.md §Anti-hardcode).
 *
 * Модули в programmes — список slug'ов (D1 modules). Programme — wrapper
 * над модулями + price + features. См. decisions 2026-05-17 §programmes
 * и 2026-05-19 §module-metadata.
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
 * Открытое множество фич programme'ы (Architecture v0.8.x → decisions 2026-05-17).
 * Ключи определяют методисты/админ; используются на странице programme
 * и в snapshot при создании enrollment.features_json.
 */
const programmeFeaturesSchema = z.record(
  z.string(),
  z.union([z.boolean(), z.number().int().nonnegative(), z.string()]),
);

/** Marketing-блок programme: hero-данные для страницы и карточки на главной. */
const programmeMarketingSchema = z.object({
  tagline: z.string().min(1),       // 1 строка, hero-eyebrow
  hero_lede: z.string().min(1),     // абзац под hero
  hero_image: z.string().optional(), // R2 ключ или path
  cta_label: z.string().min(1),      // "Apply now" / "Get started"
});

/** Monolingual override — для контента без translation pair. */
const monolingualField = { monolingual: z.boolean().optional() } as const;

// ============================================================
// Collections
// ============================================================

/**
 * programmes — wrapper над набором модулей (decisions 2026-05-17 §programmes).
 *
 * `modules` — упорядоченный список module slugs из D1. Может быть 1+
 * (single-module programme типа "budget-calculation" допустим, см.
 * decisions 2026-05-19).
 *
 * `module_count` / `lessons_total` — denormalized static hints (для
 * отображения на главной без runtime D1 fetch). Обновляются manually
 * при изменении modules[] или через build-script.
 *
 * Price snapshot копируется в `enrollments.price_paid_amount` /
 * `features_json` при создании enrollment.
 */
const programmes = defineCollection({
  loader: localeAwareGlob("programmes"),
  schema: z.object({
    title: z.string().min(1),
    summary: z.string().min(1),
    marketing: programmeMarketingSchema,
    modules: z.array(z.string().min(1)),                 // pусто для individual; для bundle — все 24 slug'a
    module_count_hint: z.number().int().nonnegative(),   // denormalized hint
    lessons_total_hint: z.number().int().nonnegative(),  // denormalized hint
    price_amount: z.number().int().nonnegative(),        // центы; 0 для individual (договорная)
    price_currency: z.string().length(3),                // ISO 4217
    features: programmeFeaturesSchema,
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

/**
 * legal — статичные юридические документы: privacy, terms, refund, cookies.
 * Каждый документ — отдельный MDX с frontmatter (title, version, last_updated)
 * и markdown body. Rendered через /[locale]/legal/[id].astro.
 *
 * `kind` фиксирует тип документа (для индекса в footer / sitemap).
 * `version` — увеличивается при substantive changes (audit trail).
 * `last_updated` — дата последней правки текста, отображается в шапке.
 */
const legal = defineCollection({
  loader: localeAwareGlob("legal"),
  schema: z.object({
    title: z.string().min(1),
    kind: z.enum(["privacy", "terms", "refund", "cookies"]),
    version: z.string().min(1),         // "0.1-draft", "1.0", "1.1" и т.д.
    last_updated: z.coerce.date(),
    draft: z.boolean().default(true),   // показывать DRAFT-баннер до утверждения юристом
    seo: seoSchema,
    ...monolingualField,
  }),
});

export const collections = {
  programmes,
  instructors,
  segments,
  pages,
  journal,
  works,
  legal,
};
