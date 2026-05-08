# common: git

Базовые правила работы с git в репозитории moirai.

## Branching

- `main` — production-ветка. Деплой на Pages production
  привязан к ней (если настроен git-driven deploy).
- `feature/<name>` — отдельные задачи.
- Не пушить в `main` напрямую без явного запроса; работать через PR
  или через явный merge после ревью.

## Коммиты

- После каждого выполненного этапа из checklist — `git add`
  + `git commit` (см. `AGENTS.md` → GIT DISCIPLINE).
- Формат сообщения: `<scope>: <imperative summary>` + при необходимости
  тело с деталями.
- Стэйдж-фейс: `git add <конкретные файлы>`, не `git add -A` без
  необходимости (защита от случайного коммита `.dev.vars` /
  `.wrangler/`).

## .gitignore (минимум)

```
node_modules/
dist/
.astro/
.wrangler/
.dev.vars
*.log
.DS_Store
.env
.env.*
```

`worker-configuration.d.ts` — обычно **коммитится** (это контракт
типов биндингов). Если решено иначе — фиксировать в `decisions.md`.

## Запреты

- Не коммитить секреты (`.dev.vars`, `.env`).
- Не коммитить генерируемые артефакты (`dist/`, `.astro/`,
  `.wrangler/`).
- Не использовать `git push --force` на `main`.
- Не пропускать pre-commit / pre-push хуки (если настроены)
  без явного запроса.

## Хуки

Если в проекте появятся git-хуки — они живут в `.git/hooks/` и не
коммитятся. Шаблоны для шаринга — в отдельной директории (например,
`scripts/git-hooks/`) с инструкцией по установке.
