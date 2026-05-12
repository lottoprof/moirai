# Sprint 0 Stage 11 — Language switcher + sticky locale preference

## Context

Сейчас:
- `src/middleware.ts` парсит `Accept-Language` на корне `/` и
  редиректит 302 → `/en/` или `/ru/`. После редиректа locale
  заморожен URL-префиксом.
- В Nav и Footer **нет** переключателя языка.
- Чтобы сменить локаль, пользователь должен либо вручную править
  URL, либо менять браузерные настройки и заходить заново на `/`.

Для SEO это OK (hreflang+canonical на месте), но **UX страдает**:
русскоговорящий, попавший по англоязычному shared-link, не имеет
интерактивного способа перейти на свою локаль.

Stage 11 решает:
1. Добавляет видимый переключатель в Nav (правый верхний угол).
2. Сохраняет выбор пользователя в cookie `locale_pref` — следующий
   визит middleware уважает явный выбор поверх `Accept-Language`.
3. Не ломает SEO — клик по переключателю это обычный `<a>` с
   правильным href, краулеры могут перейти.

## Принципы

1. **Прогрессивное улучшение.** Базовый switcher — `<a>` элементы,
   работают без JS. Cookie-сохранение — JS-апгрейд для удобства,
   но без него сайт по-прежнему функционален.
2. **Никакого client:* hydration.** Vanilla `<script>` в одном
   месте, как Nav scroll listener (Stage 4b).
3. **Аналитично к рутингу.** Клик меняет последний known-locale
   сегмент URL, сохраняя остальной path. `/en/beginner` → `/ru/beginner`.
   Если path не начинается с локали (`/en/...` / `/ru/...`) —
   fallback на `/{target-locale}/`.
4. **Cookie не PII.** `locale_pref=ru`, httpOnly не нужен (читаем
   из JS для immediate apply), `SameSite=Lax`, длинный TTL (1 год),
   `Secure` (HTTPS only).

## Этапы

### 11a — UI компонент

`src/components/public/LangSwitcher.astro`:

```astro
---
interface Props {
  current: "en" | "ru";
  pathname: string;
}
const { current, pathname } = Astro.props;

// Strip leading /{locale}/ — для построения href с другой локалью.
const stripped = pathname.replace(/^\/(en|ru)(\/|$)/, "/");
const targets = {
  en: stripped === "/" || stripped === "" ? "/en/" : `/en${stripped}`,
  ru: stripped === "/" || stripped === "" ? "/ru/" : `/ru${stripped}`,
};
---

<div class="lang-switcher" role="group" aria-label="Language">
  <a
    href={targets.en}
    class={current === "en" ? "lang-switcher__item is-active" : "lang-switcher__item"}
    hreflang="en"
    lang="en"
    data-locale="en"
  >EN</a>
  <span class="lang-switcher__sep" aria-hidden="true">/</span>
  <a
    href={targets.ru}
    class={current === "ru" ? "lang-switcher__item is-active" : "lang-switcher__item"}
    hreflang="ru"
    lang="ru"
    data-locale="ru"
  >RU</a>
</div>

<style>
  .lang-switcher {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2xs);
    font-size: var(--type-micro-md);
    font-weight: 500;
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }
  .lang-switcher__item {
    color: var(--text-muted);
    padding: 2px 4px;
    transition: color var(--duration-fast) var(--ease-out);
  }
  .lang-switcher__item:hover { color: var(--amber); }
  .lang-switcher__item.is-active { color: var(--paper); }
  .lang-switcher__sep { color: var(--text-faint); }
</style>

<script>
  /* Сохраняем явный выбор в cookie locale_pref на 1 год.
   * Middleware на следующем визите уважит этот cookie поверх
   * Accept-Language. */
  document.querySelectorAll(".lang-switcher__item").forEach((a) => {
    a.addEventListener("click", () => {
      const locale = (a as HTMLElement).dataset.locale;
      if (locale === "en" || locale === "ru") {
        document.cookie = `locale_pref=${locale}; path=/; max-age=31536000; samesite=lax; secure`;
      }
    });
  });
</script>
```

### 11b — интеграция в Nav

`src/components/public/Nav.astro` обновить:

```astro
import LangSwitcher from "./LangSwitcher.astro";

interface Props { locale: "en" | "ru"; pathname: string; }
const { locale, pathname } = Astro.props;
// ...
<nav class="nav" aria-label={labels.aria}>
  <a href={`/${locale}/`} class="nav__logo">Moirai.</a>
  <div class="nav__right">
    <LangSwitcher current={locale} pathname={pathname} />
    <a href={`/${locale}/apply`} class="nav__cta">{labels.cta}</a>
  </div>
</nav>
```

И в `Layout.astro` пробросить `pathname`:

```astro
<Nav locale={locale} pathname={pathname} />
```

Scoped стиль `.nav__right` — flex с gap для switcher + CTA.

### 11c — middleware: cookie > Accept-Language

`src/middleware.ts` обновить `detectLocale`:

```ts
function detectLocale(
  cookie: string | null,
  acceptLanguage: string | null
): Locale {
  // Cookie has highest priority — явный пользовательский выбор.
  if (cookie) {
    const match = cookie.match(/locale_pref=(en|ru)/);
    if (match && isSupportedLocale(match[1])) return match[1] as Locale;
  }
  // Fallback: Accept-Language как раньше.
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const tags = acceptLanguage.split(",");
  for (const raw of tags) {
    const tag = raw.trim().split(";")[0]?.toLowerCase().slice(0, 2) ?? "";
    if (isSupportedLocale(tag)) return tag;
  }
  return DEFAULT_LOCALE;
}

// В onRequest:
if (ctx.url.pathname === "/") {
  const locale = detectLocale(
    ctx.request.headers.get("cookie"),
    ctx.request.headers.get("accept-language"),
  );
  return new Response(null, {
    status: 302,
    headers: { Location: `/${locale}/`, "X-Robots-Tag": "noindex" },
  });
}
```

### 11d — verification

Локально через `wrangler pages dev ./dist`:

```bash
# 1. Без cookie, Accept-Language: en → /en/
curl -sI -H "Accept-Language: en" http://127.0.0.1:8788/

# 2. Без cookie, Accept-Language: ru → /ru/
curl -sI -H "Accept-Language: ru" http://127.0.0.1:8788/

# 3. С cookie locale_pref=ru, AL=en → /ru/ (cookie wins)
curl -sI -H "Cookie: locale_pref=ru" -H "Accept-Language: en" http://127.0.0.1:8788/

# 4. С cookie locale_pref=en, AL=ru → /en/
curl -sI -H "Cookie: locale_pref=en" -H "Accept-Language: ru" http://127.0.0.1:8788/
```

В браузере:
- Открыть `/en/` → клик "RU" → URL стал `/ru/`, cookie `locale_pref=ru` появилась
- Открыть `/` → middleware редиректит на `/ru/` (cookie wins)
- В DevTools удалить cookie → `/` снова отдаёт `/en/` (по Accept-Language)

## Verification

После всех этапов:
- [ ] Switcher виден в правом верхнем углу Nav на всех публичных
      страницах
- [ ] EN/RU работают без JS (как обычные ссылки)
- [ ] Клик с JS → cookie ставится на 1 год
- [ ] Middleware: cookie > Accept-Language → пользователь, явно
      выбравший язык, не получает "wrong locale" при следующем
      `/` визите
- [ ] Switcher сохраняет path при смене локали: `/en/beginner` →
      `/ru/beginner` (НЕ `/ru/`)
- [ ] `pnpm lint && pnpm typecheck && pnpm build` зелёные
- [ ] Production: 4 curl-сценария из 11d отдают ожидаемое

## Out of scope

- **Третья локаль** (`uk`, `es`, etc.) — добавляется правкой
  `SUPPORTED_LOCALES` в middleware + новые `.mdx` пары + новый item
  в switcher. Не делаем спекулятивно.
- **Auto-detect через GeoIP** (CF-IPCountry header) — отказ:
  Accept-Language адекватен для бинарного выбора, IP не всегда
  совпадает с языковыми предпочтениями.
- **Toggle через client:* island** — отказ: vanilla `<script>` на
  10 строк, hydration framework — overkill.
- **Persistent на per-user уровне** (когда появится auth) — после
  Sprint 1+. Тогда cookie дополнится polling'ом БД (users.locale_pref).
  Сейчас cookie — достаточный source of truth для гостей.
- **A11y enhancements** (announce locale change через aria-live) —
  минимально работает через `lang` атрибут на каждой ссылке; больше
  — отдельная a11y-доводка.

## Critical files

- `src/components/public/LangSwitcher.astro` (новый)
- `src/components/public/Nav.astro` (props + render)
- `src/layouts/public/Layout.astro` (proboard pathname)
- `src/middleware.ts` (cookie-aware detectLocale)

## Reference

- `docs/Architecture.md` §3 — i18n routing
- `docs/Home_page_SEO.md` §3 — hreflang/canonical
- MDN — `Set-Cookie` SameSite/Secure attributes
- `src/middleware.ts` (текущий middleware)
