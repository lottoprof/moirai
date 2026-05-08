---
name: wrangler
description: Use this skill for all Cloudflare wrangler operations — local dev (wrangler pages dev), deploy (wrangler pages deploy), secrets (wrangler pages secret put), D1 schema (wrangler d1 execute), KV/R2 inspection, and binding type generation (wrangler types). Read before running any wrangler command or editing wrangler.toml.
---

# Wrangler — Cloudflare CLI Skill

## Версия и установка

`wrangler` ставится как dev-зависимость (`pnpm add -D wrangler`).
Запуск через `pnpm exec wrangler` или pnpm-скрипты. Не использовать
глобально установленный wrangler — версия должна быть зафиксирована
в `package.json`.

## wrangler.toml (минимальный шаблон для Astro Pages)

```toml
name = "moirai"
compatibility_date = "2025-12-01"
compatibility_flags = ["nodejs_compat"]   # только если действительно нужен polyfill
pages_build_output_dir = "./dist"

# Биндинги — добавляются по мере необходимости

# [[d1_databases]]
# binding = "DB"
# database_name = "moirai-prod"
# database_id = "<uuid>"
# migrations_dir = "migrations"

# [[kv_namespaces]]
# binding = "KV_SESSIONS"
# id = "<id>"
# preview_id = "<preview-id>"

# [[r2_buckets]]
# binding = "MEDIA"
# bucket_name = "moirai-media"

# [vars]
# ENVIRONMENT = "production"
```

Имена биндингов — `SCREAMING_SNAKE_CASE`. Не коммитить production
`database_id` / `id` под публичным именем — это ОК, секретами они не
являются (но проект-специфично).

## Локальная разработка

Два режима (см. Architecture §12):

```bash
pnpm dev                       # astro dev (Vite, HMR, без CF bindings)
pnpm wrangler pages dev        # miniflare с D1/R2/KV/env (полная эмуляция)
```

`platformProxy` в `astro.config.mjs` подаёт биндинги в
`Astro.locals.runtime.env` на `pnpm dev` для базовых сценариев.
Для полноценной отладки D1/R2/KV нужен второй режим.

`.dev.vars` — формат как `.env`:

```
MASTER_SECRET=local-dev-only-value
SOME_API_KEY=...
```

Файл в `.gitignore`. Никаких production-секретов. См.
`rules/security.md`.

Альтернативно — запуск на собранной статике:

```bash
pnpm build
pnpm exec wrangler pages dev ./dist
```

## Деплой

```bash
# Deploy на Pages (production)
pnpm exec wrangler pages deploy ./dist --project-name moirai

# Preview-деплой (на ветку)
pnpm exec wrangler pages deploy ./dist --project-name moirai --branch preview/<name>
```

Альтернативный путь — git-driven deploy через подключение Pages-проекта
к репозиторию. В этом случае wrangler-команды нужны только для
секретов / D1 / типов.

**Не запускать `pages deploy` без явного запроса пользователя.**

## Секреты

```bash
# Production-секрет
pnpm exec wrangler pages secret put MASTER_SECRET --project-name moirai

# Список
pnpm exec wrangler pages secret list --project-name moirai

# Удаление
pnpm exec wrangler pages secret delete MASTER_SECRET --project-name moirai
```

Локально — в `.dev.vars`. См. `rules/security.md`.

## D1 — миграции

Архитектура (v0.8.1 §12) фиксирует канонический формальный flow
через `wrangler d1 migrations`. Файлы лежат в `migrations/` (top-level),
TS-типы — в `db/types.ts` (см. `agents/schema.md`).

```bash
# Создать БД (один раз)
pnpm exec wrangler d1 create moirai-prod

# Создать новую миграцию (генерит migrations/NNNN_<name>.sql)
pnpm exec wrangler d1 migrations create moirai-prod <name>

# Применить все pending локально (miniflare)
pnpm exec wrangler d1 migrations apply moirai-prod --local

# Применить все pending на production (требует явного подтверждения)
pnpm exec wrangler d1 migrations apply moirai-prod --remote

# Список применённых
pnpm exec wrangler d1 migrations list moirai-prod --remote

# Произвольный SQL для отладки (read-only — безопасно)
pnpm exec wrangler d1 execute moirai-prod --remote \
  --command="SELECT * FROM users LIMIT 10"
```

**Не запускать `--remote` мутации (`migrations apply --remote`,
`execute --remote --file=...`) без явного подтверждения
пользователя.** См. `agents/schema.md`.

## KV / R2

```bash
# KV
pnpm exec wrangler kv:namespace create KV_SESSIONS
pnpm exec wrangler kv:key list --binding=KV_SESSIONS

# R2
pnpm exec wrangler r2 bucket create moirai-media
pnpm exec wrangler r2 object list moirai-media
```

## Типы биндингов

После любой правки `wrangler.toml`:

```bash
pnpm exec wrangler types
```

Создаёт / обновляет `worker-configuration.d.ts` с типом `Env`.
Закоммитить вместе с `wrangler.toml`.

## Логи

```bash
# Tail логов production-деплоя
pnpm exec wrangler pages deployment tail --project-name moirai
```

## Pitfalls

1. **`compatibility_flags = ["nodejs_compat"]`** — включать только
   если действительно нужен Node-polyfill. Без флага runtime ближе к
   чистым Web APIs (предпочтительно).
2. **`pages_build_output_dir` обязателен** для Pages-проекта,
   собираемого Astro.
3. **`wrangler types` без `wrangler.toml`** — упадёт. Конфиг должен
   быть в корне (или указан флагом `--config`).
4. **`.dev.vars` не подхватывается в production** — это локальный
   файл. На production-биндинги — только `wrangler pages secret put`.
5. **Версия `wrangler` имеет значение** — флаги меняются между
   мажорными релизами. При апгрейде wrangler — отдельная задача с
   проверкой команд.
