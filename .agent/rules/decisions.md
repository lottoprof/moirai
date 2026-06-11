# Decisions (manifest)

Индекс архитектурных решений проекта **moirai**.
Полные записи (Контекст / Решение / Альтернативы / Причина) живут
в `decisions_archive.md` и читаются по требованию.

**Правило ведения:** новое решение — 1 строка сюда + полное тело
в archive. Перед работой в затронутой зоне — `grep` по дате/заголовку
в archive, потом действие.

## 2026-05

- **2026-05-19** (clarifications) — Модули и workflow методистов:
  модуль остаётся атомарным (БЕЗ `programme_slug`/`order_in_programme`),
  programme — wrapper над 1+ модулями (single-module sales — валидный
  кейс), методистская колонка «Программа» в .ods — suggestion-only.
  3 новые мета-колонки в modules: `summary`, `objectives_json`,
  `concepts_json` (sync копирует из yaml frontmatter в D1 для list-views).
  `requires_modules` default `[]`. External git repo `moirai-content`:
  `modules/{slug}/{metadata.yaml,student_book.{locale}.pdf|md,images/,private/}`
  + GH Actions sync на `/api/admin/modules/sync`. Workflow: Path A
  (git-нативный, первый) → Path B (admin Web-UI, опц. позже). Личные
  заметки методиста — не storage платформы (gitignored или локально).
  См. archive 2026-05-19.
- **2026-05-17** (clarification) — Staff ⊥ Student: trigger
  `staff_role_excludes_student` (migration 0006) автоматически
  удаляет student-роль при INSERT admin/instructor. Admin/instructor
  не могут одновременно быть student (staff = работают в платформе,
  student = клиенты). Multi-role admin+instructor остаётся валидным
  (admin-преподаватель). См. archive 2026-05-17 §staff⊥student.
- **2026-05-17** — Переосмысление модели: **модули — first-class
  сущность** (источник в отдельном git-репо методистов, sync в
  D1+R2), **programmes — Content Collection шаблоны** с
  `default_modules` и снапшотом цены/features, **enrollments —
  mutable instance** с собственным `enrollment_modules` (instructor
  может add/remove постфактум, auto-resolve `requires_modules`).
  **Tiers/Bundles как отдельные сущности отменяются** — варианты =
  разные programmes. **`/[locale]/instructor/` — новая зона**
  (отделена от `/dashboard/`). **`users.role` удалён** в пользу
  M2M `user_roles` (admin может одновременно преподавать).
  **`users.deactivated_at`** — soft-deactivation с redirect на
  `/[locale]/inactive`. **Anonymize** для GDPR (irreversible).
  Auth: `requireRole` + `computeRedirectTarget` + JWT без role.
  Lead instructor per enrollment (single, NULL = unassigned).
  Programme pages — SSR (`prerender=false`) с CF edge cache. См.
  archive 2026-05-17.
- **2026-05-16** — Dashboard routing: классический Astro MPA с
  отдельным SSR-роутом на каждую страницу (`/dashboard/modules/[id].astro`
  и т.п.), а не SPA-shell с client-side router'ом. Smooth navigation
  через нативный `<ClientRouter />` (Astro View Transitions API).
  Islands per-route (Vidstack на странице модуля, HomeworkUploader
  на форме). Shareable URLs, native browser back/forward, нет client
  state management, нет JS bundle для роутера. SPA-фреймворки
  (React-router/TanStack/etc.) запрещены в `[locale]/dashboard/**`.
  См. archive 2026-05-16.
- **2026-05-16** — Images model: zod-схема секций требует
  `{ image: image(), alt: z.string().min(1) }` для каждой картинки;
  empty alt = build error. Декоративные картинки — через явный helper
  `decorative()` (explicit opt-in). Public layer использует Astro
  `<Image>` (Sharp build-time → AVIF/WebP/JPEG + responsive srcset),
  картинки в `src/assets/images/**`. R2 — только для приватных asset'ов
  в dashboard (видео + платный контент). См. archive 2026-05-16.
- **2026-05-16** — Content-driven pages: layout публичных страниц
  управляется массивом `sections[]` в frontmatter
  `src/content/pages/<slug>.{en,ru}.mdx` (discriminated union по
  `kind`). `.astro`-файлы — тонкие композиторы (загрузка коллекции →
  map по sections → switch по kind, ~50 строк). Контент-команда меняет
  порядок секций, тексты, изображения, добавляет/убирает блоки **без
  правки кода**. SEO в frontmatter (`seo.title/description/og_image`).
  Translation-pair validator (Stage 7) обеспечивает структурную
  синхронность en↔ru. См. archive 2026-05-16.
- **2026-05-08** — Стек проекта: Astro 5 (TS) + `@astrojs/cloudflare`
  adapter + Cloudflare Pages; публичный SEO-слой = vanilla JS +
  CSS-only анимации; защищённая зона (ЛК) = Astro islands +
  Vidstack; деплой и dev — через wrangler.
- **2026-05-08** — Agent roster v0.8.1: ростер `.agent/agents/`
  выровнен с Architecture v0.8.1. `astro-app` → `astro-dashboard`
  (`[locale]/dashboard/**`), добавлены `astro-admin` (`/admin/**`,
  без локали, role=admin) и `content` (`src/content/**` +
  `drafts/**`). D1-миграции переехали в `migrations/` (top-level)
  + `db/types.ts` (ручные TS-типы, без ORM).
- **2026-05-08** — Sprint 0 bootstrap: `output: "server"` (опт-ин
  prerender per-route для статики), locales `[en, ru]`,
  `prefixDefaultLocale: true`, `compatibility_date 2026-05-01`,
  Node 22 LTS, pnpm 10.18 через corepack, `wrangler types` →
  `worker-configuration.d.ts` (runtime types заменили
  `@cloudflare/workers-types`).
- **2026-05-14** — Auth flow conventions (Stage 19a-f): Astro 5 CSRF guard
  оставлен default-on (POST требует Origin); forms ↔ endpoints через
  JSON-body + fetch + `credentials:same-origin`; access JWT в
  `sessionStorage`, refresh в `__Host-` cookie; login fail → generic
  `invalid_login` (info-hiding); SSR для pages с env/auth-guard,
  prerender только для static. См. archive 2026-05-14.
- **2026-05-14** — JWT keys: переход на 301-стиль 3-уровневой
  rotation схемы. `MASTER_SECRET` (env) шифрует signing keys в
  таблице `jwt_keys` (kid + status active/deprecated/revoked).
  Auto-init первого ключа с KV-lock от race. JWT header содержит
  `kid`, verifier выбирает ключ по нему. Преимущества: rotation
  без инвалидации всех JWTs, per-key revoke, защита от
  компрометации БД без master. Новая таблица `jwt_keys`
  (Architecture §9: 19 → 20). Новый KV namespace `KV_CACHE`
  для active-key cache + creation lock. Порт из `~/git/301/`.
- **2026-05-12** — Auth model: multi-method (password + OAuth) с
  отдельной таблицей `auth_methods`. Переработка `users` (убраны
  `password_hash` + `oauth_provider/oauth_id` колонки). Добавлены
  `audit_log`. OAuth: Google + Discord на старте, Discord БЕЗ email
  отклоняется. JWT 15min access + D1 refresh-session. PBKDF2-SHA256
  600k iter (OWASP 2023). Login fail → generic `invalid_login` +
  UI-подсказка "Forgot? Or use social". Native Astro endpoints (без
  Hono). Architecture §9: 17 → 19 таблиц.
- **2026-05-12** — Body font: Outfit → **Manrope Variable**. Outfit
  не содержит Cyrillic glyph'ов (только Latin + Latin Ext + Vietnamese),
  для bilingual проекта блокер. Manrope VF — близкий geometric sans,
  полная Cyrillic+Cyrillic-Ext поддержка, OFL, активная поддержка.
  Обновлены `tokens.css`, `Design_system.md` §3, Stage 5 план.
- **2026-05-11** — Production domain & deploy-first: canonical =
  `https://moiraionline.pro` (apex, без www); www — alias того же
  Pages-проекта. CF аккаунт `nastya.zasypkina@gmail.com` (ID
  `f168a4…`), Pages project `moirai` (URL `moirai-c6e.pages.dev`
  — глобальное имя `moirai` было занято, CF добавил суффикс).
  Зона `moiraionline.pro` (ID `8d1fe5f5…`): SSL=strict,
  always_use_https=on, min_tls=1.2, cname_flattening on, HSTS off.
  Apex и www подключены через Pages API + ручные CNAME-записи на
  `moirai-c6e.pages.dev`. Полный snapshot в
  `.agent/skills/deploy/SKILL.md` § Production state.

- **2026-06-08** — Instructor management (admin-side): three-level model.
  (1) instructor_qualifications M2M per module; (2) cohorts.lead_instructor_id
  явное поле + backfill из slots; (3) sessions.substitute_instructor_id для
  per-session sickness override. Admin assigns lead с фильтром qualified +
  time-available. Cohort без lead — soft warn на checkout (без блока),
  red badge на /admin/cohorts. Account delete блокируется (409) если user —
  lead в open/running. Handover flow на /admin/users/[id]/handover —
  forward-only. Migration 0018. Spec: docs/Architecture.md §
  Instructor management.

- **2026-06-11** — Cohort conflict Q1 (instructor lead в двух cohorts):
  Sprint 1 = soft warn (текущее `findQualifiedInstructors` поведение,
  звёздочка в dropdown без блока submit). Hybrid block (warn 1-2,
  block >50% future sessions) — Sprint 2 когда появится evidence что
  конфликты случайно прокрадываются. Spec:
  .agent/plans/active/cohort-conflict-policy-discussion.md § Q1.

- **2026-06-11** — Cohort conflict Q2 (substitute time conflict):
  повторяет Q1 → A → C. Sprint 1 = soft warn (передать conflictWindow
  в substitute dropdown /admin/cohorts/[id], сейчас не передаётся —
  TODO при implementation). Hybrid block на Sprint 2.

- **2026-06-11** — Cohort conflict Q3 (slot vs slot overlap для одного
  instructor): A — hard block. Constraint per-(instructor_id × day ×
  time_et). Разные instructors с одинаковыми time/days разрешены
  (параллельные группы — основной use case при добавлении нового
  preподa). Implementation: API-level validation через
  findInstructorSlotConflicts helper (schema-light путь).

- **2026-06-11** — Cohort conflict Q4 (student-side overlap для bundle):
  B — допускаем overlap. На checkout warning ("Sessions ... одновременно
  в двух cohorts. Recording доступен"), student подтверждает. Recording
  покрывает edge case. Implementation отложен до первой реальной bundle
  sale (текущий bundle apply flow не запущен).

- **2026-06-11** — Cohort conflict Q5 (reschedule session конфликт):
  A → C — единый pattern с Q1/Q2. Sprint 1 soft warn в reschedule UI,
  hybrid block на Sprint 2 (вероятно block для lead-конфликта, warn для
  student-конфликта — recording спасает per Q4). Reschedule UI пока не
  существует — при implementation сразу с soft warn.

- **2026-06-11** — Cohort conflict Q6 (rest time between sessions): B —
  hard rule ≥30 min gap между live-sessions одного instructor'а (lead
  или substitute). UI блок в cohort assignment / substitute / reschedule.
  Constant MIN_INSTRUCTOR_REST_MIN=30 в lib/config/lk.ts. Implementation:
  расширить findQualifiedInstructors.conflictWindow до [from-30, to+30].

- **2026-06-11** — Cohort conflict Q7 (handover каскад на substitute):
  C — hybrid. Past sessions с substitute_instructor_id=X сохраняем (audit
  trail), future sessions очищаем при handover X. Implementation в
  /api/admin/users/[id]/handover: UPDATE sessions SET
  substitute_instructor_id=NULL WHERE substitute_instructor_id=? AND
  scheduled_at > unixepoch().

- **2026-06-11** — Cohort conflict Q8 (display параллельных cohorts
  клиенту): D — клиент не видит instructor names. Apply UI показывает
  "Group A / B / C". Backend при confirm выбирает по admin priority
  (новое поле cohorts.public_priority INT NULL) с round-robin fallback.
  Работает для сценария "instructor уволился до старта" — admin меняет
  lead, клиент не замечает. Migration: добавить cohorts.public_priority
  + опц. cohorts.public_label.

- **2026-06-11** — Cohort conflict Q9 (admin calendar UI): A —
  FullCalendar v6+ vanilla JS adapter. Bundle ~80kb gzip, admin-only
  page. Цветовая кодировка через --prog-* CSS vars. Initial view: week,
  toggle month/quarter. Drag event → reschedule API (новый endpoint
  /api/admin/sessions/[id]/reschedule с soft warn по Q5). Click →
  /admin/cohorts/[id] drawer. CF free tier check WebFetch перед
  installation.
