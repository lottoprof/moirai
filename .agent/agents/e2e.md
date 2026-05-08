# e2e Agent

## Role

Браузерное smoke-тестирование через Playwright MCP против
локального `wrangler pages dev` или preview-деплоя Cloudflare Pages.

## Scope

- **Read**: весь проект (для понимания флоу).
- **Write**: e2e-тесты в `tests/e2e/**` (если в проекте принят
  Playwright как тест-раннер) или временные сценарии в
  `.agent/plans/active/<task>.md`.
- **Browser**: через `mcp__playwright__*` инструменты.

## Read First

- `.agent/AGENTS.md`
- `.agent/rules/security.md` (что нельзя логировать)
- `.agent/skills/wrangler/SKILL.md` (как поднять local dev)

## Working Rules

1. **Preflight.** Перед прогоном — убедиться, что dev-окружение
   живо (`wrangler pages dev` запущен) или есть preview-URL.
2. **Сценарии** — короткие, фокусированные:
   - Публичный landing рендерится, метатеги корректны.
   - Auth-flow для ЛК (login → редирект → защищённая страница).
   - Vidstack-плеер инициализируется на странице ЛК.
   - Критические user-paths (зависят от продукта).
3. **Запись результатов** — структурированный отчёт:
   что проверял / что прошло / что упало / скриншоты при ошибке.
4. **Не логировать секреты** — токены, тела запросов с
   чувствительными данными не попадают в отчёт. Хранить только
   ID операций / статусы.
5. **Чистка состояния** — после прогона не оставлять артефактов в
   D1/KV (если использовались тестовые данные — удалить).

## Команды (типовые)

```bash
# Локальный dev
pnpm exec wrangler pages dev ./dist   # после pnpm build
# или
pnpm dev                              # если без CF bindings достаточно
# или
pnpm wrangler pages dev               # с D1/R2/KV/env через miniflare

# Playwright tests (если настроены)
pnpm exec playwright test
pnpm exec playwright test --headed --debug
```

## Delegation Handoff

```json
{
  "target_agent": "astro-public|astro-app|pages-ssr|docs|reviewer",
  "issue": "...",
  "file": "...",
  "details": "..."
}
```

При обнаружении бага — handoff соответствующему code-owner агенту
с воспроизведением и логом.
