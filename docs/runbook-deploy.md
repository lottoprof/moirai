# Runbook — деплой moirai на Cloudflare Pages

Пользовательский one-pager. Полные технические детали и pitfalls
— `.agent/skills/deploy/SKILL.md`.

## Однократная подготовка

1. Аккаунт на dashboard.cloudflare.com.
2. Авторизация wrangler в терминале:

   ```bash
   ! corepack pnpm exec wrangler login
   ```

   Откроется браузер → подтвердить доступ. Токен ляжет в
   `~/.config/.wrangler/`. После этого `wrangler` авторизован для
   всех проектов на этом аккаунте.

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
- **Первый раз** wrangler спросит создать проект `moirai` — Enter.
- В выводе: уникальный preview URL `https://<hash>.moirai.pages.dev`
  + production алиас `https://moirai.pages.dev`.

## Preview-деплой (без затрагивания prod)

```bash
pnpm deploy:preview
```

Wrangler возьмёт текущую git-ветку и зальёт как preview-deployment.
URL вида `https://<branch>.moirai.pages.dev`. Production не
обновится.

## Production validation (после `pnpm deploy`)

```bash
# Root redirect + noindex
curl -sI https://moirai.pages.dev/ | head -10

# Локали отдают HTML
curl -s https://moirai.pages.dev/en/ | head -20
curl -s https://moirai.pages.dev/ru/ | head -20

# SEO meta
curl -s https://moirai.pages.dev/en/ | \
  grep -E '<title>|hreflang|canonical|og:'

# Sitemap
curl -s https://moirai.pages.dev/sitemap-index.xml
```

Ожидания:
- Корень — `HTTP/2 302`, `Location: /en/` или `/ru/`, заголовок
  `X-Robots-Tag: noindex`.
- `/en/`, `/ru/` — `HTTP/2 200`, валидный HTML, метатеги на месте.
- Sitemap — XML со ссылками на `sitemap-0.xml`.

## Если что-то сломалось на проде

Три пути отката, от быстрого к долгому:

1. **CF Dashboard** (10 секунд):
   Pages → moirai → Deployments → последний стабильный → "Rollback
   to this deployment". Production-алиас переключится мгновенно.

2. **Re-deploy старого коммита**:

   ```bash
   git checkout <good-sha>
   pnpm deploy
   git checkout main
   ```

3. **Полное отключение** (аварийный режим):
   Dashboard → Pages → moirai → Settings → отключить production
   route / custom domain.

## Что НЕ в этом runbook (отдельные процедуры)

- Кастомный домен `moirai.film` — отдельный план после первого
  `*.pages.dev` деплоя.
- Git-driven auto-deploy на push в `main` — после ручной валидации
  pipeline.
- GitHub Actions CI/CD — после git-driven базовой настройки.
- Биндинги (D1/KV/R2/secrets) — добавляются вместе с фичами,
  которые их требуют. Сейчас в `wrangler.toml` все биндинги
  закомментированы.
- PSI / Lighthouse 100/100 — Stage 8 после полной стилизации и
  шрифтов.

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
- `.agent/plans/active/sprint0-deploy-first.md` — план первого
  деплоя (этапы 4d-1 … 4d-6).
- Cloudflare Pages docs: developers.cloudflare.com/pages/
