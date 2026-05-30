/*
 * format-date.ts — Intl.DateTimeFormat helper per-locale.
 *
 * Used by /journal listing and detail for "May 30, 2026" / "30 мая 2026"
 * style date display. Server-only (no client JS bundle impact).
 */

export type Locale = "en" | "ru";

const INTL_LOCALES: Record<Locale, string> = {
  en: "en-US",
  ru: "ru-RU",
};

/** Long form: "May 30, 2026" / "30 мая 2026 г." */
export function formatDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALES[locale], {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

/** ISO 8601 yyyy-mm-dd (для <time datetime="..."> и Schema.org). */
export function formatDateIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}
