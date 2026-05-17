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

export const onRequest = defineMiddleware(async (ctx, next) => {
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

  // /admin/** auth-guard в middleware. Astro page-level redirect для
  // non-[locale] SSR routes возвращает 404 со статусом (Astro 5 + CF
  // adapter quirk — Response из frontmatter не сохраняет status 302).
  // Middleware-level redirect работает корректно.
  if (ctx.url.pathname === "/admin" || ctx.url.pathname.startsWith("/admin/")) {
    const env = ctx.locals.runtime.env;
    const { verifyRefreshSession } = await import("./lib/server/session");
    const { getUserWithRoles } = await import("./lib/server/guards");
    const session = await verifyRefreshSession(env, ctx.request);
    if (!session) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: `/en/login?return_to=${encodeURIComponent(ctx.url.pathname + ctx.url.search)}`,
        },
      });
    }
    const user = await getUserWithRoles(env, session.userId);
    if (!user) {
      return new Response(null, {
        status: 302,
        headers: { Location: `/en/login` },
      });
    }
    if (user.deactivated_at !== null) {
      return new Response(null, {
        status: 302,
        headers: { Location: `/${user.locale}/inactive` },
      });
    }
    if (!user.roles.has("admin")) {
      return new Response(null, { status: 404 });
    }
    // Прокидываем user в ctx.locals чтобы admin page не дублировал query
    (ctx.locals as unknown as Record<string, unknown>).adminUser = user;
  }

  return next();
});
