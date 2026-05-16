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

## Production state (snapshot 2026-05-11)

| Что | Значение |
|---|---|
| CF account | `nastya.zasypkina@gmail.com` (ID `f168a42429d35c55d7f43a6e40350e18`) |
| Pages project | `moirai` (имя `moirai` глобально занято → CF выдал URL с суффиксом) |
| Project URL | `https://moirai-c6e.pages.dev` |
| Production branch | `main` |
| Custom domain (canonical) | `https://moiraionline.pro` (apex) |
| Custom domain (alias) | `https://www.moiraionline.pro` |
| Zone ID `moiraionline.pro` | `8d1fe5f529fd8a010c6086b6623b44b3` |
| Zone settings | SSL=strict, always_use_https=on, min_tls=1.2, cname_flattening=flatten_at_root, HSTS=off |
| DNS records | apex+www CNAME → `moirai-c6e.pages.dev` (proxied) |
| TLS CA | Google, auto-renew |
| Bindings | нет, всё закомментировано в `wrangler.toml` |

## Out of scope

- Workers (отдельные воркеры вне Pages) — другой skill.
- Биндинги (D1/KV/R2/secrets) — добавятся когда появятся фичи,
  требующие persistent storage.
- **www → apex 308 redirect** — оба домена сейчас отдают одинаковый
  контент, canonical в HTML ведёт Google к apex. Если понадобится
  жёсткий redirect — CF Dashboard → moiraionline.pro → Rules →
  Redirect Rules (или Bulk Redirects).
- HSTS — отложить до Stage 8 (PSI audit). Включать аккуратно:
  браузеры кэшируют до 1 года, откатить тяжело.

## Prerequisites

1. Прочитан `.agent/skills/wrangler/SKILL.md`.
2. Wrangler авторизован — операция пользователя (один раз):

   ```bash
   ! corepack pnpm exec wrangler login
   ```

   Откроется браузер, OAuth-токен ляжет в `~/.config/.wrangler/`.

3. **Проверить аккаунт** — должен быть `nastya.zasypkina@gmail.com`:

   ```bash
   corepack pnpm exec wrangler whoami
   ```

   Если другой — `wrangler logout` и заново. Production-ресурсы
   moirai живут только в этом аккаунте.

4. Quality gates пройдены локально:

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

Wrangler:
- зальёт `dist/`;
- вернёт уникальный URL `https://<hash>.moirai-c6e.pages.dev`;
- обновит production alias `https://moirai-c6e.pages.dev`;
- custom domain `https://moiraionline.pro` начнёт отдавать новый
  контент через ~10-30 сек.

**Маркеры успеха** в выводе:
- `✨ Deployment complete!`
- Уникальный preview URL вида `https://<hash>.moirai-c6e.pages.dev`.
- Production алиас обновился (`https://moirai-c6e.pages.dev`).

**ВНИМАНИЕ:** если деплой делается на пустой проект (первый раз),
сначала создать его явно:

```bash
corepack pnpm exec wrangler pages project create moirai \
  --production-branch main
```

Wrangler `pages deploy` **НЕ** авто-создаёт проект (вернёт
`Project not found, code 8000007`).

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

## Custom domain — attach через API

Дашбордовый путь (1 клик) описан в `docs/runbook-deploy.md`. Через
API (нужен API token с `Account → Cloudflare Pages:Edit` +
`Zone DNS:Edit` на целевой зоне):

```bash
ACCT=f168a42429d35c55d7f43a6e40350e18
ZONE=8d1fe5f529fd8a010c6086b6623b44b3
TOKEN=<short-lived token>

# 1. Зарегистрировать домен в Pages-проекте
curl -X POST \
  "https://api.cloudflare.com/client/v4/accounts/$ACCT/pages/projects/moirai/domains" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"name":"moiraionline.pro"}'

# То же для www (по желанию)
curl -X POST \
  "https://api.cloudflare.com/client/v4/accounts/$ACCT/pages/projects/moirai/domains" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"name":"www.moiraionline.pro"}'

# 2. Создать CNAME-записи в зоне (CF Pages НЕ авто-создаёт их при
# attach через API, в отличие от dashboard-пути — это известное
# поведение, проверено 2026-05-11).
curl -X POST \
  "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"type":"CNAME","name":"moiraionline.pro","content":"moirai-c6e.pages.dev","proxied":true,"ttl":1}'

curl -X POST \
  "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"type":"CNAME","name":"www","content":"moirai-c6e.pages.dev","proxied":true,"ttl":1}'

# 3. Polling статуса — domain status переходит initializing →
# pending → active за 30 сек – 5 минут. TLS Google CA провизионится
# параллельно. На практике HTTPS работает раньше чем API
# отрапортует "active".
curl "https://api.cloudflare.com/client/v4/accounts/$ACCT/pages/projects/moirai/domains" \
  -H "Authorization: Bearer $TOKEN"
```

Apex `moiraionline.pro` работает через `cname_flattening =
flatten_at_root` (на этой зоне включено) — DNS-резолверы получают
A/AAAA от резолва `moirai-c6e.pages.dev`.

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
8. **Project name suffix `-c6e`** — глобальное имя `moirai` на
   `*.pages.dev` было занято когда создавали проект (2026-05-11).
   CF выдал `moirai-c6e.pages.dev`. Project name в API/wrangler
   остаётся `moirai` (без суффикса) — суффикс только в публичном
   URL. CNAME custom domain'ов указывают на `moirai-c6e.pages.dev`.
9. **CF API token verify ≠ token может всё** — verify endpoint
   подтверждает что токен валиден, но не показывает scopes. Если
   API возвращает `success: true, count: 0` на zones/list —
   это, скорее всего, **отсутствие** `Zone:Read` permission, а не
   реально пустой список. Проверять scopes пробами: account-level
   endpoints (`/accounts/{id}/pages/projects` и т.п.) возвращают
   401/403 явно если scope не выдан.
10. **`commit_message` UTF-8 false-positive** (wrangler 4.90.0,
    2026-05-16). CF Pages API отклоняет `commit_message`
    длиннее ~250 байт с misleading-ошибкой `8000111: Invalid
    commit message, it must be a valid UTF-8 string` — даже если
    байты валидны и truncate'нуты wrangler'ом до 383 байт
    (его `MAX_COMMIT_MESSAGE_BYTES = 384`). Воспроизводимо для
    UTF-8 с Cyrillic / `→` / `—`. Workaround зашит в `package.json`:
    `pnpm deploy` передаёт `--commit-message "$(git log -1 --pretty=%s)"` —
    только subject-line (по git-convention ≤70 chars). Body коммита
    в CF Dashboard не уезжает, но full message остаётся в git.
    Если деплоишь руками — **всегда** передавай `--commit-message`
    с коротким ASCII/UTF-8 текстом. См. также discoverable баг
    в wrangler — `MAX_COMMIT_MESSAGE_BYTES` не совпадает с
    реальным server-лимитом.
