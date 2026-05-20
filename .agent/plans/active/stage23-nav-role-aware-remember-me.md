# Stage 23 — Role-aware Nav + Remember-me

## Цель

1. Починить ссылку в `Nav.astro`: вместо хардкода `/dashboard` — `roleHomeUrl()` (admin → `/admin/`, instructor → `/{locale}/instructor/`, student → `/{locale}/dashboard/`).
2. Снизить дефолтную persistence: дефолт **1 день**, чекбокс "Remember me" на login → **7 дней**. OAuth (Google/Discord) — всегда 7 дней (нет UI для чекбокса на redirect).

## Файлы

**Модифицировать:**
- `src/lib/server/session.ts` — два TTL: `REFRESH_TTL_DEFAULT = 1 day`, `REFRESH_TTL_REMEMBER = 7 days`. `createRefreshSession(env, userId, mode: "default" | "remember" | "oauth", ...)` (oauth = remember TTL). Max-Age всегда выставляется, разница только в длительности.
- `src/pages/api/auth/login.ts` — читать `remember_me` (boolean) из form / json, передавать в `createRefreshSession`.
- `src/pages/api/auth/refresh.ts` — при rotation сохранять persistence того же типа что и исходная сессия (через флаг в `auth_sessions`).
- `src/pages/api/auth/register.ts` — mode="default" (1 день, как обычный логин).
- `src/pages/api/auth/oauth/**` callbacks — mode="oauth" (7 дней).
- `src/pages/[locale]/login.astro` — чекбокс "Remember me for 7 days" / "Запомнить на 7 дней".
- `src/components/public/Nav.astro` — JS читает `roles` из `/api/auth/me`, выбирает URL по приоритету admin > instructor > student. Лейбл "Admin →" / "Instructor →" / "Dashboard →".

**Миграция:**
- `migrations/0008_session_persistent.sql` — `ALTER TABLE auth_sessions ADD COLUMN persistent INTEGER NOT NULL DEFAULT 0`. 0 = 1d default, 1 = 7d remember/oauth. Нужно чтобы refresh-rotation выбирал правильный TTL при перевыдаче cookie.

## Чеклист

- [ ] **23a** — migration 0008 + apply local + apply remote
- [ ] **23b** — `session.ts`: TTL 7d, `persistent` flag в `createRefreshSession`, conditional Max-Age
- [ ] **23c** — login.ts (form + JSON оба варианта), register.ts, oauth callbacks — передают persistent
- [ ] **23d** — refresh.ts — читает persistent из auth_sessions, ставит cookie тем же образом
- [ ] **23e** — login.astro UI: чекбокс + label + i18n
- [ ] **23f** — Nav.astro: role-aware URL/label
- [ ] **23g** — typecheck + build + deploy
- [ ] **23h** — Playwright smoke:
  1. `/en/` залогиненным admin → видна "Admin →", ведёт на `/admin/` (200)
  2. Logout → login без галочки → закрыть браузер → открыть → не залогинен
  3. Logout → login с галочкой → закрыть браузер → открыть → залогинен, ссылка корректная для роли
- [ ] **23i** — план → `done/`

## Не входит

- Idle timeout по last_seen_at — отдельно если станет нужно
- Логи "новый вход" / device-list UI — позже
