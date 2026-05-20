# Sprint 0 Stage 19 — Auth flow (register/login + Google + Discord)

## Context

Stage 18 поднимает D1 + auth schema (4 таблицы). Stage 19 строит
поверх неё боевой auth flow:

- **Email + password** регистрация и login
- **Google OAuth** (sign-in/up + linking)
- **Discord OAuth** (sign-in/up + linking, **без email отклоняется**)
- **Email verification** (для password-flow и unverified OAuth)
- **Password reset**
- **Logout** (revoke refresh session)
- **Profile-level account management**: добавить/удалить
  password method, link/unlink OAuth identity (с проверкой что
  остаётся хотя бы один способ login)

Полный rationale — `decisions_archive.md` 2026-05-12.

## Stack-конвенции

- **Native Astro 5 endpoints** (`src/pages/api/auth/**.ts`), не Hono
- **`Astro.locals.runtime.env`** для биндингов (`DB`, `KV_*`, secrets)
- **PBKDF2-SHA256 600k iter** через Web Crypto API (native CF Workers)
- **JWT (HS256) access 15min** + opaque refresh secret в HttpOnly cookie
- **CF Turnstile** на public-facing форм submit
- **KV rate-limit** counter (sliding window 1min) на register/login

## Prerequisites (от пользователя)

### Google Cloud Console

1. `console.cloud.google.com` → создать проект `moirai-auth`
2. APIs & Services → OAuth consent screen → External, app name "Moirai",
   support email, scope `email` + `profile` + `openid`
3. Credentials → Create OAuth 2.0 Client ID → Web application:
   - Authorized redirect URIs:
     - `https://moiraionline.pro/api/auth/oauth/google/callback`
     - `https://moirai-c6e.pages.dev/api/auth/oauth/google/callback`
     - `http://localhost:8788/api/auth/oauth/google/callback` (для local smoke)
4. Скопировать **Client ID** + **Client Secret**

### Discord Developer Portal

1. `discord.com/developers` → New Application "Moirai"
2. OAuth2 → Redirects:
   - `https://moiraionline.pro/api/auth/oauth/discord/callback`
   - `https://moirai-c6e.pages.dev/api/auth/oauth/discord/callback`
   - `http://localhost:8788/api/auth/oauth/discord/callback`
3. OAuth2 → Scopes: `identify`, `email`
4. Скопировать **Client ID** + **Client Secret**

### Cloudflare Turnstile

1. `dash.cloudflare.com` → Turnstile → Add site
2. Domain: `moiraionline.pro`
3. Widget mode: Managed (auto-challenge level)
4. Скопировать **Site Key** (публичный) + **Secret Key**

### Secrets через wrangler

```bash
corepack pnpm exec wrangler pages secret put GOOGLE_CLIENT_ID --project-name moirai
corepack pnpm exec wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name moirai
corepack pnpm exec wrangler pages secret put DISCORD_CLIENT_ID --project-name moirai
corepack pnpm exec wrangler pages secret put DISCORD_CLIENT_SECRET --project-name moirai
corepack pnpm exec wrangler pages secret put TURNSTILE_SECRET --project-name moirai
corepack pnpm exec wrangler pages secret put JWT_SECRET --project-name moirai
# JWT_SECRET — длинная случайная строка, ~64 chars:
# pwgen -s 64 1
corepack pnpm exec wrangler pages secret put IP_HASH_SALT --project-name moirai
# IP_HASH_SALT — длинная случайная строка для sha256 IP-хэширования
```

**`TURNSTILE_SITE_KEY`** — публичный, можно зашить в `astro.config`
или в `.env` (commitable) и брать как build-time переменную.

`.dev.vars` (gitignored) — копия для local dev:

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
TURNSTILE_SECRET=...
JWT_SECRET=...
IP_HASH_SALT=...
```

## Progress

| Этап | Что | Status | Commit |
|---|---|---|---|
| 19a | Server libs: crypto / hash / password / jwt | ✅ done | `9d75db7` |
| 19b | Session module (refresh sessions + cookie helpers) | ✅ done | `29691d4` |
| 19c | Support utils: turnstile / ratelimit / audit / user-ops | ✅ done | `7fcb58e` |
| 19d | OAuth helpers (oauth.ts state mgmt + google.ts + discord.ts) | ⏳ ждёт GOOGLE_CLIENT_*, DISCORD_CLIENT_* |  |
| 19e | API endpoints (`src/pages/api/auth/**.ts`) | ✅ done (password flow) | `59846e6` |
| 19f | UI pages (login/register/account/verify-email-pending/password-reset) | ✅ done | `f6d5527` |
| 19f-dashboard | Student dashboard stub (`/{locale}/dashboard`) + redirect targets verify→dashboard, login→dashboard | ✅ done |  |
| 19g | Middleware JWT verification для /api/* | ⏳ (когда появятся protected endpoints вне /api/auth) |  |
| **19h** | **E2E verification на проде** — full flow прошёл с реальным email 2026-05-15 | ✅ **done** |  |
| —   | Email service (Resend) — настроен, домен verified, HTML+text templates per-locale | ✅ done |  |
| —   | TTL settings: verify-email 30 мин, password-reset 15 мин | ✅ done |  |
| —   | Chrome autofill quirk: `form.reportValidity()` force-sync для всех 3 форм | ✅ done |  |
| —   | Open: Chrome autopassword UX — user reported, отложен для отдельного описания | ⏳ |  |
| —   | i18n: UI-строки в auth pages inline; миграция в `dict.{en,ru}.ts` — Stage 7 | ⏳ |  |

## Этапы

### 19a — server libs

`src/lib/server/` — новая папка, все utils.

- **`password.ts`** — `hashPassword(password): Promise<string>`,
  `verifyPassword(password, stored): Promise<boolean>`,
  `validatePasswordStrength(password): { ok: boolean; error?: string }`.
  PBKDF2-SHA256, 600k iter, формат `iterations:salt:hash` base64.
  Min 10 chars, max 128, blacklist common.
- **`jwt.ts`** — `signAccessJWT(payload, env): Promise<string>`,
  `verifyAccessJWT(token, env): Promise<Payload | null>`. HS256,
  15min TTL, claims: `sub` (user_id), `role`, `iat`, `exp`, `fp`
  (fingerprint = sha256(ip+ua)).
- **`session.ts`** — `createRefreshSession(env, user_id, req): Promise<{cookie}>`,
  `verifyRefreshSession(env, cookie_value): Promise<{user_id, session_id} | null>`,
  `revokeRefreshSession(env, session_id): Promise<void>`. Opaque
  secret 32 bytes → cookie + sha256 → D1.
- **`hash.ts`** — `hashIp(ip, salt): string`, `sha256(s): string`.
- **`turnstile.ts`** — `verifyTurnstile(token, ip, env): Promise<boolean>`
  через CF siteverify endpoint.
- **`ratelimit.ts`** — `checkRateLimit(env, key, {max, windowSec}):
  Promise<{allowed, remaining}>` — KV counter с sliding-window.
- **`audit.ts`** — `logAuth(env, event, user_id, method, req, metadata?)`
  пишет в `audit_log` таблицу.
- **`oauth.ts`** — общие утилиты: `generateState()`,
  `storeState(env, provider, state, verifier, redirectHost)`,
  `consumeState(env, provider, state)` через `KV_OAUTH_STATE`.
- **`oauth/google.ts`** — `buildGoogleAuthUrl(env, state, codeChallenge, redirectUri)`,
  `exchangeGoogleCode(code, verifier, env): Promise<{email, sub, email_verified}>`.
  Включает JWKS-верификацию id_token через `jose` библиотеку.
- **`oauth/discord.ts`** — same shape для Discord. Discord не
  использует id_token — после code exchange делаем GET
  `discord.com/api/users/@me`. Возвращаем `{email, id (snowflake),
  email_verified}`. Если `email` пустой ИЛИ `verified=false` —
  кидаем `EmailRequiredError`.
- **`user-ops.ts`** — `findUserByEmail`, `createUser`, `linkAuthMethod`,
  `findOauthMethod`, `getUserMethods` — D1 query helpers.

Dep `jose` для JWKS:

```bash
corepack pnpm add jose
```

### 19b — endpoints

`src/pages/api/auth/` — все эндпоинты `prerender = false`.

| Endpoint | Method | Что делает |
|---|---|---|
| `register.ts` | POST | Email + password → Turnstile → rate-limit → existing email check → hash password → INSERT user + auth_methods(password) → send verify email → return `{status:'verification_sent'}` |
| `login.ts` | POST | Email + password → Turnstile → rate-limit → SELECT user → SELECT password method → verifyPassword → generic 401 `invalid_login` if any fails → create refresh session + JWT → set cookie → return `{access_token, user}` |
| `logout.ts` | POST | Read refresh cookie → revoke session (UPDATE auth_sessions SET revoked_at) → clear cookie → audit log |
| `refresh.ts` | POST | Read refresh cookie → verify in D1 (not revoked, not expired) → rotate session (new secret) → new JWT → set new cookie |
| `me.ts` | GET | Verify JWT in Authorization header или cookie → return current user + linked methods |
| `verify-email.ts` | GET | `?token=...` → consume KV verify token → UPDATE users SET email_verified_at → audit log → redirect to `/{locale}/account?verified=1` |
| `password-reset/request.ts` | POST | Email → Turnstile → rate-limit → ALWAYS return 200 (info-hiding) → если user найден И есть password method → send reset email |
| `password-reset/confirm.ts` | POST | `{token, new_password}` → consume KV reset token → UPDATE auth_methods SET secret_hash → audit log → return 200 |
| `oauth/google/start.ts` | GET | Generate state + code_verifier → store в KV → redirect to Google auth URL |
| `oauth/google/callback.ts` | GET | Consume state → exchange code → JWKS-verify id_token → linkOrCreateUser(google, email, sub) → create session → redirect to `/{locale}/account` или `?return_to` |
| `oauth/discord/start.ts` | GET | Same pattern (state + verifier in KV) |
| `oauth/discord/callback.ts` | GET | Exchange code → fetch `/users/@me` → **if no email or unverified → redirect to `/{locale}/login?error=discord_no_email`** → linkOrCreateUser(discord) → session → redirect |
| `methods/set-password.ts` | POST (authenticated) | Set/change password method для существующего user-а |
| `methods/unlink.ts` | POST (authenticated) | Unlink OAuth method, **с проверкой что хотя бы один метод останется** |

### 19c — middleware: JWT verification

`src/middleware.ts` обновить: для `/api/**` (кроме `/api/auth/*`)
проверить JWT в `Authorization: Bearer` header ИЛИ в session cookie,
поставить `Astro.locals.user = { id, role, ... }`. Если invalid —
401.

Для `/[locale]/dashboard/**` (когда появится) — same check на
страничном уровне, redirect на `/{locale}/login?return_to=...`
если unauthenticated.

### 19d — UI pages

`src/pages/[locale]/`:

- **`login.astro`** — форма email+password, две кнопки "Continue
  with Google" / "Continue with Discord", Turnstile widget,
  под формой статичный hint *"Forgot password? Or sign in with
  Google / Discord."* (см. decision про generic invalid_login).
  Query params handling:
  - `?error=discord_no_email` → красный баннер с объяснением
  - `?error=invalid_login` → "Invalid email or password. Try password reset or sign in with social."
  - `?return_to=...` → после успешного login redirect туда
- **`register.astro`** — форма email + password (со strength meter),
  Turnstile, OAuth кнопки. После submit показывает "Check your inbox
  to verify your email"
- **`account.astro`** (authenticated) — current email + verified status,
  linked auth methods (с возможностью unlink), set/change password
  кнопка, "Sign out" кнопка
- **`verify-email-pending.astro`** — статичная "We sent a link to
  YOUR_EMAIL. Check inbox / spam. Resend in 60s."
- **`password-reset.astro`** — request reset (email field) и confirm
  (token + new password) — два режима на одной странице, переключаются
  query param `?token=...`

### 19e — email отправка

`src/lib/server/email.ts` — обёртка над transactional service.
Решение по провайдеру отдельно (Resend / Postmark / CF Email
Workers). Для Sprint 0 — отложим: в `.dev.vars` пишем
`EMAIL_PROVIDER=console` и `sendEmail()` просто логирует в console
без реальной отправки. Когда выберем провайдер — заменим
implementation, остальная архитектура не меняется.

**Templates** — пока inline в JS (`templates/verify-en.txt`,
`templates/verify-ru.txt` etc.). HTML-вёрстка — отдельным шагом
после выбора провайдера.

### 19f — i18n strings

Все UI-строки (`login.astro`, `register.astro`, error messages,
email templates) — через `dict.{en,ru}.ts` (Stage 7 dependency).
Если Stage 7 ещё не сделан — добавляем строки inline + TODO
"move to dict".

### 19g — verification

```bash
pnpm build
pnpm exec wrangler pages dev ./dist
```

Test scenarios:
1. `POST /api/auth/register` — happy path, видим INSERT в users +
   auth_methods, в console "verify email" log
2. Дубль register → 409 (или generic 200 + email "you tried to
   register again" — TBD)
3. `POST /api/auth/login` с правильными credentials → 200 + cookie +
   JWT
4. `POST /api/auth/login` с неверным паролем → 401 `invalid_login`
5. `POST /api/auth/login` с email который зарегистрирован через
   Google (нет password method) → 401 `invalid_login` (same
   generic error)
6. Browser flow: `GET /api/auth/oauth/google/start` → redirect →
   callback → создан user + auth_method(google) → cookie set →
   redirect to /account
7. Browser flow Discord без email scope grant → user отказывает →
   callback видит `email=null` → redirect `?error=discord_no_email`
8. Link flow: зарегился password → /api/auth/oauth/google/start →
   email совпадает с существующим → auto-link (`auth_methods`
   получает google row) → success toast
9. Unlink — если у user 2+ methods, может unlink один. Если 1 —
   `400 cannot_unlink_last_method`
10. JWT expired → middleware отвергает → client делает refresh →
    new JWT
11. Refresh expired или revoked → 401 → user re-login
12. Rate-limit: 6 register на одного IP за минуту → 6-й = 429
13. Turnstile fail → 403 `turnstile_failed`

Audit log проверка:

```bash
corepack pnpm exec wrangler d1 execute moirai-prod --remote \
  --command="SELECT event, method, created_at FROM audit_log ORDER BY created_at DESC LIMIT 10"
```

## Verification (cumulative)

- [ ] Все 13+ test scenarios проходят локально
- [ ] `audit_log` содержит записи на каждое auth-событие
- [ ] Production secrets установлены через `wrangler pages secret put`
- [ ] Turnstile виден на login/register формах
- [ ] OAuth Google: end-to-end на проде (`https://moiraionline.pro/login`
      → "Sign in with Google" → callback → logged in)
- [ ] OAuth Discord: end-to-end + error path при отказе email scope
- [ ] Generic `invalid_login` не различает причины fail (info-hiding
      verified)
- [ ] `pnpm lint && pnpm typecheck && pnpm build` зелёные
- [ ] `db/types.ts` экспортит payload types для JWT

## Out of scope (отдельные stages)

- **Реальный email provider** (Resend / Postmark setup, DKIM/SPF,
  HTML templates) — отдельная задача после выбора сервиса
- **Apple Sign-In** — добавится отдельным stage если решим
- **VK / Yandex / Facebook OAuth** — extensible через config + 2 endpoints,
  отдельные stages
- **2FA / WebAuthn / passkeys** — Sprint 1+
- **Account deletion / GDPR data export** — Sprint 1+ (compliance task)
- **Password change в profile** — частично в 19d (`account.astro`
  set/change password), полный flow с current-password confirmation
  — small follow-up

## Critical files

Backend:
- `wrangler.toml` (secrets references)
- `src/lib/server/{password,jwt,session,hash,turnstile,ratelimit,audit,oauth,user-ops,email}.ts`
- `src/lib/server/oauth/{google,discord}.ts`
- `src/pages/api/auth/**.ts` (≈ 13 endpoints)
- `src/middleware.ts` (JWT verification для /api/* кроме /api/auth)
- `db/types.ts` (JWT payload type + расширения)

Frontend:
- `src/pages/[locale]/{login,register,account,verify-email-pending,password-reset}.astro`
- `src/components/public/{TurnstileWidget,OAuthButton,LoginForm,RegisterForm}.astro`
- `src/lib/i18n/dict.{en,ru}.ts` (UI-строки — после Stage 7) или inline
- `src/styles/utilities.css` (новый `.form` блок если нет)

Config:
- `.dev.vars` (local secrets, gitignored)
- Production secrets через `wrangler pages secret put`

## Dependencies

- **Stage 18** — D1 + auth schema (users, auth_methods,
  auth_sessions, audit_log + KV namespaces)
- **Stage 7** (рекомендуется) — i18n dict; иначе UI-строки inline
- **`jose`** npm package — JWKS verification для Google id_token
- **CF Turnstile site** уже создан и Site Key известен

## Reference

- `~/git/301/src/api/auth/**` — reference implementation на Hono
  (берём паттерны, портируем под native Astro)
- `decisions_archive.md` 2026-05-12 — auth model rationale
- `docs/Architecture.md` §9 (v0.8.2) — D1 schema
- OAuth 2.0 + PKCE: RFC 7636
- OWASP ASVS 2023 — Authentication requirements
- developer.mozilla.org Web Crypto API — PBKDF2
