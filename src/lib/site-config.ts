/*
 * Глобальные константы сайта — используются в schema.org JSON-LD,
 * canonical/OG, sitemap, RSS (будущее).
 *
 * Источник истины для:
 *   - SITE.url   — origin для абсолютных URL (canonical, JSON-LD @id)
 *   - SITE.name  — brand для Organization, OG, title fallback
 *   - SITE.logo  — currentColor SVG в /favicon.svg (тот же что favicon)
 *   - SITE.email — контакт для legal/about/contact (placeholder ok)
 *   - SITE.social — массив URL для Organization.sameAs[]
 *
 * Менять здесь, не в схема-компонентах.
 */

export const SITE = {
  url: "https://moiraionline.pro",
  name: "Moirai",
  legalName: "Moirai Online Filmmaking Program",
  logo: "https://moiraionline.pro/favicon.svg",
  email: "hello@moiraionline.pro",
  social: [] as string[],
  /**
   * Глобальный OG-fallback (1200×630). Используется в SeoHead когда
   * у страницы нет per-page `seo.og_image`. Генерится через
   * scripts/generate-og-default.mjs, коммитится в public/.
   */
  ogDefault: "/og-default.png",
  /**
   * Зоны обслуживания для Schema.org Organization.areaServed. Online-
   * курс физически расположен везде, но инструкторы — практикующие
   * NYC-режиссёры, и основная целевая аудитория US/NY. Помогает Google
   * связать сайт с гео-запросами "filmmaking New York" даже без
   * физического адреса.
   */
  areaServed: ["New York", "United States"] as readonly string[],
} as const;

/** Per-locale описание организации — короткое, для Organization.description. */
export const SITE_DESCRIPTION = {
  en: "Hands-on online filmmaking course taught by working New York directors. Two levels — Beginner and Intermediate — with cohorts of up to 10 students, personal feedback on every assignment, and a finished short film at the end of each level.",
  ru: "Онлайн-курс кино с практикующими нью-йоркскими режиссёрами. Два уровня — Beginner и Intermediate — группы до 10 человек, личный разбор каждой работы, готовый короткометражный фильм по итогам каждого уровня.",
} as const;
