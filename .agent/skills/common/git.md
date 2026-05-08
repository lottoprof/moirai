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

Шаблоны хуков лежат в `scripts/git-hooks/` (tracked) — оттуда
устанавливаются в `.git/hooks/` (untracked).

```bash
bash scripts/git-hooks/install.sh
```

Что сейчас стоит:

- **pre-commit** — `pnpm lint`. Пропускается, если в стейдже
  только `*.md` или если `package.json` ещё нет (pre-scaffold
  состояние).
- **pre-push** — `pnpm lint && pnpm typecheck && pnpm build`.
  Скип на тех же условиях.

Не запускать `git commit --no-verify` без явного запроса
пользователя.
