# Decisions Archive (moirai)

Полные записи архитектурных решений. Каждая запись — заголовок с датой
и краткой темой, далее блоки **Контекст / Решение / Альтернативы /
Причина**. Manifest и порядок ведения — в `decisions.md`.

---

## 2026-05-08: stack & layering — Astro 5 + Cloudflare Pages + Wrangler

**Контекст.** Стартуем фронтенд-проект moirai. Требования: SEO-важный
публичный слой с минимальной runtime-нагрузкой, защищённая зона
личного кабинета с медиаплеером, серверный рендеринг для
персонализированных страниц, развёртывание на инфраструктуре с
быстрым edge-доступом.

**Решение.**

- **Framework**: Astro 5 (Vite + TypeScript под капотом).
- **Hosting**: Cloudflare Pages.
- **Adapter**: `@astrojs/cloudflare` (SSR через CF Workers runtime).
- **Public layer**: vanilla JS (или ноль JS) + CSS-only анимации,
  никаких UI-фреймворков, никаких `client:*` директив. SEO-критично.
- **App layer (ЛК)**: Astro islands с `client:idle` / `client:visible`
  по умолчанию; Vidstack для медиаплеера в защищённой зоне.
- **Tooling**: wrangler — канонический инструмент для dev
  (`wrangler pages dev`), деплоя (`wrangler pages deploy`), секретов
  (`wrangler pages secret put`), миграций D1
  (`wrangler d1 execute`) и генерации типов биндингов
  (`wrangler types`).
- **Структура слоёв** в `src/` зафиксирована в
  `rules/architecture.md` и `rules/boundaries.md`.

**Альтернативы.**

- Next.js / Remix на Vercel — отказ: тяжелее в публичном слое, хуже
  совмещается с CF edge runtime без compromises.
- Чистые Cloudflare Workers без Astro — отказ: SSG/SSR из коробки и
  единый код для public+app проще через Astro.
- SvelteKit на CF — отказ: Astro лучше подходит под требование
  «минимум JS в публичном слое» (островная модель).
- Полностью статика без SSR — отказ: для ЛК нужен SSR с
  персонализированными данными.

**Причина.** Astro даёт zero-JS по умолчанию для публичного слоя
(SEO + perf), островную гидрацию для ЛК (можно подмешать Vidstack
без раздувания публичных страниц), и интегрируется с CF Pages SSR
через официальный адаптер. Wrangler — родной CLI экосистемы CF,
покрывает dev / deploy / secrets / D1 / KV / R2 без лишних обёрток.

---

## 2026-05-08: agent roster v0.8.1 alignment

**Контекст.** После stage1 (pnpm) и stage2 (rules align с
Architecture v0.8.1) `rules/boundaries.md` начал ссылаться на
`agents/astro-dashboard.md`, `astro-admin.md`, `content.md` —
файлов которых физически нет в `.agent/agents/`. Существующий
`astro-app.md` описывал старый namespace `src/pages/app/**`,
не совпадающий с v0.8.1 (`[locale]/dashboard/**` для ЛК,
`/admin/**` без локали для админки). `schema.md` описывал
миграции в `schema/migrations/`, тогда как v0.8.1 фиксирует
`migrations/` top-level + `db/types.ts` (ручные TS-типы, без ORM).

**Решение.**

- `astro-app.md` → `astro-dashboard.md` (`git mv` + переписать
  scope под `src/pages/[locale]/dashboard/**`,
  `src/components/dashboard/**`, роли student/instructor).
- Добавлен `astro-admin.md`: `src/pages/admin/**` без локали,
  `users.role = 'admin'` guard, CRUD поверх API, `noindex`.
- Добавлен `content.md`: `src/content/**` (programmes с тирами,
  bundles, instructors, segments, pages, journal, works,
  voice-guide) + `drafts/**` (agent journal pipeline).
  Изменения `src/content/config.ts` (zod-схемы коллекций) —
  через handoff в `pages-ssr`.
- `astro-public.md`: scope `src/pages/[locale]/*.astro` (без
  `dashboard/`, без `admin/`), запрет импорта из
  `components/dashboard/`, `components/admin/`, явное anti-hardcode.
- `pages-ssr.md`: добавлены `src/content/config.ts` и `db/types.ts`;
  `db/types.ts` обновляется атомарно с миграциями (handoff из
  `schema`).
- `schema.md`: миграции в `migrations/NNNN_*.sql` (top-level),
  применение через `wrangler d1 migrations create/apply`,
  reference-схема упразднена.
- `reviewer.md`: чек-лист boundaries расширен до
  public/dashboard/admin/content; auth-guard под
  `[locale]/dashboard/**` и `admin/**`.
- `e2e.md`: сценарии — locale-prefix, gated media, admin smoke.
- `AGENTS.md`: PROJECT AGENT MAP, PROJECT STACK и DELEGATION enum
  переписаны под новый ростер.
- Точечные правки `rules/security.md`, `skills/common/security.md`,
  `skills/vidstack/SKILL.md`, `skills/wrangler/SKILL.md` —
  убраны устаревшие ссылки на `src/pages/app/**` и
  `schema/migrations/`.

**Альтернативы.**

- Оставить `astro-app` и переименовать в `dashboard` только
  путь — отказ: ростер должен синхронно отражать реальные зоны,
  иначе делегирование выдаёт неконсистентные spec'и.
- Объединить `astro-admin` со scope'ом `pages-ssr` — отказ:
  админка имеет UI-слой (CRUD-формы, layouts), это work для
  UI-агента, а не серверного.
- Оставить миграции в `schema/migrations/` — отказ: расходится
  с Architecture v0.8.1 §12 (`migrations/` top-level + `db/types.ts`)
  и со standard wrangler layout'ом.

**Причина.** Без alignment'а `boundaries.md` ссылался на
несуществующих агентов, а `astro-app.md` описывал отсутствующий
в архитектуре namespace. Делегирование от лида ломалось бы
из-за рассинхрона spec ↔ реальные файлы. Новый ростер однозначно
маппится на UI-зоны Architecture v0.8.1 (public / dashboard /
admin / content / server / schema), что упрощает routing задач
и ревью boundaries.

---

## 2026-05-08: Sprint 0 bootstrap — output mode, locales, tooling

**Контекст.** Architecture.md §arch оставила открытыми технические
параметры до первого скаффолда: `output` mode (`server` vs `hybrid`),
стартовый список локалей, `compatibility_date`, версия pnpm.
Stage 2 Sprint 0 фиксирует эти решения через первые конфиги
(`astro.config.mjs`, `wrangler.toml`, `package.json`, `.nvmrc`).

**Решение.**

- **`output: "server"`.** Адаптер `@astrojs/cloudflare` требует
  `server` (`hybrid` deprecated в Astro 5). Публичные SEO-страницы
  по факту статика — будут добавлять `export const prerender = true`
  per-template (Stage 3+). SSR-default только для runs/dashboard/
  admin/api роутов.
- **Локали `["en", "ru"]`.** Architecture v0.5 заменила `es → ru`,
  EN базовый. `defaultLocale: "en"`, `prefixDefaultLocale: true`,
  `redirectToDefaultLocale: false` (root `/` редиректится middleware'ом
  по `Accept-Language`). Список — данные, расширение через
  `astro.config.mjs`.
- **`compatibility_date: "2026-05-01"`.** Ближайшая стабильная под
  текущий wrangler 4.90. `compatibility_flags: ["nodejs_compat"]`
  включён превентивно — отдельные пакеты (`resend`, опц.) могут
  дёргать Node-API; флаг безопасен на CF runtime.
- **Node 22 LTS** через `.nvmrc` + `engines.node >= 22`.
  Wrangler 4 требует Node 22+.
- **pnpm 10.18 через corepack** (`packageManager` поле). pnpm 11
  по дефолту блокирует postinstall-скрипты для esbuild/sharp/workerd
  с интерактивным `pnpm approve-builds`, что не работает в
  не-TTY-окружении (CI, agent). pnpm 10 имеет старое разрешительное
  поведение + `pnpm.onlyBuiltDependencies` allow-list в package.json.
  Апгрейд до 11 — отдельная задача, когда появится автомат для
  approve-builds.
- **Runtime types через `wrangler types`** (`worker-configuration.d.ts`)
  вместо `@cloudflare/workers-types`. Wrangler 4 deprecated пакет,
  runtime types точнее (отражают реальный compatibility_date и flags).
  Файл коммитится (gitignore-fix `3416cbc` снял игнор).
- **ESLint flat config** (`eslint.config.mjs`) с
  `typescript-eslint strictTypeChecked` + `eslint-plugin-astro`.
  Type-aware правила требуют отдельного `tsconfig.eslint.json`
  (commit `dd76be1` фиксировал требование, теперь файл создан).

**Альтернативы.**

- `output: "hybrid"` — отказ: Astro 5 признал deprecated, Core
  рекомендует `server` + per-route `prerender = true`.
- `output: "static"` без адаптера — отказ: SSR-роуты (runs/D1,
  dashboard, admin, api) фундаментальны для платформы. Статика
  не закроет.
- pnpm 11 — отложено до решения approve-builds в non-TTY.
- npm/yarn — отказ: pnpm стандарт стека (commit `d67e379`
  Architecture v0.8.1 stage1).
- `@cloudflare/workers-types` — отказ: deprecated в новых wrangler.

**Причина.** Минимально-достаточный bootstrap, который проходит
`pnpm install`, `pnpm lint`, `pnpm typecheck` без ошибок и не
блокирует pre-commit hook. Все решения откатываемы (можно
переехать на pnpm 11 / расширить локали / поменять
compatibility_date) без перестройки структуры.


---

## 2026-05-11: production domain & deploy-first first ship

**Контекст.** К моменту stage 4c стилизации публичного слоя (Hero + Ticker как компоненты, без интеграции в `index.astro`) поднялся вопрос: деплоить сейчас на CF Pages или ждать полной стилизации главной. Параллельно — определить production-домен.

**Решение.**

- **Канон**: `https://moiraionline.pro` (apex, без www). `www.moiraionline.pro` — alias того же Pages-проекта, отдаёт идентичный контент. Жёсткий 308 redirect www→apex отложен — canonical в HTML уже ведёт Google к apex.
- **CF аккаунт** для всех ресурсов moirai: `nastya.zasypkina@gmail.com`, account ID `f168a42429d35c55d7f43a6e40350e18`. **Не** основной email пользователя — это специально выделенный аккаунт.
- **Pages project**: `moirai` (имя глобально занято → URL `moirai-c6e.pages.dev`, project name в API остаётся `moirai`). Production branch — `main`.
- **Zone `moiraionline.pro`** (ID `8d1fe5f529fd8a010c6086b6623b44b3`): парковка Sedo (`91.195.240.123`) удалена, SSL поднят до `strict`, `always_use_https=on`, `min_tls_version=1.2`, `cname_flattening=flatten_at_root` (для apex Pages). HSTS оставлен off — включать позже в Stage 8 после полной валидации, иначе откатить сложно.
- **Custom domain attach**: через Pages API `POST /accounts/{id}/pages/projects/moirai/domains` + ручное создание CNAME-записей `apex → moirai-c6e.pages.dev` и `www → moirai-c6e.pages.dev` (proxied). Через API CF Pages **НЕ** авто-создаёт DNS-записи (в отличие от dashboard-пути), что приводит к зависанию domain status в `pending`.
- **Deploy-first как принцип**: задеплоить до полной стилизации, чтобы валидировать pipeline на реальном CF runtime и получить публичный URL для делёжки.

**Альтернативы.**

- **Ждать полной стилизации Stage 4 → деплой**. Отказ: дольше до первого реального теста edge-runtime + ICANN propagation; каждая правка стилей не имела бы видимой "до/после" разницы на проде.
- **Канон на www вместо apex**. Отказ: apex короче, SEO-предпочтительнее, для русско/англо-аудитории `moiraionline.pro` без www читается чище в outreach-копии.
- **Git-driven deploy через CF Pages auto-build на push**. Отложено: сначала валидируем ручной pipeline (`pnpm deploy`), потом подключаем git-driven.
- **Кастомное имя `moirai.pages.dev` без суффикса**. Невозможно: имя `moirai` глобально занято в namespace `*.pages.dev`. Суффикс `-c6e` — нормальная плата.

**Причина.** Чем раньше боевой URL — тем дешевле отладка edge-incompat, compat-флагов, размеров bundle. Stage 4 стилизация продолжается параллельно, каждый `pnpm deploy` теперь даёт видимую разницу на `moiraionline.pro`. Доменные настройки (SSL strict, force HTTPS, TLS 1.2) сделаны заранее, чтобы при включении HSTS в Stage 8 не пришлось чинить mixed-content / редиректы.


---

## 2026-05-12: body font Outfit → Manrope (Cyrillic-driven)

**Контекст.** Design system v0.1 (docs/Design_system.md §3) фиксировала
body font = Outfit. На Stage 5 при попытке self-host (скачать woff2,
положить в `public/fonts/`) обнаружилось: репо `Outfitio/Outfit-Fonts`
поддерживает только Latin + Latin Extended + Vietnamese. Google Fonts
CSS для Outfit возвращает 2 @font-face (latin + latin-ext), Cyrillic
subset не существует. Для bilingual проекта (en + ru) это блокер: на
`/ru/` весь UI-текст падал бы на system-ui (Arial / system fallback),
нарушая бренд-консистентность и метрики size-adjust fallback'ов.

**Решение.**

- Заменить Outfit на **Manrope Variable** в семантическом токене
  `--font-body`.
- Manrope — Mikhail Sharanda (https://manropefont.com/), OFL, активный
  maintenance, один Variable Font (weight range 200–800), полная
  Cyrillic + Cyrillic-Extended поддержка (subsets раздаются Fontsource
  по Google Fonts convention).
- Файлы (subset-split): `manrope-vf-{latin,latin-ext,cyrillic,cyrillic-ext}.woff2`
  в `public/fonts/`. На EN — браузер качает только latin + latin-ext
  (~40KB); на RU добавляется cyrillic (~14KB). Cyrillic-ext (2.5KB) —
  только если встретятся редкие glyph'и.
- Обновлены: `src/styles/tokens.css` (`--font-body`), `docs/Design_system.md`
  §3 (с заметкой о замене), `.agent/plans/active/sprint0-stage5-fonts.md`
  (переписан под фактический набор файлов).
- `--font-display` = Cormorant Garamond Light 300 + 300-italic —
  оставлен без изменений. Cormorant имеет Cyrillic из коробки
  (репо `CatharsisFonts/Cormorant`).

**Альтернативы.**

- Inter Variable — самый универсальный, де-факто стандарт modern web
  sans. Отказ: слишком нейтрально-IBM-ish для бренда.
- Onest Variable — родом из России (Rosen Type), оптимизирован под
  кириллицу. Отказ: слишком "русский" характер для bilingual бренда.
- Outfit для EN + другой font для RU через unicode-range swap.
  Отказ: overengineering, два источника, потенциально неконсистентный
  UX между локалями.
- Outfit + system-ui fallback на RU. Отказ: на `/ru/` сайт выглядит
  как Arial-кит, теряется бренд.
- Custom subset Outfit с дорисованной кириллицей. Отказ: OFL позволяет,
  но требует дизайнерской работы + shape consistency check.

**Причина.** Manrope максимально близок к изначально выбранной
геометрической эстетике Outfit (rounded modern sans, средняя
контрастность), при этом без блокера по subset. Один шрифтовой движок
— одно качество на обеих локалях. Cost: ~5 минут редактуры доки +
tokens.css. Возврат: фундаментальная корректность bilingual типографики.


---

## 2026-05-12: auth model — multi-method + Google/Discord OAuth

**Контекст.** Architecture v0.8.1 §9 фиксировала `users` таблицу с
`password_hash TEXT NOT NULL` и не описывала OAuth-провайдеров. Для
выхода в продакшн нужен полный auth: регистрация по паролю И через
OAuth (Google + Discord для старта, расширяемо). Изучили
работающий продакшн `~/git/301/` (OAuth + password + Telegram
WebApp на CF Workers через Hono + Turnstile + JWT/refresh) —
взяли архитектурные паттерны, скорректировали схему под
multi-method (один user может иметь и password И Google И Discord
linked одновременно).

**Решение.**

### Schema

- **`users`** — убраны `password_hash`, `oauth_provider`, `oauth_id`.
  Остаются только identity + profile поля (email, name, locale,
  role, referral_code). Email — единственный канонический identity
  ключ.
- **Новая таблица `auth_methods`** — многие на одного user. Колонки:
  `kind` (`password`/`google`/`discord`), `secret_hash` (для
  password — PBKDF2), `provider_user_id` (sub/snowflake для OAuth),
  `provider_email`, `provider_email_verified`, `created_at`,
  `last_used_at`. UNIQUE (`user_id, kind`) — один метод каждого типа.
  UNIQUE (`kind, provider_user_id`) — один OAuth ID не у двух users.
- **`auth_sessions`** (уже была в §9) — расширена `ip_hash` (sha256
  для GDPR), `user_agent`, `revoked_at` (soft-revoke).
- **Новая таблица `audit_log`** — все auth-события (`register`,
  `login`, `logout`, `oauth_link`, `password_set`, `email_verify`,
  `password_reset`). Включаем сразу для compliance + forensic.

Итого: 17 → 19 таблиц.

### Field type conventions (для всей схемы)

- **IDs** — TEXT, UUID v7 или nanoid. Не INTEGER AUTOINCREMENT
  (предсказуемость id хуже для security + сложнее распределённо).
- **Timestamps** — INTEGER unix-seconds. Не TEXT ISO 8601 (compactness,
  native numeric compare, простые индексы по времени).
- **Booleans** — INTEGER 0/1 (SQLite не имеет нативного bool).
- **Money** — INTEGER cents (избегаем floating point math).
- **Enums** — TEXT с явным CHECK constraint.
- **IP-адреса** — sha256(ip+salt) для GDPR. Plaintext IP не хранится.

### Hash + crypto

- **PBKDF2-SHA256, 600 000 iterations** (OWASP 2023 minimum). Формат
  хранения: `salt:hash` base64.
- Argon2id рассматривался — отказ: требует WASM в CF Workers, лишний
  cold-start overhead; PBKDF2 нативен через Web Crypto API.
- **Password policy:** min 10 символов, без обязательной complexity
  (NIST SP 800-63B 2017+ — length > rules), blacklist common
  passwords (топ-100 + проектные слова).

### OAuth

- **На старте:** Google + Discord. Архитектурно — n-providers,
  добавление = одна запись в config + два endpoint (start +
  callback).
- **Flow:** PKCE (state + verifier в KV с TTL=10min) + JWKS
  верификация id_token (для Google). Discord — fetch
  `/users/@me` после code exchange.
- **Discord без email отклоняется.** Если user не grant'нул `email`
  scope ИЛИ `email=null` ИЛИ `verified=false` — flow завершается
  с сообщением *"To complete sign-in, please grant email access in
  Discord or use a different sign-in method."*. Никаких orphan-учёток
  без email (payment receipts и recovery link невозможны).
- **Account linking:** auto-link при email-match **только если
  провайдер сообщает `email_verified=true`**. Иначе создаётся
  новый user и/или требуется отдельная верификация email.
- **Email verification:** OAuth-зарегистрированные автоматически
  `email_verified_at=now` (если провайдер верифицировал). Password-
  зарегистрированные — отдельный email-link flow (KV токен).
  Verification обязательна перед первой оплатой.

### Session

- **Hybrid: JWT access (15min) + refresh session в D1.**
  Access token — HS256 JWT с claims (user_id, role, iat, exp) +
  fingerprint (sha256(ip+ua) → claim `fp`). Validated на каждом
  request — отвергаем если fp не совпадает.
- **Refresh token** — opaque secret в HttpOnly Secure cookie, TTL
  30 дней, хэш в `auth_sessions`. Revoke = `revoked_at = now`,
  следующая попытка refresh → отказ → user re-login.

### Bot/spam protection

- **Cloudflare Turnstile** — first-line на register/login/reset
  формах. Site key + secret в env.
- **Rate-limit** через KV-counter — second-line. Лимиты:
  - `auth:register:ip:<ip>` — 5/час
  - `auth:register:email:<email>` — 3/час
  - `auth:login:ip:<ip>` — 20/час
  - `auth:login:email:<email>` — 10/час

### Error UX

- **`POST /api/auth/login` всегда возвращает generic** `invalid_login`
  (не различает: email не существует / нет password method / неверный
  пароль). Не утекает существование email.
- Под формой login отображается статичный hint: *"Forgot your
  password? Or sign in with Google / Discord."* Это покрывает оба
  кейса (no password method и забыл пароль) без раскрытия деталей.
- Password reset flow по сути выясняет существование email, но
  reset endpoint возвращает 200 одинаково независимо от того,
  существует email или нет — email уходит только если user найден.

### Stack

- **Native Astro 5 API endpoints** (`src/pages/api/**.ts`) — не Hono.
  Astro 5 + `@astrojs/cloudflare` дают type-safe routing, middleware
  через `src/middleware.ts`, прямой доступ к
  `Astro.locals.runtime.env`. Hono — для случаев когда endpoint'ов
  становится много + нужны сложные middleware-цепочки; на старте
  нет смысла добавлять второй framework layer.
- **D1 binding:** `DB` (`env.DB` через worker binding,
  `Astro.locals.runtime.env.DB` в Astro context).
- **KV bindings:** `KV_OAUTH_STATE` (PKCE state + verifiers, TTL
  10min), `KV_VERIFY_TOKENS` (email verification + password reset
  tokens, TTL 1h), `KV_RATELIMIT` (rate-limit counters, TTL = window).
- **Secrets:** `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `TURNSTILE_SECRET`,
  `IP_HASH_SALT`. Все через `wrangler pages secret put`. Никогда
  не в `.env` коммитнутом.

### Что НЕ берём из 301

- **Multi-tenant** (`accounts` + `account_members` + `invitations`) —
  moirai single-tenant. Роль на user, не на membership.
- **`users.oauth_provider`/`oauth_id` колонки** — заменены на
  `auth_methods` таблицу (множественные провайдеры на user).
- **PBKDF2 100k iter** — поднимаем до 600k (OWASP 2023).
- **Telegram WebApp auth** — не пока. Если когда-нибудь — добавим
  третьим OAuth-методом.
- **Hono** — оставляем native Astro.

**Альтернативы.**

- **Single OAuth-provider на user (как в 301)** — отказ: user должен
  иметь возможность linked Google + Discord одновременно.
  `auth_methods` table — стандарт (Auth0/Clerk/Supabase Auth тоже
  раздельно хранят identities).
- **Argon2id вместо PBKDF2** — отказ: WASM overhead в edge runtime
  + Web Crypto API нативно даёт PBKDF2. 600k iter PBKDF2-SHA256
  достаточно по 2026 OWASP.
- **Variant A (collision = strict error "Use Google to sign in")** —
  отказ: утекает email + провайдер. Variant C + generic error +
  UI-подсказка покрывает UX без leak.
- **`password_hash` nullable на `users`** (как 301) — отказ: ломает
  invariant что у user может быть N методов; в `users` colonm
  семантически принадлежит "первому" методу. Чище — отдельная
  таблица.
- **Stateless JWT only (без refresh в D1)** — отказ: невозможно
  revoke до истечения TTL. Hybrid стандарт для serious products.
- **Hono framework** — рассматривали (301 использует). Отказ для
  старта: native Astro 5 + `@astrojs/cloudflare` адекватны для
  ~20 auth endpoints. Если когда-нибудь дойдём до сложных middleware
  цепочек — мигрируем на Hono поверх Astro endpoints без поломки
  внешних URL.

**Причина.** 301-проект показал что combinaition (Turnstile + JWT 15min
+ refresh-D1 + PKCE OAuth) работает в продакшн на CF Pages. Берём
проверенный паттерн + докручиваем под наши требования (multi-method,
strict Discord email policy, более жёсткий PBKDF2, audit log
обязательно). Результат — современный production-grade auth без
сторонних SaaS (Auth0/Clerk дорогие, vendor lock-in).


---

## 2026-05-14: JWT keys → master + jwt_keys table (rotation-ready)

**Контекст.** Stage 19 plan изначально предполагал простой `JWT_SECRET`
(один HMAC-ключ в env). В discussion с пользователем уточнили подход
из `~/git/301/src/api/lib/jwt.ts`: там не один секрет, а трёхуровневая
система с key rotation. Решено: копируем 301-паттерн.

**Решение.**

### Иерархия

```
MASTER_SECRET (env)
  └─ AES-GCM encrypt/decrypt ────────► jwt_keys.secret_encrypted
                                          │
                                          ▼
                                     HS256 signing key
                                          │
                                          ▼
                                     JWT (header: kid → match row)
```

- `env.MASTER_SECRET` — 256-bit рандом, base64-encoded, через
  `wrangler pages secret put MASTER_SECRET`. Используется ТОЛЬКО как
  encryption key для шифрования signing keys в БД (через AES-GCM).
  Никогда напрямую не подписывает JWT.
- **Таблица `jwt_keys`** хранит множественные HS256-ключи. Колонки:
  `kid` (PK, формат `v1-YYYY-MM-DD-<uuid8>`), `secret_encrypted` (JSON
  encrypted blob), `status` (`active`/`deprecated`/`revoked`),
  `created_at`, `expires_at`, `rotated_at`, `revoked_at`.
- **JWT header содержит `kid`** — verifier берёт ключ по `kid` (не
  только active!), позволяя продлевать жизнь старых deprecated JWTs
  до их истечения.
- **Auto-init.** При первом запросе если active-ключа нет — генерится
  256-bit рандом, шифруется через MASTER_SECRET, кладётся в БД.
  Защита от race condition через KV-lock в `KV_CACHE`.
- **Cache active-ключа** в `KV_CACHE` (TTL 5 мин) — избегаем D1 SELECT
  на каждый sign.

### Состояния ключа

- `active` — единственный одновременно (enforced partial unique index
  `WHERE status='active'`). Им подписываются новые JWTs.
- `deprecated` — старый ключ, JWTs с его kid ещё валидируются
  (grace period для уже выданных токенов до их exp). Новых JWTs не
  подписывает.
- `revoked` — компрометирован или истёк по политике; JWTs с его kid
  отвергаются мгновенно.

### Rotation flow

1. Завести новый ключ со `status='active'` (atomically: переводим
   текущий active → deprecated, новый → active в одной транзакции).
2. Старые JWTs (выданные deprecated key'ем) ещё валидны до их `exp`
   (15 мин для access). Refresh-сессии остаются валидными — они
   живут в `auth_sessions`, не зависят от JWT key.
3. Через TTL (например, 30 дней) deprecated → `revoked`.

### Compromise-resistance

- Снимок D1 без MASTER_SECRET не даёт signing keys (они зашифрованы
  AES-GCM с auth tag).
- MASTER_SECRET редко читается (только при encrypt/decrypt текущего
  ключа, и то с KV-кэшем) → меньше шансов утечки через память/логи.
- Per-key revoke не требует ротации всей инфраструктуры.

### KV_CACHE namespace

4-й KV namespace добавляется к существующим трём:
- `KV_CACHE` — active JWT key cache (key: `cache:jwt:active_key`,
  TTL 5 мин) + creation lock (key: `lock:jwt:key:creation`, TTL 60 сек).
  Также future-purpose: любые другие short-TTL caches.

### Encryption

- AES-GCM 256, IV 12 байт, auth tag 16 байт. Все через Web Crypto API
  (нативно в CF Workers, нет deps).
- Формат `secret_encrypted` в БД — JSON-encoded `{ iv, ct, tag }` все
  в base64. Стандартная wire-форма для AES-GCM blob.

### Что НЕ копируем буквально из 301

- `KV_SESSIONS` в 301 — multi-purpose. У нас раздельные namespaces
  (KV_OAUTH_STATE / KV_VERIFY_TOKENS / KV_RATELIMIT / KV_CACHE) —
  чётче scope каждого, проще TTL-политики.
- `jwt_keys.created_at`/`expires_at` в 301 — TEXT ISO. У нас INTEGER
  unix-seconds (наш v0.8.2 type convention).
- 301 `jwt_keys` отсутствует partial unique index на active. У нас
  добавляем `CREATE UNIQUE INDEX ... WHERE status='active'` — БД сама
  enforce'ит "ровно один active key".

**Альтернативы.**

- Простой `JWT_SECRET` (один статический ключ). Отказ: rotation
  делать ретроактивно больно (нужно добавлять `kid` в header,
  мигрировать все JWTs). Лучше сразу с rotation-ready схемой.
- **`MASTER_SECRET` + HKDF derivation в памяти** (без БД). Отказ:
  derived keys тоже статичны без БД-trail. Нет rotation, нет revoke.
- **Asymmetric keys (RS256 / ES256)** — pub/priv pair. Отказ: HMAC
  быстрее, не нужны JWKS endpoint (мы не выдаём JWT внешним
  системам, только себе).
- **KMS / external HSM.** Отказ: дорого, vendor lock-in, не нужно для
  нашей шкалы.

**Причина.** 301-команда прошла этот путь на проде. Их финальное
решение — production-ready и protect от типовых JWT-проблем (key
compromise, ratchet rotation, replay через deprecated tokens).
Стоимость портирования — ~150 LoC + одна миграция + 4-й KV. Возврат
— rotation/revoke на день 1, не на день 365.


---

## 2026-05-14: auth flow conventions (Stage 19a-c, e-f notes)

**Контекст.** Реализованы password-flow auth libs + endpoints + UI
(Stages 19a/b/c/e/f). По ходу всплыло несколько паттернов, которые
будут переиспользоваться в OAuth + protected-endpoints stages:

### Astro 5 CSRF guard

`astro.config.mjs` по умолчанию (Astro 5+) включает
`security.checkOrigin: true`. Это блокирует POST с `Origin`, не
совпадающим с host, **возвращая 403 `Cross-site POST form submissions
are forbidden`** ДО того как endpoint выполнится. Решение оставлено
включённым — браузерные fetch к same-origin автоматически правильно
ставят Origin. cURL без `-H "Origin: ..."` ловит 403 — это правильное
поведение, не баг.

### Forms ↔ endpoints contract

- **HTML-форма** имеет `<form action="/api/auth/X" method="POST">` для
  no-JS graceful degradation (хотя сейчас все формы зависят от JS из-за
  Turnstile). Submit обработчик через `fetch()` посылает **JSON body**
  (не FormData) — endpoint парсит `await request.json()`.
- **Turnstile token** включается в JSON-body как `turnstileToken`
  (camelCase в JSON по нашей конвенции). Виджет рендерит hidden input
  `cf-turnstile-response` в форму; JS-handler читает его через
  `formData.get("cf-turnstile-response")`.
- **Errors** возвращаются в формате `{ error: "code", message?: "...",
  issues?: [...] }` с правильным HTTP-статусом (400/401/403/409/429).
  UI рендерит понятный message через локальный dict (`t.errors[code]`)
  с fallback'ом если кода нет.
- **`credentials: "same-origin"`** обязательно в fetch — без этого
  refresh cookie не отправится/не получится.

### Token storage on client

- **Access JWT** — `sessionStorage.setItem("moirai_access_token", ...)`.
  Очищается на logout. Чтение через JS для добавления в `Authorization:
  Bearer` header при API-запросах из браузера.
- **Refresh** — HttpOnly cookie `__Host-moirai_refresh`. JS не читает.
  Браузер шлёт автоматически на same-origin requests.

### SSR vs prerender для auth pages

- **prerender = true** только для статических pages БЕЗ env-чтения и
  без auth-guard: например, `verify-email-pending`.
- **prerender = false** (SSR) — login/register/password-reset (нужен
  `TURNSTILE_SITE_KEY` из env), account (нужна auth-guard через
  `verifyRefreshSession`).
- Astro frontmatter SSR-пейджа выполняется через @astrojs/cloudflare
  адаптер на каждый запрос; `Astro.locals.runtime.env` доступен.

### Info-hiding в endpoints

- **Login fail** — всегда generic `invalid_login` (401), не различает
  "user не существует" / "нет password method" / "wrong password".
  Дифференциация только в `audit_log.metadata.reason`.
- **Password reset request** — всегда 200, даже если email не
  зарегистрирован. Email уходит только при positive match.
- **Password reset confirm** — token consume **до** strength check,
  чтобы attacker не мог угадать "был ли token валиден" через timing.

### Что осталось вне Stage 19

- **Email provider** — `sendEmail()` сейчас STUB (`console.log`).
  Без реального сервиса verify-link и reset-link не уходят. См.
  отдельное решение об email-сервисе (Resend / Postmark / etc.).
- **i18n dict** — UI-строки в auth pages inline. Миграция в
  `src/lib/i18n/dict.{en,ru}.ts` — Stage 7 (translation-pair validator).
- **JWT-middleware для protected /api/*** — Stage 19g, когда появятся
  endpoints вне `/api/auth/*` требующие user-контекст.
