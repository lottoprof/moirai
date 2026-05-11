---
name: deploy
description: Use this skill for any moirai deployment to Cloudflare Pages. Covers wrangler-driven deploys (production/preview), local smoke via CF runtime emulator, post-deploy verification, and rollback. Always read .agent/skills/wrangler/SKILL.md first.
---

# Deploy — Cloudflare Pages

## Scope

Деплой Astro 5 проекта **moirai** на Cloudflare Pages через wrangler 4.

Поддерживается **wrangler-driven** путь — явный `wrangler pages
deploy` с локальной машины или из CI. Git-driven (Pages подключён к
GitHub-репозиторию с auto-build на push) — отдельная задача после
валидации ручного пайплайна.

## Out of scope

- Workers (отдельные воркеры вне Pages) — другой skill.
- DNS / привязка кастомного домена `moirai.film` — операция
  пользователя в CF Dashboard. Отдельный план после первого
  `*.pages.dev` деплоя.
- Биндинги (D1/KV/R2/secrets) — добавятся когда появятся фичи,
  требующие persistent storage. На первом деплое все биндинги в
  `wrangler.toml` закомментированы.

## Prerequisites

1. Прочитан `.agent/skills/wrangler/SKILL.md`.
2. Wrangler авторизован — операция пользователя (один раз):

   ```bash
   ! corepack pnpm exec wrangler login
   ```

   Откроется браузер, OAuth-токен ляжет в `~/.config/.wrangler/`.

3. Quality gates пройдены локально:

   ```bash
   pnpm lint
   pnpm typecheck
   pnpm build
   ```

   `dist/` должен существовать перед `wrangler pages deploy`.

## Preflight checklist (агент перед триггером деплоя)

- [ ] `git status` чистый (нет незакоммиченных файлов, иначе
      `--commit-dirty` пометит деплой как «грязный»).
- [ ] `pnpm build` отработал, `dist/` существует и не пустой.
- [ ] `wrangler.toml` валиден (см. `wrangler` skill — `name`,
      `compatibility_date`, `pages_build_output_dir`).
- [ ] Биндинги, реально используемые в коде, объявлены в
      `wrangler.toml` (для первого деплоя — пусто, биндингов нет).
- [ ] Понятно, куда деплоим: production (`main`) или preview (ветка).

## Local smoke (CF runtime emulator)

Перед production-деплоем — обязательный smoke на локальном
miniflare. Auth НЕ требуется.

```bash
pnpm build
pnpm exec wrangler pages dev ./dist
# открыть http://localhost:8788
```

Проверить:
- `/` → 302 на `/en/` или `/ru/` (`Accept-Language`-зависимо)
  + `X-Robots-Tag: noindex` на корне.
- `/en/` и `/ru/` рендерят HTML, hreflang/canonical в `<head>`.
- `/sitemap-index.xml` отдаётся.
- В консоли wrangler нет фатальных ошибок (warnings про KV
  `SESSION` сейчас игнорируем — биндинг закомментирован).

Если smoke падает — фиксим до production. На прод не выкатываем
неработающее.

## Wrangler-driven deploy

### Production

```bash
pnpm deploy
# = pnpm build && wrangler pages deploy ./dist \
#     --project-name moirai --branch main
```

При первом запуске wrangler:
- спросит создать Pages-проект `moirai` (Enter — соглашаемся);
- зальёт `dist/`;
- вернёт URL вида `https://<hash>.moirai.pages.dev`;
- production URL — `https://moirai.pages.dev` (или с суффиксом
  если имя занято).

Маркеры успеха в выводе:
- `✨ Deployment complete!`
- Уникальный preview URL вида `https://<hash>.moirai.pages.dev`.
- Production алиас, если деплой на production-ветку (`main`).

**Не выполнять без явного `go` от пользователя.**

### Preview / branch deploy

```bash
pnpm deploy:preview
# = pnpm build && wrangler pages deploy ./dist --project-name moirai
```

Wrangler автоопределит текущую git-ветку и зальёт как preview
(URL вида `https://<branch>.moirai.pages.dev`). На production
не повлияет.

Удобно для e2e-агента и ручной проверки фич до merge в `main`.

## Post-deploy verification

```bash
DEPLOY_URL="https://moirai.pages.dev"

# Root redirect
curl -sI "$DEPLOY_URL/" | head -10
# → HTTP/2 302, Location: /en/ или /ru/, X-Robots-Tag: noindex

# Locales render
curl -s "$DEPLOY_URL/en/" | head -30
curl -s "$DEPLOY_URL/ru/" | head -30

# SEO meta
curl -s "$DEPLOY_URL/en/" | grep -E '<title>|hreflang|canonical|og:'

# Sitemap
curl -s "$DEPLOY_URL/sitemap-index.xml"
```

Внешние инструменты (опционально для первого деплоя):
- Google Rich Results Test — главная не падает.
- Open Graph debugger (Facebook / LinkedIn) — OG-теги читаются.
- Lighthouse / PSI — baseline (доводка 100/100 — Stage 8).

E2E через `agents/e2e.md` — против deploy-URL или preview.

## Logs / inspection

```bash
# Список последних деплоев
pnpm exec wrangler pages deployment list --project-name moirai

# Tail логов конкретного деплоя
pnpm exec wrangler pages deployment tail --project-name moirai

# Удалить конкретный deployment (редко нужно)
pnpm exec wrangler pages deployment delete <deployment-id> \
  --project-name moirai
```

## Rollback

Wrangler 4 **не имеет** first-class `rollback` команды для Pages.
Откат делается одним из путей:

1. **Через CF Dashboard** (предпочтительно, быстрее всего):
   Pages → moirai → Deployments → найти последний стабильный →
   "Rollback to this deployment". Production алиас переключится
   мгновенно.

2. **Re-deploy предыдущего коммита из git**:

   ```bash
   git checkout <good-commit>
   pnpm deploy
   git checkout main
   ```

   Новый deployment станет production, broken — уйдёт в историю.

3. **Аварийное отключение** — в CF Dashboard → Pages → moirai →
   Settings → Custom domains / Routing → отключить production
   route. Restore — обратное действие.

## Pitfalls

1. **`./dist` не существует** — `wrangler pages deploy` упадёт.
   `pnpm deploy` это решает (`pnpm build` встроен в скрипт), но
   при ручном вызове проверяй сам.
2. **`--branch main` важен для production** — без него wrangler
   возьмёт текущую git-ветку. Если deploy запускается из ветки
   `feat/...`, без `--branch main` уйдёт preview-деплой.
3. **`compatibility_date` устарел** — runtime может ругнуться при
   деплое. Обновлять отдельным коммитом с прогоном гейтов.
4. **Биндинги в коде vs `wrangler.toml`** — если код читает
   `Astro.locals.runtime.env.DB`, а в `wrangler.toml` нет
   `[[d1_databases]]` — runtime упадёт. Биндинги добавляются
   парой: код + `wrangler.toml` + `pnpm exec wrangler types` +
   commit.
5. **Секреты для production** — `.dev.vars` не уезжает на прод.
   `wrangler pages secret put <NAME> --project-name moirai` для
   каждого секрета.
6. **`--commit-dirty=true`** wrangler ставит автоматически если
   `git status` грязный — это видно в имени деплоя в Dashboard.
   Не критично, но для production предпочтительно деплоить с
   чистого worktree.
7. **Деплой без `pnpm typecheck`** — build может пройти, а edge
   runtime сломается на типах. Гейты обязательны
   (`rules/quality-gates.md`).
