# Sprint 0 — Первый деплой на Cloudflare Pages

## Context

Главная страница `/en/` + `/ru/` сейчас собирается (`pnpm build` → `dist/`).
Стилизация ещё в работе (Stage 4: 4a foundation + 4b page chrome
готовы; 4c-4f впереди). Идея — задеплоить **до завершения стилизации**,
чтобы:

1. Раньше валидировать deploy-pipeline (`@astrojs/cloudflare` adapter,
   middleware root-redirect, prerender'ы, sitemap) на реальном CF
   runtime, а не только локально.
2. Catch surprises (compat-флаги, edge-incompat зависимости, размеры
   bundles, cold-start) — пока поверхность маленькая, отладка дешевле.
3. Получить **публичный URL** (`*.pages.dev`) — можно делиться
   ссылкой на work-in-progress, проверять что hreflang/canonical/OG
   корректны через внешние инструменты (Google Rich Results, OG
   debuggers).
4. Дальше каждый stage стилизации даёт **видимую разницу на
   проде** через push → redeploy.

## Решения

- **Путь — wrangler-driven** (`pnpm exec wrangler pages deploy ./dist`).
  Ручной первый раз, прозрачно. Git-driven (CF Pages auto-build на
  push) — отдельная задача после, когда pipeline проверен.
- **Project name** — `moirai`. URL: `https://moirai.pages.dev`
  (если занят, CF добавит суффикс).
- **Custom domain `moirai.film`** — НЕ в этом плане. Отдельная
  задача после первого успешного *.pages.dev деплоя
  (нужно настроить DNS на CF + Pages routing).
- **Биндинги** (D1/KV/R2/secrets) — НЕ в этом деплое. Сейчас в
  `wrangler.toml` все биндинги закомментированы. Главная статика +
  middleware не требуют биндингов. Биндинги добавятся отдельными
  деплоями когда появятся фичи требующие persistent storage / auth.
- **Pre-deploy verify** — `pnpm build` локально + быстрый smoke
  через `pnpm exec wrangler pages dev ./dist` (CF runtime emulator).
  Если smoke OK — pushим на CF.

## Prerequisites (от пользователя)

1. **CF аккаунт.** Login на dashboard.cloudflare.com.
2. **Wrangler auth** — один раз в терминале:
   ```
   ! pnpm exec wrangler login
   ```
   Откроется браузер, авторизуется. Без этого `wrangler pages
   deploy` упадёт.
3. **Подтверждение** — деплой создаёт реальный публичный URL.
   Прямого вреда нет (статика + redirect, ничего не пишется в БД),
   но это shared/production action и требует явного "go".

## Этапы

### 4d-1 — pre-deploy подготовка (агент)

- `package.json scripts`:
  - `deploy`: `pnpm build && pnpm exec wrangler pages deploy ./dist --project-name moirai`
  - `deploy:preview`: то же + `--branch preview-{name}` (для preview-деплоев per-feature)
- `.agent/skills/deploy/SKILL.md`: актуализировать под текущий
  wrangler 4 flow (preflight → action → validation → rollback)
- `docs/runbook-deploy.md`: пользовательский runbook на 1 страницу
  (preflight checklist, шаги, что проверить после)
- Никаких реальных деплоев на этом этапе.

### 4d-2 — local smoke (агент → пользователь)

```bash
pnpm build
pnpm exec wrangler pages dev ./dist
# открыть в браузере: localhost:8788
```

Проверить:
- `/` → 302 на `/en/` (если `Accept-Language: en`) или на `/ru/`
- `/en/` рендерится, hreflang в `<head>`, canonical правильный
- `/ru/` рендерится
- `/sitemap-index.xml` отдаётся

Если что-то падает — разбираем до production-деплоя.

### 4d-3 — first production deploy (пользователь триггерит)

```bash
! pnpm exec wrangler login          # один раз
! pnpm deploy                        # первый push
```

Wrangler:
- Создаст CF Pages project `moirai` (первый раз спросит подтверждение)
- Загрузит `dist/`
- Вернёт URL `https://moirai.pages.dev` (или с хешем)

### 4d-4 — production validation

Проверки на полученном URL:

```bash
# Root redirect
curl -I https://moirai.pages.dev/         # → 302 Location: /en/ или /ru/
                                           # + X-Robots-Tag: noindex

# Locales
curl -s https://moirai.pages.dev/en/ | head -30
curl -s https://moirai.pages.dev/ru/ | head -30

# SEO meta
curl -s https://moirai.pages.dev/en/ | grep -E '<title>|hreflang|canonical|og:'

# Sitemap
curl -s https://moirai.pages.dev/sitemap-index.xml
```

Внешние инструменты:
- Google Rich Results Test → главная не падает (Schema.org появится Stage 6)
- Open Graph debugger (Facebook / LinkedIn) → og:image undefined пока
- Lighthouse → baseline (PSI 100/100 — Stage 8, не сейчас)

### 4d-5 — rollback стратегия

- Wrangler хранит последние N деплоев. Откат:
  ```
  pnpm exec wrangler pages deployments list --project-name moirai
  pnpm exec wrangler pages deployments rollback <deployment-id> --project-name moirai
  ```
- В аварии — отключение Pages routing в CF dashboard.

### 4d-6 — custom domain (отдельная задача после 4d-3 успеха)

Не в этом плане. Шаги:
- DNS `moirai.film` на CF nameservers (или CNAME на pages.dev)
- В CF Pages → Custom domains → add `moirai.film`
- CF выпустит TLS, подключит routing
- Проверить redirect от `pages.dev` на `moirai.film` (или наоборот —
  каноник делать на `moirai.film`)

## Verification

После 4d-3:
- [ ] CF Pages показывает projet `moirai` со статусом успешного деплоя
- [ ] `https://moirai.pages.dev/` редиректит 302 на `/en/` или `/ru/`
- [ ] `/en/` и `/ru/` отдают HTML
- [ ] hreflang/canonical/OG meta-теги корректные
- [ ] sitemap-index.xml + sitemap-0.xml доступны
- [ ] `wrangler pages deployments list` показывает деплой
- [ ] curl на `/admin/*` или другие ещё-не-существующие страницы
  возвращает 404 (или Astro дефолтный)

## Out of scope (отдельные задачи)

- **Custom domain** `moirai.film` — после первого pages.dev деплоя
- **Git-driven deploy** (CF Pages auto-build на push в main) —
  после ручного pipeline валидации
- **GitHub Actions для CI/CD** — после git-driven базовой настройки
- **Биндинги** (D1/KV/R2/secrets) — когда появится первая фича
  использующая persistent storage
- **Preview deployments per-PR** — после git-driven
- **Edge analytics / Workers Analytics** — отдельно
- **PSI audit / Lighthouse 100/100** — Stage 8 после полной
  стилизации и шрифтов

## Critical files

- `package.json` (scripts.deploy, deploy:preview)
- `.agent/skills/deploy/SKILL.md` (актуализация)
- `docs/runbook-deploy.md` (новый, пользовательский)
- `wrangler.toml` (уже настроен на этом этапе — без биндингов)

## Reference

- `.agent/skills/wrangler/SKILL.md` — команды wrangler 4
- `wrangler.toml` — текущий конфиг
- Architecture v0.8.1 §12 — workflow с D1 (для будущих этапов)
- Cloudflare Pages docs: pages.cloudflare.com/get-started/

## Что прервано в данный момент

`plans/active/sprint0-stage4-styles.md` всё ещё активен — Stage 4
стилизация на 4a-4b (foundation + page chrome). 4c-4f
(hero/ticker/cards/faq/finalcta + integration) идут после деплоя
или параллельно — деплой каждого инкремента через `pnpm deploy`
будет показывать прогресс на проде.
