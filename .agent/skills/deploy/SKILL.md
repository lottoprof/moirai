---
name: deploy
description: Use this skill for any moirai deployment to Cloudflare Pages. Covers wrangler-driven deploys, git-driven deploys (Pages connected to repo), preview deploys per branch, secret rotation, and post-deploy verification. Always read skills/wrangler/SKILL.md first.
---

# Deploy — Cloudflare Pages

## Scope

В скоупе SKILL — деплой Astro 5 проекта moirai на Cloudflare Pages.

Поддерживаются два пути:

1. **Wrangler-driven** — явный `wrangler pages deploy` с локальной
   машины или из CI.
2. **Git-driven** — Pages-проект подключён к Git-репозиторию,
   деплой триггерится `git push`.

Конкретный путь для production фиксируется отдельным решением в
`decisions.md`.

## Out of scope

- Деплой Cloudflare Workers (отдельных воркеров вне Pages) — если
  понадобится, оформить отдельным skill'ом.
- DNS-настройки и привязка кастомного домена — операция
  пользователя в Cloudflare Dashboard.

## Prerequisites

1. Прочитан `.agent/skills/wrangler/SKILL.md`.
2. `wrangler` авторизован (`npx wrangler login`) — операция
   пользователя.
3. Pages-проект существует. Если нет — `npx wrangler pages project
   create moirai`.
4. Сборка прошла локально без ошибок:

   ```bash
   npm run lint
   npm run typecheck
   npm run build
   ```

## Wrangler-driven deploy

### Production

```bash
# Полный пайплайн
npm run build
npx wrangler pages deploy ./dist --project-name moirai
```

Маркеры успеха в выводе:
- `✨ Deployment complete!`
- URL вида `https://<hash>.moirai.pages.dev`
- Production URL `https://moirai.pages.dev` (или кастомный домен)
  обновляется, если деплой шёл в production-окружение.

**Не выполнять без явного запроса пользователя.**

### Preview / branch deploy

```bash
npx wrangler pages deploy ./dist \
  --project-name moirai \
  --branch preview/<feature-name>
```

URL: `https://<branch>.moirai.pages.dev`. Удобно для e2e-агента и
ручной проверки.

## Git-driven deploy

Если Pages-проект подключён к репозиторию:

1. `git push` на ветку, привязанную к production (`main`/`master`),
   — Pages запустит сборку.
2. Pull request / push в feature-ветку — Pages автоматически создаст
   preview-URL и опубликует его в комментарии PR (если включено).

В этом случае wrangler нужен только для:
- секретов (`wrangler pages secret put`),
- D1-миграций (`wrangler d1 execute`),
- генерации типов (`wrangler types`).

Build-команда и output-директория задаются в Pages dashboard
(`npm run build` и `dist/` соответственно для Astro).

## Post-deploy verification

```bash
# Health-check публичной страницы
curl -sI https://<deploy-url>/ | head -5
# → HTTP/2 200, content-type: text/html

# Health-check API-эндпоинта (если есть /api/health)
curl -s https://<deploy-url>/api/health
# → {"ok": true, ...}
```

Для production — открыть смок-сценарии:
- Публичная главная рендерится, в HTML видны корректные SEO-метатеги.
- Логин в ЛК работает.
- Ключевые API-эндпоинты возвращают ожидаемые статусы.

E2E-проверка через `agents/e2e.md` — против deploy-URL или preview.

## Логи

```bash
# Tail production
npx wrangler pages deployment tail --project-name moirai

# Список последних деплоев
npx wrangler pages deployment list --project-name moirai
```

## Откат

```bash
# Список деплоев → найти предыдущий стабильный
npx wrangler pages deployment list --project-name moirai

# Откатить production на конкретный deploy
npx wrangler pages deployment alias --project-name moirai \
  <deploy-id> production
```

(Точный синтаксис может отличаться по версии wrangler — проверять
`npx wrangler pages deployment --help` перед использованием.)

## Pitfalls

1. **`./dist` не существует** — `wrangler pages deploy` упадёт.
   Сначала `npm run build`.
2. **Секреты не доступны после деплоя** — забыли
   `wrangler pages secret put` для production. Проверить
   `wrangler pages secret list` перед первым smoke-тестом.
3. **`wrangler.toml` не подхватывается** — для Pages-проекта
   wrangler читает `wrangler.toml` из корня. Если нет файла —
   биндингов не будет.
4. **`compatibility_date` устарел** — ошибки при деплое.
   Обновить дату в `wrangler.toml` отдельным коммитом с проверкой
   совместимости.
5. **Деплой без `npm run typecheck`** — типичная ловушка. Build
   может пройти, а runtime сломается на edge. Quality gates
   обязательны (`rules/quality-gates.md`).
