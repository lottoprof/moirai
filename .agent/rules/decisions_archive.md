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

---

## 2026-05-16: content-driven pages — sections в MDX frontmatter

**Контекст.** Marketing/content требует частых правок главной и других
публичных страниц: добавить/убрать секцию, поменять порядок блоков,
обновить тексты и изображения, провести A/B тесты раскладки. Если
layout захардкожен в `.astro`, каждая такая правка = PR с правкой кода,
ревью frontend-инженера, регресс-риск, медленный turnaround.

**Решение.**

- Публичные страницы (`src/pages/[locale]/*.astro` без `dashboard/`,
  `admin/`) — **тонкие композиторы**: загружают запись из коллекции
  `pages` по slug и локали, мапят `sections[]` на компоненты по
  `section.kind`. Длина .astro-файла ≈ 50 строк.
- Контент живёт в `src/content/pages/<slug>.{en,ru}.mdx`. Frontmatter
  содержит `seo` (title/description/og_image) и `sections[]` — discriminated
  union по `kind`: `hero`, `ticker`, `programmes-grid`, `instructors`,
  `bundles`, `journal-teaser`, `cta` и т.п. Каждый `kind` — отдельная
  zod-схема с типизированными полями.
- Изображения внутри секций — `image: image()` zod-helper + обязательный
  `alt: z.string().min(1)` (см. соседнее решение про images).
- Translation-pair validator (Stage 7) на CI проверяет: для каждой
  `<slug>.en.mdx` существует `<slug>.ru.mdx`, у них одинаковый `sections[].kind`
  на одинаковых индексах (структурная синхронность). Тексты могут
  расходиться, layout — нет.
- Добавление нового `kind` — задача fronend-инженера (zod-схема +
  компонент), но **изменение существующих страниц** контент-командой
  идёт без участия инженера.

**Альтернативы.**

- **Hardcoded layout в .astro** — отказ: блокирует контент-команду на
  каждом изменении, не масштабируется на 10+ публичных страниц.
- **Headless CMS (Sanity / Contentful / Strapi)** — отказ: лишняя
  инфраструктура, runtime-зависимость (latency, downtime, billing),
  потеря git-versioning контента и PR-review workflow.
- **Visual page builder (Builder.io / Plasmic)** — отказ: vendor lock-in,
  значительный client-side JS, противоречит "minimal JS в public layer".

**Причина.** Astro Content Collections + zod дают type-safe content
без CMS-инфраструктуры. Контент в git → git diff, PR-review, atomic
revert, no runtime dependency. Build-time типизация ловит расхождения
схемы и контента до деплоя. Контент-команда правит `.mdx` через любой
markdown-редактор (или git-aware visual editor типа TinaCMS поверх git
в будущем), инженер вмешивается только при появлении нового `kind`.

---

## 2026-05-16: images schema — alt mandatory + Astro `<Image>`

**Контекст.** A11y (WCAG 2.1 SC 1.1.1) требует alt-текст для каждого
информативного изображения; SEO — для краулеров и Image Search. Perf —
AVIF/WebP + responsive `srcset` снижают LCP. Если правила не
зафиксированы в схеме, контент-команда забывает alt, картинки уходят
в prod необработанными, размер страниц растёт.

**Решение.**

- В zod-схемах коллекций (`src/content/config.ts`) каждое поле с
  изображением — `image: image(), alt: z.string().min(1)`. Empty
  alt → build error.
- **Декоративные** изображения (фоны, орнаменты, не несущие смысла)
  помечаются явно через helper `decorative()` — zod-схема, возвращающая
  `{ src, alt: "" }`. Это explicit opt-in: "я подумал, alt не нужен",
  а не "забыл указать".
- Рендеринг — Astro `<Image src={section.image} alt={section.alt}
  widths={[400,800,1600]} sizes="..." />`. Sharp на build-time
  генерит AVIF + WebP + JPEG fallback, responsive `srcset`. Никакого
  runtime image processing.
- **Public layer** (`src/assets/images/**`) — все картинки локально в
  репозитории, прогоняются через Sharp pipeline на build. Размер
  репо — приемлемый trade-off за zero-runtime-latency.
- **Dashboard/private** — R2 (signed URLs), вне Sharp pipeline. Видео
  и платный контент.
- **Admin-uploaded images** (если появятся) — R2 + CF Image Resizing
  (платный, runtime). Отдельное решение когда понадобится.

**Альтернативы.**

- **alt optional** — отказ: нарушение a11y baseline, регресс-риск
  для каждой новой картинки.
- **runtime resize через CF Image Resizing для public** — отказ:
  платный pricing per-request, runtime latency, vendor lock-in. Public
  картинки знаем на build, нет причин процессить runtime.
- **Все картинки в R2 (включая public)** — отказ: теряем build-time
  Sharp оптимизацию + git-versioning картинок + PR-review при замене.

**Причина.** Build-time Sharp + zod-required alt = zero-runtime-cost
a11y + perf. Декоративные через explicit `decorative()` helper —
никаких "забытых alt'ов" и никакого silently-empty fallback. Public
картинки в git → atomic rollback вместе с кодом и контентом.

---

## 2026-05-16: dashboard routing — Astro MPA + View Transitions, NOT SPA

**Контекст.** На Sprint 1+ появятся страницы `/{locale}/dashboard/modules/[id]`,
`/dashboard/homework/...`, `/dashboard/schedule`, `/dashboard/community`.
Архитектурный вопрос: каждая страница — отдельный SSR-роут Astro, или
dashboard = одна shell-страница с client-side роутером (SPA-стиль)
загружающим контент через fetch?

**Решение.**

- **MPA-режим**: каждая dashboard-страница — собственный файл
  `src/pages/[locale]/dashboard/.../page.astro` с `export const
  prerender = false`. SSR на каждом запросе, авторизация через
  `verifyRefreshSession(env, request)` на каждом роуте, данные
  через `env.DB`/R2 server-side, передаются в шаблон.
- **Islands per-route** — каждая страница самостоятельно решает
  что гидрировать. На странице модуля: `<VidstackPlayer client:visible />`,
  `<HomeworkUploader client:idle />`. На overview: чистый HTML без
  hydration (см. оценку `docs/moirai_dashboard_mockup.html`).
- **Smooth navigation** — опциональный `<ClientRouter />` (Astro
  View Transitions API) в `DashboardLayout.astro`. Браузер делает
  fetch новой страницы и swap'ает body с CSS-анимацией. Это **не SPA**,
  а MPA с native-perceived плавностью. Browser back/forward, shareable
  URLs, no client-state-management — всё работает нативно.
- **Запрещено** в `[locale]/dashboard/**`: React-router, TanStack Router,
  Svelte SPA-shell, любые client-side роутеры. `client:*` директивы
  только на интерактивных островах (плеер, форма), не на навигации.

**Альтернативы.**

- **SPA-shell с client router'ом** — отказ. Аргументы против:
  (a) против Astro islands-philosophy; (b) добавляет JS-bundle для
  роутера во все dashboard-страницы; (c) ломает browser back если
  забыть wire pushState/popstate; (d) требует client state management
  (Zustand/Pinia/etc.) для согласованности данных между "виртуальными"
  страницами; (e) усложняет auth-guard (нужно проверять refresh на
  каждый client-side fetch + handle expiry redirect); (f) хуже для
  SEO/sharing — но dashboard noindex, так что этот пункт минорный.
- **Hybrid (overview = SPA, рест = MPA)** — отказ: непоследовательно,
  оба слоя расходятся в conventions, повышает cognitive load.
- **Пререндер static dashboard shell + client-side data fetch** —
  отказ: первый paint без данных = плохой UX, мигание skeleton'ов,
  лишний round-trip.

**Причина.** Astro — MPA-first фреймворк с островной гидрацией;
SPA-роутер поверх ломает эту модель и приносит сложность SPA без
своих преимуществ. CF Pages edge latency ≈ 50-100ms на navigation —
для dashboard, где студент сидит 90+ минут на одном модуле (лекция +
упражнения + homework), это незаметная цена. Per-route SSR даёт
чистый auth-guard (один вызов `verifyRefreshSession` на запрос),
чистый data-loading (один блок D1-запросов на странице), no client
state. View Transitions = "SPA feel" без SPA-сложности. Решение
открывает путь к простой архитектуре dashboard без JS-роутера, без
client-side state-store, без manual history management.

---

## 2026-05-17: переосмысление модели programmes / modules / enrollments + multi-role + role-zones

**Контекст.** При подготовке Stage 21 (instructor + admin mocks) обнаружили
накопившиеся напряжения в текущей модели Architecture.md §5 и §6:

- `modules` — атрибут programme в Content Collection, не reusable между
  программами;
- `tiers` (self-paced/standard/premium) — отдельное измерение,
  усложняющее enrollment-схему;
- `bundles` — отдельная сущность с собственным purchase flow;
- `users.role` — single value, мешает админу одновременно преподавать;
- `/admin/` зона без локали — admin'у нужно переключать язык контента
  не имея locale в URL;
- `/[locale]/dashboard/` — общая зона student + instructor, мокапы
  показывают что эти роли требуют принципиально разных UI;
- Mockup admin users page вводил термины ("TIER: Beginner") не совпадающие
  с Architecture.md (programme/tier — разные оси).

После аудита 12 пунктов и серии решений модель и зоны переписаны.

**Решение.**

### Модель контента и enrollments

1. **Module — first-class сущность.** Источник правды — отдельный
   git репо (`lottoprof/moirai-content` или аналог), методисты
   коммитят `modules/{slug}.{en,ru}.mdx` туда. CI sync-pipeline
   доставляет метаданные в D1 (`modules` table), тело в R2
   (`modules/{slug}.{locale}.md`), видео отдельным upload'ом в R2
   через wrangler/admin.

   Lifecycle: `draft → published → archived`. **Delete не существует**
   как методистская операция. Hard DELETE — только admin'ская
   "Cleanup" когда usage = 0. Любые ссылки из existing enrollments
   защищены downgrade'ом до `archived` в sync pipeline.

2. **`requires_modules`** — список модулей, без которых данный не
   имеет смысла. При добавлении модуля X в enrollment auto-resolve
   рекурсивно подтягивает все транзитивные зависимости. Циклы
   запрещены — external repo CI делает topological sort, ломает
   merge при цикле.

3. **Programme — Content Collection шаблон.** В `src/content/programmes/`
   с frontmatter `{id, title, default_modules: [slugs], price,
   features, marketing}`. Special programme `individual` — пустой
   `default_modules`, маркетинг "соберём под вас".

   **Tier и Bundle как отдельные сущности отменяются.** Варианты
   ("Beginner standard" vs "Beginner premium") — это разные programmes.
   Bundle ("Beginner+Intermediate скидкой") — отдельная published
   programme с подобранными модулями + bundle-ценой.

4. **Enrollment — mutable D1 instance.** `user × programme_slug` с
   snapshot цены и фич на момент покупки. Modules — отдельная таблица
   `enrollment_modules` с mutable списком (instructor может add/remove
   постфактум). При покупке: `enrollment_modules` копируются из
   `programme.default_modules` (с auto-resolve `requires_modules`).

   Три flow одной механикой:
   - **Ready programme**: купил Beginner → enrollment(slug='beginner') +
     12 modules скопированы
   - **Individual**: купил individual → enrollment(slug='individual') +
     0 modules. Instructor потом composes
   - **Extension**: instructor добавляет модуль к existing enrollment

5. **Refund/cancellation семантика:** `enrollment.status='refunded'` или
   `'cancelled'` → `hasAccessToModule()` возвращает false, данные в
   `enrollment_modules` остаются для audit.

### Role-zones

6. **`/[locale]/instructor/` — НОВАЯ зона.** Отделяется от
   `/[locale]/dashboard/`. Маппинг:
   ```
   /[locale]/dashboard/**     student only
   /[locale]/instructor/**    instructor only
   /admin/**                  admin only (без локали)
   ```
   Каждая зона — свой Layout, Nav, agents (`astro-student.md`,
   `astro-instructor.md`, `astro-admin.md`).

7. **`/[locale]/account` — cross-zone.** Один URL для всех ролей,
   layout dynamic по primary role user'a. Admin'у — AdminLayout,
   instructor'у — InstructorLayout, остальным — DashboardLayout.

8. **Admin не имеет автоматического доступа на `/instructor/`** —
   404 если он только admin. Чтобы был доступ — у user должна быть
   роль `instructor` явно (multi-role, см. ниже).

### Multi-role

9. **`users.role` удаляется** (вместе с CHECK constraint). Заменяется
   на M2M-таблицу `user_roles (user_id, role)`. Один user может иметь
   роли в любой комбинации (admin + instructor — admin-преподаватель).

10. **Last-active-admin invariant** — DB triggers:
    - `prevent_role_orphan`: после DELETE из `user_roles` запрет если
      у user'a осталось 0 ролей
    - `prevent_last_admin_demotion`: запрет remove admin role если
      это был последний **active** admin (deactivated user'ы не
      считаются)

11. **Nav-zone-switcher** — если у user'a несколько ролей, в каждом
    nav (DashboardNav/InstructorNav/AdminNav) появляется блок ссылок
    на другие доступные зоны. Default landing после login — приоритет
    `admin > instructor > student`.

### Deactivation

12. **`users.deactivated_at INTEGER NULL`** — soft, reversible. Deactivated
    user **может login'иться**, но `computeRedirectTarget` и guards
    редиректят на `/[locale]/inactive` страницу-заглушку. `/account`
    доступен (для re-activation request). Все enrollments скрыты через
    `hasAccessToModule`.

13. **Anonymize endpoint** — `POST /api/admin/users/[id]/anonymize`:
    email → `deleted-{uuid}@example.invalid`, name → NULL,
    `auth_methods` + `auth_sessions` → DELETE. Audit_log сохраняется.
    Irreversible.

### API (admin scope)

14. **Endpoints:**
    ```
    GET    /api/admin/users                  list/filter/search
    GET    /api/admin/users/[id]             detail
    POST   /api/admin/users                  create (+ опционально enrollment)
                                              auto-trigger password-reset email
    PATCH  /api/admin/users/[id]             name, locale, email
    PATCH  /api/admin/users/[id]/roles       { roles: [...] }
    POST   /api/admin/users/[id]/reset-password    re-issue password-reset
    POST   /api/admin/users/[id]/send-password-setup  for first-time login (no auth_methods yet)
    POST   /api/admin/users/[id]/deactivate
    POST   /api/admin/users/[id]/reactivate
    POST   /api/admin/users/[id]/anonymize         irreversible

    GET    /api/admin/enrollments
    POST   /api/admin/enrollments            grant { user_id, programme_slug, lead_instructor_id? }
    PATCH  /api/admin/enrollments/[id]       status, lead_instructor_id
    POST   /api/admin/enrollments/[id]/modules        add (auto-resolve deps)
    DELETE /api/admin/enrollments/[id]/modules/[slug] remove (block on dependents)
    ```
    **Отдельного `invite` endpoint нет** — `POST /api/admin/users` =
    create + auto-send password-setup email через существующую
    password-reset infrastructure (KV_VERIFY_TOKENS + email-template
    вариант).

15. **Lead instructor per enrollment** — `enrollments.lead_instructor_id NULLABLE`.
    Single lead (Option 1 из обсуждения). Только lead + admin могут
    add/remove modules + менять price. Другие instructor'ы видят
    read-only + могут оставлять feedback на homework через
    `feedback.instructor_id`. Cohort scheduling с 2+ instructors —
    Sprint 2 через `runs.lead_instructor_id` + `run_instructors` M2M.

### Доступ и helpers

16. **`hasAccessToModule(env, userId, slug)`** — централизованный helper:
    проверяет `users.deactivated_at IS NULL` + active enrollment с
    этим slug в `enrollment_modules`. Используется во всех точках
    рендера приватного контента (media, modules page, homework).

17. **`requireRole(ctx, role)`** — guard helper. Не залогинен →
    redirect на `/{locale}/login?return_to=...`. Не та роль → 404
    (info-hiding). Deactivated → redirect на `/{locale}/inactive`.

18. **`computeRedirectTarget(user, returnTo)`** — единая логика
    post-login redirect. `sanitizeReturnTo` валидирует что
    `return_to` ведёт в зону доступную user'ской роли (иначе silent
    fallback на role-home).

19. **JWT теряет role** — access JWT шифрует только user_id. Roles
    читаются из БД на каждый guard через `getUserWithRoles`. Force-logout
    на role change не нужен (additive — новая зона доступна сразу,
    removal — guard блокирует на след. запрос).

20. **Локаль-completeness:** каждый module обязан иметь обе локали
    (`{slug}.en.mdx` И `{slug}.ru.mdx`). External repo CI ломает
    merge при mismatch. Translation-pair validator Stage 7 — extended
    version того же паттерна.

### Programme pages rendering

21. **`/[locale]/programmes/[id]` — `prerender = false`** (SSR).
    Module titles живут в D1, denormalize в Content Collection
    означает drift. SSR + CF edge cache `Cache-Control: s-maxage=60,
    stale-while-revalidate=3600` даёт перф достаточный для маркетинг-страниц.

### Bootstrap

22. **Первый admin** — `lottoprof@gmail.com` (текущий пользователь).
    Назначается one-off wrangler-командой после применения миграции
    0004. Записано в `.agent/skills/deploy/SKILL.md` как bootstrap
    procedure.

### Что НЕ входит сейчас (явно отложено)

- **Sync pipeline** методическое-репо → D1+R2 — Sprint 2 (Stage 21
  использует STUB seeded модули)
- **Payments** (real checkout, Lemon Squeezy/Paddle) — Sprint 2
- **Runs / cohorts / scheduling** — Sprint 2
- **Feedback / homework submission** — Sprint 2
- **Optimistic concurrency** на enrollment_modules — Sprint 2 (риск
  при ≤5 instructors практически отсутствует)
- **Free preview modules** — Sprint 2 (lead magnet)
- **Build-time validation programme.default_modules** — Sprint 2
  (сейчас server expand'ит deps при checkout)

**Альтернативы.**

- **Сохранить tiers/bundles как отдельные сущности.** Отказ:
  усложняет схему (4 таблицы вместо 2), bundles по факту были
  "марикетинг = programme с подобранными модулями", tiers смешивались
  с "programme-variant" — пользователи путались.
- **Module body в D1 как TEXT.** Отказ: long body раздувает строки,
  R2 дешевле и проще для версионности.
- **Module body в moirai's Content Collection.** Отказ: методисты не
  должны иметь доступ к фронтенд-коду; отдельный repo даёт чистую
  границу ответственности.
- **Single role с автоматической эскалацией** (admin → instructor →
  student permissions). Отказ: не покрывает кейс admin-преподавателя
  чисто (admin ≠ instructor в зонах, у каждой свой Nav). M2M даёт
  семантически явный набор.
- **JWT с roles внутри.** Отказ: refresh+verify добавляют latency
  при role change; M2M запрос дёшев (одна индексированная D1-запрос).
- **`/admin/[locale]/` (locale-prefixed).** Отказ: было предложено
  пользователем, отозвано в пользу `/admin/` без локали (admin'ская
  локаль в user.locale, контент language-aware на уровне страниц).

**Причина.** Модель упрощается семантически (две таблицы вместо
четырёх для enrollment-flow), даёт композицию programmes из reusable
modules, отделяет методический контент от моиrai-кода, и поддерживает
admin-преподавателей как natural multi-role. Каждое решение покрывает
конкретный pain (tier confusion, single-role lockout, module-not-reusable,
admin-zone-locale) без введения spec-уровневой сложности.

---

## 2026-05-17: staff (admin/instructor) ⊥ student — mutual exclusion

**Контекст.** После применения migrations 0003-0005 и реализации
multi-role drawer'а в admin UI обнаружилось: при grant'е admin/instructor
существующему student'у он остаётся multi-role (admin+student или
instructor+student). Это семантически бессмысленно:

- **Staff** (admin/instructor) — люди работающие в платформе
- **Student** — клиент, купивший курс

Один user не может быть и тем и другим одновременно. Admin не платит
за свой же курс; instructor не учится у самого себя.

Multi-role в дизайн заложен для **admin+instructor** (admin-преподаватель,
обсуждалось 2026-05-17 §multi-role) — это staff+staff, валидно. А
staff+student — нет.

**Решение.**

1. **Migration 0006:** trigger `staff_role_excludes_student` на
   `AFTER INSERT ON user_roles WHEN NEW.role IN ('admin','instructor')`
   → атомарно DELETE'ит `student` row у того же user'a.

2. **Backfill** в той же миграции: исправляет существующие
   admin+student / instructor+student пары (удаляет student у staff'a).

3. **Reverse direction** (INSERT student для staff-user'а) не
   запрещается trigger'ом — UI/endpoint workflow решает что показывать.
   Кейс: бывший admin уходит из штата, становится клиентом — `PATCH
   /api/admin/users/[id]/roles { roles: ['student'] }` снимает admin
   (через DELETE), добавляет student (через INSERT). prevent_role_orphan
   защищает от ситуации "0 ролей" между операциями (batch).

**Допустимые комбинации:**

| Roles set | Valid? |
|---|---|
| `{admin}` | ✓ |
| `{instructor}` | ✓ |
| `{student}` | ✓ |
| `{admin, instructor}` (admin-преподаватель) | ✓ |
| `{admin, student}` | ✗ — trigger auto-cleanup → `{admin}` |
| `{instructor, student}` | ✗ — trigger auto-cleanup → `{instructor}` |
| `{admin, instructor, student}` | ✗ — trigger auto-cleanup → `{admin, instructor}` |

**Альтернативы.**

- **CHECK constraint на user_roles** — невозможно, CHECK не видит
  другие row'ы той же таблицы.
- **Application-only check** — без DB-level invariant возможно
  состояние drift, если другой код пишет напрямую (миграции,
  manual SQL). Trigger гарантирует invariant на DB-уровне.
- **Запретить INSERT student для staff-user'а через BEFORE INSERT
  trigger с RAISE(ABORT)** — отказ: усложняет drag-операции demote
  admin → student (надо двух-шаговый flow с временным состоянием
  "0 ролей" что ломает prevent_role_orphan). Auto-DELETE проще
  и идемпотентнее.

**Причина.** Доменная семантика: staff и customer — взаимоисключающие
роли в LMS. Auto-cleanup в trigger'е даёт идемпотентность операций
(grant admin студенту = student auto-revoked) и убирает класс
inconsistency-багов на DB-уровне.

Связанные триггеры (см. 0003, 0005):
- `prevent_role_orphan` — у user'a всегда ≥1 роль
- `prevent_last_admin_demotion` — ≥1 active admin в системе

Все три trigger'a вместе формируют целостный набор role-invariants.

---

## 2026-05-19: метаданные модулей и workflow методистов (clarifications)

**Контекст.** Получен первый methodist `.ods` шаблон (`Moirai_Modules_Template
1V.ods`) с реальными модулями для Beginner и Intermediate (11+13 модулей).
В шаблоне колонки: ID, Программа, Трек, Порядок, Название (ru), Краткое
описание, Тип содержания, Длительность, Домашка, Описание домашки, Цели,
Ключевые понятия. После обсуждения пересмотрены несколько аспектов модели
из 2026-05-17.

**Решение.**

### Module ↔ Programme отношение

1. **Модуль — атомарная независимая единица.** В `modules` table НЕТ полей
   `programme_slug` / `order_in_programme`. Модуль может быть включён в
   любое количество programmes.

2. **Programme — wrapper над 1+ модулей с ценой и features.** Single-module
   programmes — валидный кейс. Пример: `programmes/budget-calculation.mdx`
   содержит один модуль `int-12-budget` и продаётся за €49, тогда как
   тот же модуль также является частью programme `intermediate` за €499.

3. **Programme.mdx содержит ordered list module slugs** (поле `modules:` в
   frontmatter). Один и тот же slug может фигурировать в нескольких
   programme файлах — это нормально.

4. **Methodist `.ods` колонки «Программа» и «Порядок»** — suggestion-only,
   НЕ data-model constraint. Это удобство для методиста (группировка строк
   в шаблоне). При sync можно сохранять как `modules.suggested_programme` /
   `modules.suggested_order` для UI-подсказок в admin compose, но primary
   source-of-truth о составе programme — programme.mdx файл.

### Дополнительные metadata колонки в modules

5. **Добавляются 3 столбца** (миграция позже, когда понадобятся):
   - `summary TEXT` — 1-2 sentence description (для programme-page и
     dashboard module-card list views)
   - `objectives_json TEXT NOT NULL DEFAULT '[]'` — learning objectives
     (2-4 пункта)
   - `concepts_json TEXT NOT NULL DEFAULT '[]'` — ключевые термины
   Метаданные дублируются между .yaml frontmatter (source) и D1 columns
   (denormalized cache) — sync pipeline копирует. Это нужно для быстрых
   list-queries без R2 round-trip за каждым модулем.

6. **`requires_modules` default `[]`** — методисты заполняют только когда
   модуль действительно "не работает без других". Большинство модулей —
   пусто. Schema `modules.requires_modules_json TEXT NOT NULL DEFAULT '[]'`
   уже это поддерживает.

### Состав модуля у методиста

7. **Три типа материала** в работе методиста над модулем:
   - **Личные заметки** — рабочий материал методиста, НЕ публикуется.
     Хранение — локально у методиста или в `private/` папке external repo
     (gitignored). Платформа не видит.
   - **student_book** — body, который видит студент. Опубликованный материал.
     Формат: PDF (бинарник) ИЛИ markdown. Методист выбирает на модуль.
     Storage: R2.
   - **Метаданные** — структурированные поля (см. выше). Storage: yaml в
     external repo → sync в D1 columns.

### External git repo и workflow

8. **External git repo `moirai-content`** (или аналог) — источник правды
   для всех модулей. Git обязателен для истории.

9. **Структура repo:**
   ```
   modules/
     {slug}/
       metadata.yaml         ← структурированные метаданные
       student_book.ru.pdf   ← body для студента (PDF или md)
       student_book.en.pdf
       images/               ← assets (если markdown + relative refs)
       private/              ← опц. — личные заметки методиста (gitignored)
   ```

10. **Sync pipeline (Sprint 2):**
    GH Actions on push to main → парсит metadata.yaml + загружает PDF/md
    в R2 + POST на `/api/admin/modules/sync` с manifest и shared secret.
    Server: UPSERT в `modules`, PUT в R2.

### Workflow методиста: Path A первый

11. **Path A — Git-нативный методист** (первый этап):
    Методист клонирует repo, работает в любом редакторе, commit'ит файлы,
    git push. Sync автоматически.

12. **Path B — Admin web-UI** (опционально позже):
    Когда появятся методисты без git-навыков — отдельная admin-страница
    с формой + upload PDF. Backend commit'ит в git через GitHub API и
    параллельно пишет в D1+R2.

### Что НЕ входит сейчас

- Webhook/CI sync pipeline — Sprint 2 (текущий .ods обрабатываем вручную
  через скрипт когда понадобится seed test-modules в D1).
- Admin Web-UI для методистов (Path B) — после первого реального опыта
  с Path A.
- `.ods → manifest.json` парсер — нужен для одноразового seed test data
  (есть готовое использование unzip + content.xml в bash).
- Локализация body — `student_book.{locale}.pdf|md` per language; единый
  файл с language-блоками отвергнут (плохо для PDF binary).

**Альтернативы.**

- **modules.programme_slug (1-to-many)** — отвергнут: модуль может быть
  в нескольких programmes (single-module sale + as part of Beginner).
  M2M через programme.modules array решает чище без denormalized FK.
- **Метаданные в body markdown frontmatter (source) с runtime parse** —
  отвергнут: каждый list-view вызывает R2 GET для каждого модуля.
  Денормализация в D1 даёт O(1) на программу.
- **.ods как primary format в git** — допускается как промежуточный
  этап (текущий шаблон), но долгосрочно — yaml+pdf per-module folder
  чище для git diffs и автоматизации.
- **Web-UI как основной интерфейс методиста (Path B сразу)** —
  отвергнут: преждевременно. Сначала Path A — поймём реальный workflow.

**Причина.** Модель «модуль атомарный, programme — wrapper» даёт максимум
гибкости (single-module sales, bundle reuse, custom compose) без
усложнения схемы. Metadata в D1 columns + body в R2 — практичный split:
D1 для быстрых queries, R2 для тяжёлого контента. Git-first workflow
сохраняет историю методистской работы; admin-UI можно добавить как
convenience layer когда workflow устаканится.

Связанные решения:
- 2026-05-17 §модули — оригинальная модель modules in external repo + D1+R2
- 2026-05-17 §programmes — programmes как Content Collection wrappers

