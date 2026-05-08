---
name: wrangler
description: Use this skill for all Cloudflare wrangler operations — local dev (wrangler pages dev), deploy (wrangler pages deploy), secrets (wrangler pages secret put), D1 schema (wrangler d1 execute), KV/R2 inspection, and binding type generation (wrangler types). Read before running any wrangler command or editing wrangler.toml.
---

# Wrangler — Cloudflare CLI Skill

## Версия и установка

`wrangler` ставится как dev-зависимость (`npm i -D wrangler`).
Запуск через `npx wrangler` или npm-скрипты. Не использовать
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
# migrations_dir = "schema/migrations"

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

```bash
# Astro dev с эмуляцией биндингов
npm run dev
# Под капотом: astro dev — adapter с platformProxy подаёт биндинги
# через locals.runtime.env. Для секретов — .dev.vars в корне.
```

`.dev.vars` — формат как `.env`:

```
MASTER_SECRET=local-dev-only-value
SOME_API_KEY=...
```

Файл в `.gitignore`. Никаких production-секретов. См.
`rules/security.md`.

Альтернативно — запуск на собранной статике:

```bash
npm run build
npx wrangler pages dev ./dist
```

## Деплой

```bash
# Deploy на Pages (production)
npx wrangler pages deploy ./dist --project-name moirai

# Preview-деплой (на ветку)
npx wrangler pages deploy ./dist --project-name moirai --branch preview/<name>
```

Альтернативный путь — git-driven deploy через подключение Pages-проекта
к репозиторию. В этом случае wrangler-команды нужны только для
секретов / D1 / типов.

**Не запускать `pages deploy` без явного запроса пользователя.**

## Секреты

```bash
# Production-секрет
npx wrangler pages secret put MASTER_SECRET --project-name moirai

# Список
npx wrangler pages secret list --project-name moirai

# Удаление
npx wrangler pages secret delete MASTER_SECRET --project-name moirai
```

Локально — в `.dev.vars`. См. `rules/security.md`.

## D1 — миграции

```bash
# Создать БД (один раз)
npx wrangler d1 create moirai-prod

# Применить миграцию (вручную, по одному файлу)
npx wrangler d1 execute moirai-prod --remote \
  --file=schema/migrations/0001_init.sql

# Локальная база (эмуляция)
npx wrangler d1 execute moirai-prod --local \
  --file=schema/migrations/0001_init.sql

# Произвольный SQL (interactive)
npx wrangler d1 execute moirai-prod --remote \
  --command="SELECT * FROM users LIMIT 10"
```

**Не запускать `--remote` мутации без явного подтверждения
пользователя.** См. `agents/schema.md`.

## KV / R2

```bash
# KV
npx wrangler kv:namespace create KV_SESSIONS
npx wrangler kv:key list --binding=KV_SESSIONS

# R2
npx wrangler r2 bucket create moirai-media
npx wrangler r2 object list moirai-media
```

## Типы биндингов

После любой правки `wrangler.toml`:

```bash
npx wrangler types
```

Создаёт / обновляет `worker-configuration.d.ts` с типом `Env`.
Закоммитить вместе с `wrangler.toml`.

## Логи

```bash
# Tail логов production-деплоя
npx wrangler pages deployment tail --project-name moirai
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
