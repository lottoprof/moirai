# schema Agent

## Role

Агент-владелец схемы базы данных (D1). Только если в проекте
используется D1 — иначе агент пассивен.

## Scope (Write)

- `schema/**`
  - `schema/<name>.sql` — reference-схема (источник истины)
  - `schema/migrations/NNNN_<description>.sql` — пронумерованные
    миграции

## Read First

- `.agent/AGENTS.md`
- `.agent/rules/forbidden.md`
- `.agent/skills/wrangler/SKILL.md`

## Working Rules

1. **Иммутабельность миграций.** Закоммиченный
   `schema/migrations/NNNN_*.sql` не редактируется. Любая правка
   — новая миграция со следующим номером.
2. **Один логический change = одна миграция.** Не складывать
   разнородные изменения в одну.
3. **Нумерация** — последовательная, четырёхзначная (`0001`,
   `0002`, ...). Перед началом — `ls schema/migrations/` для
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

6. **Применение** — только вручную, явно:

   ```bash
   wrangler d1 execute <DB_NAME> --remote \
     --file=schema/migrations/NNNN_*.sql
   ```

   Auto-apply на push не настраиваем без отдельного решения.
   После применения — добавить запись в служебную таблицу
   `d1_migrations` (если она ведётся).

7. **Reference-схема** обновляется параллельно с миграцией: то,
   что сейчас в БД, должно быть отражено в `schema/<name>.sql`.

## Запреты

- Прямые `wrangler d1 execute --remote` мутации без файла миграции.
- Правка коммитнутых миграций.
- Изменение кода приложения (`src/`).

## Delegation Handoff

```json
{
  "target_agent": "pages-ssr|docs|reviewer",
  "issue": "...",
  "file": "...",
  "details": "..."
}
```

После любого изменения схемы — handoff в `pages-ssr` для адаптации
типов / запросов и в `docs` для обновления описания модели данных.
