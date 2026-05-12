import { defineMiddleware } from "astro:middleware";

/*
 * Локали — синхронны с astro.config.mjs (i18n.locales).
 * Один источник правды: тут, плюс astro.config.mjs читает то же самое.
 * Если расширим список локалей — правка нужна в обоих местах
 * (см. рекомендацию в decisions_archive.md, локали как данные).
 */
const SUPPORTED_LOCALES = ["en", "ru"] as const;
type Locale = (typeof SUPPORTED_LOCALES)[number];
const DEFAULT_LOCALE: Locale = "en";

function isSupportedLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Detect preferred locale. Приоритет:
 *   1. Cookie `locale_pref` — явный пользовательский выбор через
 *      <LangSwitcher /> (Stage 11).
 *   2. Заголовок `Accept-Language` — первое совпадение по 2-символьному
 *      языковому тегу. Q-фактор не учитываем (избыточно для 2 локалей).
 *   3. DEFAULT_LOCALE (`en`).
 */
function detectLocale(
  cookie: string | null,
  acceptLanguage: string | null,
): Locale {
  if (cookie) {
    const m = cookie.match(/(?:^|;\s*)locale_pref=(en|ru)(?:;|$)/);
    if (m && isSupportedLocale(m[1])) return m[1];
  }
  if (acceptLanguage) {
    const tags = acceptLanguage.split(",");
    for (const raw of tags) {
      const tag = raw.trim().split(";")[0]?.toLowerCase().slice(0, 2) ?? "";
      if (isSupportedLocale(tag)) return tag;
    }
  }
  return DEFAULT_LOCALE;
}

export const onRequest = defineMiddleware((ctx, next) => {
  // Root: редирект на /{detected-locale}/ + X-Robots-Tag: noindex,
  // чтобы / не плодил duplicate content с локализованными версиями.
  // См. docs/Home_page_SEO.md §3, docs/Architecture.md §3.
  if (ctx.url.pathname === "/") {
    const locale = detectLocale(
      ctx.request.headers.get("cookie"),
      ctx.request.headers.get("accept-language"),
    );
    return new Response(null, {
      status: 302,
      headers: {
        Location: `/${locale}/`,
        "X-Robots-Tag": "noindex",
      },
    });
  }

  // Auth-guard для [locale]/dashboard/** и /admin/** добавится здесь
  // когда появятся auth_sessions и роуты dashboard/admin
  // (см. docs/Architecture.md §13, .agent/rules/security.md).

  return next();
});
