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

/**
 * Format live-session time в Eastern Time (America/New_York).
 *
 * FLOW-26 / migrations/0009: все live-сессии (slots/cohorts/sessions)
 * привязаны к ET. UI ВСЕГДА показывает ET, не зависит от browser/user TZ.
 *
 * Пример: "Thu, Jun 11, 01:00 PM ET" (en) / "чт, 11 июн., 13:00 ET" (ru).
 */
export function formatSessionTime(date: Date, locale: Locale): string {
  const fmt = new Intl.DateTimeFormat(INTL_LOCALES[locale], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(date);
  return `${fmt} ET`;
}
