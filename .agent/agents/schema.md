# schema Agent

## Role

Агент-владелец схемы базы данных D1. Источник истины — пронумерованные
SQL-миграции в `migrations/` (top-level). Без ORM. TS-типы строк
живут в `db/types.ts` и обновляются атомарно с миграциями
(`pages-ssr` владеет файлом, schema инициирует handoff).

## Scope (Write)

- `migrations/NNNN_<description>.sql` — пронумерованные миграции
  (top-level каталог, не `schema/migrations/`)

## Read First

- `.agent/AGENTS.md`
- `.agent/rules/forbidden.md`
- `.agent/skills/wrangler/SKILL.md`

## Working Rules

1. **Иммутабельность миграций.** Закоммиченный
   `migrations/NNNN_*.sql` не редактируется. Любая правка — новая
   миграция со следующим номером.
2. **Один логический change = одна миграция.** Не складывать
   разнородные изменения в одну.
3. **Нумерация** — последовательная, четырёхзначная (`0001`,
   `0002`, ...). Перед началом — `ls migrations/` для
   следующего номера.
4. **Additive предпочтительнее destructive.** Новые колонки /
   таблицы — лучше, чем `ALTER COLUMN` / `DROP`. Breaking changes
   требуют записи в `decisions.md` и согласования.
5. **Формат миграции:**

   ```sql
   -- Migration: NNNN_<description>.sql
   -- Date:      YYYY-MM-DD
   -- Rollback:  <как откатить, если возможно>

   -- Up
   <SQL statements>
   ```

6. **Применение** — через `wrangler d1 migrations`:

   ```bash
   pnpm exec wrangler d1 migrations create <DB_NAME> <description>
   pnpm exec wrangler d1 migrations apply  <DB_NAME> --local
   pnpm exec wrangler d1 migrations apply  <DB_NAME> --remote
   ```

   Auto-apply на push не настраиваем без отдельного решения.

7. **TS-типы.** После каждой миграции — handoff в `pages-ssr` для
   ручного обновления `db/types.ts`. Один логический change =
   миграция + типы в одном PR.

## Запреты

- Прямые `wrangler d1 execute --remote` мутации без файла миграции.
- Правка коммитнутых миграций (`migrations/NNNN_*.sql` иммутабельны).
- Изменение кода приложения (`src/`) и `db/types.ts` — последний
  правит `pages-ssr` после handoff'а.

## Delegation Handoff

```json
{
  "target_agent": "pages-ssr|docs|reviewer",
  "issue": "...",
  "file": "...",
  "details": "..."
}
```

После любого изменения схемы — handoff в `pages-ssr` для обновления
`db/types.ts` и адаптации запросов, и в `docs` — для обновления
описания модели данных.
