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
    /**
     * Stage 14 FLOW-29: видимость в публичном каталоге.
     *   true (default)  — programme в /apply grid, /home cards, новые cohorts публикуются
     *   false           — visible только по прямой ссылке (/programmes/<id>),
     *                     скрыто из grid'ов, новые cohorts НЕ публикуются,
     *                     existing cohorts продолжают работать
     */
    published: z.boolean().default(true),
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
    /**
     * YouTube video ID (11 chars). Source: видео живёт на YouTube,
     * embed через youtube-nocookie domain (lite-load + GDPR safe).
     * Thumbnail — auto от YouTube CDN
     * (img.youtube.com/vi/<id>/maxresdefault.jpg). Detail: см.
     * docs/methodist-works-guide.md §"Добавление новой работы".
     *
     * Optional: если работа ещё без видео (placeholder mock или
     * coming-soon), на index показываем серый блок, на detail
     * скрываем player.
     */
    youtube_id: z.string().length(11).optional(),
    /** Optional R2 key для custom thumbnail если YouTube auto-thumb не
        подходит (например для festival poster). Default — YouTube CDN. */
    thumbnail_override: z.string().optional(),
    runtime_seconds: z.number().int().positive().optional(),
    programme_id: z.string().optional(), // ссылка на programme id, опционально
    seo: seoSchema,
    ...monolingualField,
  }),
});

/**
 * announcements — top bar сообщения над публичной навигацией.
 *
 * Stage 24: типы (soon/new/promo/cohort/info) → визуальный вариант
 * в <AnnouncementBar />. Lifecycle через starts_at / ends_at; активные
 * фильтруются на SSR/SSG-стороне. priority — сортировка при множественных
 * активных (ротация на клиенте каждые 7s).
 *
 * dismissible: true → крестик справа + cookie moirai_announce_dismissed
 * с массивом slug'ов (TTL 7d). false → нельзя скрыть.
 *
 * Markdown body не используется; один `text` достаточно. cta — опционально.
 */
const announcements = defineCollection({
  loader: localeAwareGlob("announcements"),
  schema: z.object({
    kind: z.enum(["soon", "new", "promo", "cohort", "info"]),
    text: z.string().min(1).max(160),
    cta_text: z.string().min(1).max(40).optional(),
    cta_href: z.string().min(1).max(2048).optional(),
    starts_at: z.coerce.date(),
    ends_at: z.coerce.date(),
    priority: z.number().int().min(0).max(10).default(5),
    dismissible: z.boolean().default(true),
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
  announcements,
};
