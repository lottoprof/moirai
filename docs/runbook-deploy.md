# Runbook — деплой moirai на Cloudflare Pages

Пользовательский one-pager. Полные технические детали и pitfalls
— `.agent/skills/deploy/SKILL.md`.

## Production state (snapshot)

| Что | Значение |
|---|---|
| CF account | `nastya.zasypkina@gmail.com` (ID `f168a42429d35c55d7f43a6e40350e18`) |
| Pages project | `moirai` → `https://moirai-c6e.pages.dev` |
| Production branch | `main` |
| Custom domain (canonical) | `https://moiraionline.pro` (apex) |
| Custom domain (alias) | `https://www.moiraionline.pro` |
| Zone ID | `8d1fe5f529fd8a010c6086b6623b44b3` |
| TLS | Google CA, auto-renew |
| Bindings (D1/KV/R2) | нет, всё закомментировано в `wrangler.toml` |

Dashboard:
- Account: `dash.cloudflare.com/f168a42429d35c55d7f43a6e40350e18/home/overview`
- Pages: `dash.cloudflare.com/f168a42429d35c55d7f43a6e40350e18/workers-and-pages/view/moirai`
- Zone: `dash.cloudflare.com/f168a42429d35c55d7f43a6e40350e18/moiraionline.pro`

## Однократная подготовка

1. Аккаунт `nastya.zasypkina@gmail.com` на dashboard.cloudflare.com.
2. Авторизация wrangler в терминале:

   ```bash
   ! corepack pnpm exec wrangler login
   ```

   Откроется браузер → подтвердить доступ под нужным email. Токен
   ляжет в `~/.config/.wrangler/`.

3. Проверить:

   ```bash
   ! corepack pnpm exec wrangler whoami
   ```

   Должен показать `nastya.zasypkina@gmail.com`. Если другой
   аккаунт — `wrangler logout` и заново.

## Preflight (перед каждым production-деплоем)

```bash
pnpm lint
pnpm typecheck
pnpm build
```

Все три должны быть зелёными. Затем — локальный smoke:

```bash
pnpm exec wrangler pages dev ./dist
# открыть http://localhost:8788
```

Чек-лист smoke (1 минута):
- [ ] `/` → 302 на `/en/` или `/ru/` (зависит от `Accept-Language`)
- [ ] `/en/` рендерится, в `<head>` корректный `hreflang`/`canonical`
      на `https://moiraionline.pro/...`
- [ ] `/ru/` рендерится
- [ ] `/sitemap-index.xml` отдаётся
- [ ] В консоли wrangler нет красных ошибок

Если что-то упало — фиксим в коде, не деплоим.

## Production-деплой

```bash
pnpm deploy
```

Что произойдёт:
- `pnpm build` пересоберёт `dist/`.
- `wrangler pages deploy` зальёт его на CF Pages в проект `moirai`
  на ветку `main` (production).
- В выводе: уникальный preview URL `https://<hash>.moirai-c6e.pages.dev`
  + production алиас `https://moirai-c6e.pages.dev` обновится.
- Custom domain `https://moiraionline.pro` начнёт отдавать новый
  контент через ~10-30 сек (CF edge propagation).

## Preview-деплой (без затрагивания prod)

```bash
pnpm deploy:preview
```

Wrangler возьмёт текущую git-ветку и зальёт как preview-deployment.
URL вида `https://<branch>.moirai-c6e.pages.dev`. Production и
custom domain не обновятся.

## Production validation (после `pnpm deploy`)

```bash
# Root redirect + noindex
curl -sI https://moiraionline.pro/ | head -10

# Локали отдают HTML
curl -s https://moiraionline.pro/en/ | head -20
curl -s https://moiraionline.pro/ru/ | head -20

# SEO meta
curl -s https://moiraionline.pro/en/ | \
  grep -E '<title>|hreflang|canonical|og:'

# Sitemap
curl -s https://moiraionline.pro/sitemap-index.xml
```

Ожидания:
- Корень — `HTTP/2 302`, `Location: /en/` или `/ru/`, заголовок
  `x-robots-tag: noindex`.
- `/en/`, `/ru/` — `HTTP/2 200`, валидный HTML, метатеги на месте,
  canonical = `https://moiraionline.pro/<locale>/`.
- Sitemap — XML со ссылками на `sitemap-0.xml`.

## Если что-то сломалось на проде

Три пути отката, от быстрого к долгому:

1. **CF Dashboard** (10 секунд):
   Pages → moirai → Deployments → последний стабильный → "Rollback
   to this deployment". Production-алиас и custom domain переключатся
   мгновенно.

2. **Re-deploy старого коммита**:

   ```bash
   git checkout <good-sha>
   pnpm deploy
   git checkout main
   ```

3. **Полное отключение** (аварийный режим):
   Dashboard → Pages → moirai → Custom domains → отключить
   `moiraionline.pro`. DNS-записи останутся, но Pages перестанет
   отвечать. Restore — обратное действие.

## Что НЕ в этом runbook (отдельные процедуры)

- **www → apex 308 redirect** — сейчас оба домена отдают одинаковый
  контент, canonical в HTML ведёт Google к apex. Если понадобится
  жёсткий redirect — через CF Dashboard → moiraionline.pro → Rules
  → Redirect Rules.
- **HSTS / security headers** — Stage 8 (PSI audit).
- **Git-driven auto-deploy на push в `main`** — после нескольких
  ручных deploys, когда pipeline стабилен.
- **Биндинги D1/KV/R2/secrets** — добавляются вместе с фичами.
  Сейчас все закомментированы в `wrangler.toml`.
- **PSI / Lighthouse 100/100** — Stage 8 после полной стилизации
  и шрифтов.
- **Media subdomain `media.moiraionline.pro`** — упоминается в
  `SeoHead.astro` как MEDIA_BASE для OG, но пока пустой. Появится
  с R2 + image pipeline.

## Дополнительные команды

```bash
# Список деплоев
pnpm exec wrangler pages deployment list --project-name moirai

# Tail live-логов
pnpm exec wrangler pages deployment tail --project-name moirai

# Список проектов на аккаунте
pnpm exec wrangler pages project list

# Кто я (проверить аккаунт)
pnpm exec wrangler whoami
```

## Reference

- `.agent/skills/deploy/SKILL.md` — полная процедура, pitfalls.
- `.agent/skills/wrangler/SKILL.md` — wrangler 4 CLI.
- `.agent/plans/done/sprint0-deploy-first.md` — выполненный план
  первого деплоя.
- Cloudflare Pages docs: developers.cloudflare.com/pages/
