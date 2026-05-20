# Stage 14 — Apply flow + Checkout + Magic-link

**Spec source**: `docs/apply-flow-spec.md` (FLOW-1..31, 53/53 вопроса закрыты)

## Контекст

Реализация полного Apply → Dashboard → Checkout → Paid flow согласно
зафиксированной спеке. После Stage 14 главная конверсионная воронка
работает end-to-end: клиент видит сетку cohorts → выбирает → даёт email →
попадает в дашборд → ставит пароль → оплачивает → получает доступ.

Это **большой stage** — разбит на 7 фаз (A-G), внутри каждой — sub-шаги
с обязательным коммитом. Минимальный MVP для запуска первой оплаты —
фазы A-E. Фазы F (admin/instructor views) и G (полировка) могут
шипиться инкрементально.

## Зависимости / pre-flight

- ✅ Spec закрыта (`docs/apply-flow-spec.md`)
- ✅ Legal docs ready (privacy/terms/refund/cookies) — для checkout consent
- ✅ Programmes + cohorts data model готов в `apply-flow-spec.md` §I
- ⏳ **Внешние** — нужны до начала фазы D:
  - Stripe аккаунт (test mode для разработки + live для prod)
  - Stripe API keys → `wrangler pages secret put STRIPE_SECRET_KEY` (test+live)
  - Stripe webhook endpoint registered → `STRIPE_WEBHOOK_SECRET`
  - Resend API key уже есть (`RESEND_API_KEY`) — для transactional email

## Фазы и этапы

### Фаза A — Data foundation

- [ ] **14a** — Migration `0009_apply_flow.sql`:
  - `slots` (id, programme_id, days_json TEXT, time_et TEXT, instructor_id, max_students, active INTEGER, created_at, updated_at)
  - `cohorts` (id, programme_id, slot_id, start_date INTEGER, end_date INTEGER, status TEXT, apply_count INTEGER DEFAULT 0, paid_count INTEGER DEFAULT 0)
  - `applications` (id, user_id, programme_id, cohort_id, status TEXT, country TEXT, marketing_opt_in INTEGER, age_confirmed INTEGER, created_at, updated_at)
  - `users.marketing_opt_in INTEGER DEFAULT 0` ALTER
  - Indexes на FK + (cohort_id, status) + (user_id, programme_id) для дублей
  - Triggers: updated_at auto-touch, status_change → audit_log INSERT
- [ ] **14b** — `db/types.ts` — TS interfaces: `SlotRow`, `CohortRow`, `ApplicationRow`; обновить `UserRow` с marketing_opt_in
- [ ] **14c** — `src/lib/server/applications.ts` — helpers: findApplicationByUserProgramme, createApplication, transferApplication, cancelApplication, expireApplication
- [ ] **14d** — `src/lib/server/cohorts.ts` — helpers: listActiveCohorts (с filters), getCohortDetail, computeDurationWeeks (FLOW-8), publishUpcomingCohorts (auto-publish horizon)

### Фаза B — Slots & cohorts content

- [ ] **14e** — `scripts/seed-slots.mjs` — seed для initial slot configuration: 4 slots на старт (Beginner Mon+Thu morning/evening, Tue+Fri morning/evening). Idempotent.
- [ ] **14f** — `scripts/publish-cohorts.mjs` — генерит cohorts на 12 месяцев вперёд из active slots. Запускается вручную при первом deploy + по cron когда настроим. Idempotent (skip если cohort с такой start_date уже существует).

### Фаза C — Public Apply flow UI

- [ ] **14g** — `/[locale]/apply/index.astro` (SSR):
  - Hero: "Choose your slot"
  - Filters bar (programme chips · day_pair · time_of_day · period)
  - List view сгруппированный по programme (FLOW-12)
  - Каждый slot card: programme · days+time · start/end dates · hybrid spot count (FLOW-13) · "1:1 at group price" бейдж при ≤2 (FLOW-11)
  - Filter unpublished programmes (FLOW-29)
  - Click → /apply/contact?cohort=<id>
- [ ] **14h** — `/[locale]/apply/contact.astro` (SSR):
  - Cohort summary (выбранный slot)
  - Form: email (req) + name (req) + country (auto-detect IP, optional readonly) + Turnstile (req)
  - POST /api/apply
- [ ] **14i** — `POST /api/apply.ts`:
  - Verify Turnstile
  - Rate-limit (по IP)
  - Resolve duplicate logic (FLOW-25): existing user lookup → check active applications
  - INSERT user (if new) + INSERT application(status='awaiting_payment')
  - `createRefreshSession()` mode='remember' (FLOW-16, длительный TTL для Apply)
  - Send welcome email (Resend) с magic-link save-point
  - audit_log event='apply_submitted'
  - Response: { redirect: '/dashboard?welcome=1' }
- [ ] **14j** — Dashboard pre-payment update (`src/pages/[locale]/dashboard/index.astro`):
  - Прочитать application через `findApplicationByUser`
  - Если awaiting_payment → отдельный pre-payment вид: application summary + countdown до start_date + curriculum teaser (locked modules) + "Pay now" CTA → /checkout
  - Если paid → текущий dashboard (Stage 20 stub → реальные модули в Sprint 1)
  - Welcome banner если `?welcome=1` в URL (dismissible)
  - Banner про опциональный пароль (FLOW-17)

### Фаза D — Checkout & payment

- [ ] **14k** — `/[locale]/checkout.astro` (SSR):
  - Auth-guard: redirect /login если нет session, redirect /apply если нет awaiting_payment application
  - Order summary (programme, cohort, amount)
  - Password fields (req, validated через validatePasswordStrength)
  - Terms+Refund+Privacy чекбокс (req)
  - Marketing opt-in чекбокс (optional, UNCHECKED)
  - Age ≥18 чекбокс (req)
  - Pay button — disabled пока req не выполнены
  - Submit → POST /api/checkout/initiate
- [ ] **14l** — `POST /api/checkout/initiate.ts`:
  - Verify Turnstile + rate-limit
  - Set password (hashPassword + INSERT auth_methods)
  - Save marketing_opt_in + age_confirmed на user/application
  - Создать Stripe Checkout Session (mode=payment, success_url, cancel_url)
  - Response: { url: stripe_url } → клиент redirected to Stripe
- [ ] **14m** — `POST /api/stripe/webhook.ts`:
  - Verify Stripe signature
  - Handle `checkout.session.completed`:
    - Найти application по metadata
    - Application.status='paid'
    - INSERT enrollment (paid snapshot)
    - audit_log event='offer_accepted' с полным metadata (FLOW-2/E5: terms_version, refund_version, privacy_version, payment_id, amount, currency)
    - audit_log event='application_status_changed'
    - Send confirmation email (FLOW-23)
  - Handle `checkout.session.async_payment_failed` / expired — log
- [ ] **14n** — `GET /[locale]/checkout/success.astro`:
  - Простая success page: "Thank you. Your enrollment is confirmed."
  - Link → /dashboard

### Фаза E — Auth additions

- [ ] **14o** — Magic-link infrastructure:
  - `POST /api/auth/magic-link/request.ts` — email lookup → generate token in KV_VERIFY_TOKENS (TTL 30 мин) → send email
  - `GET /api/auth/magic-link/confirm.ts?token=...` — validate token → createRefreshSession → redirect /dashboard
- [ ] **14p** — `/[locale]/login.astro` UI update:
  - Кнопка "Email me a sign-in link" под основной формой (FLOW-19)
  - На submit → /api/auth/magic-link/request → "Check your inbox" notice

### Фаза F — Admin/Instructor views (можно отложить если MVP горит)

- [ ] **14q** — `/admin/applications.astro` (FLOW-20):
  - Tabs со счётчиками (awaiting_payment / paid / running / cancelled / expired / refunded)
  - Filters: programme, cohort, status, date range, search by email
  - Table: email · programme · cohort · status · applied · amount · actions
  - Row drawer: full info + audit log timeline
  - Row actions: contact (mailto) · transfer (modal с cohort picker) · cancel (с reason) · trigger refund (по FLOW-9a)
  - Bulk: cancel multiple + export CSV
- [ ] **14r** — `/[locale]/instructor/` секция "My cohorts" (FLOW-21):
  - "My upcoming cohorts" — query cohorts WHERE instructor_id=current AND status='forming'
  - "My active cohorts" — status='running'
  - Click → cohort detail page (отдельный roite или drawer)

### Фаза G — Edge cases & operational polish

- [ ] **14s** — Refund processing endpoint:
  - `POST /api/admin/applications/:id/refund` (admin-only)
  - Вычисляет refund window (100/50/credit/none) по datetime
  - Stripe refund call + audit_log event='refund_processed'
  - application.status='refunded'
- [ ] **14t** — Cohort expire automation:
  - Cron / scheduled task: при `now > cohort.start_date` + applications в `awaiting_payment` → mark expired + email клиенту
  - До настройки cron — manual через admin action
- [ ] **14u** — Email templates (Resend):
  - `welcome.{en,ru}` — после Apply, с magic-link
  - `payment-confirmation.{en,ru}` — после webhook success
  - `application-expired.{en,ru}` — когда cohort стартует без оплаты
  - `refund-processed.{en,ru}` — после refund
- [ ] **14v** — Smoke tests (Playwright):
  - End-to-end: open /apply → pick slot → submit contact → dashboard → checkout → Stripe test card → success → dashboard paid
  - Edge: duplicate apply same cohort (expect reject), apply 2nd programme (expect allowed)
  - Magic-link: logout → /login → "Email me link" → simulate token from KV → verify session created

## Тестовые карты Stripe

Для разработки и smoke:

- `4242 4242 4242 4242` — success any CVC any future date
- `4000 0025 0000 3155` — 3DS challenge
- `4000 0000 0000 9995` — declined
- См. https://stripe.com/docs/testing

## Verification

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm build

# Локальный preview через wrangler pages dev dist
# Применить миграции на local D1 + apply seed
corepack pnpm exec wrangler d1 migrations apply moirai-prod --local
node scripts/seed-slots.mjs --local
node scripts/publish-cohorts.mjs --local

# E2E через Playwright против локального preview
```

После 14a-p (MVP) → deploy + apply migrations на prod + публикация cohorts.

## Не входит в Stage 14

- **Live cohort sessions** (Vidstack player, Zoom integration) — Sprint 1+
- **Homework submissions UI** — Sprint 1+
- **Module unlock logic** для paid dashboard — Sprint 1+
- **Instructor cohort detail page** со списком студентов — Sprint 2
- **Cohort auto-publish cron** — manual run в Sprint 1, cron Sprint 2
- **Admin LK для редактирования slots/cohorts** — Sprint 2 (FLOW-10)
- **Discovery-call flow** для truly individual programmes (FLOW-28) — Sprint 2+
- **A/B testing checkout copy** — Sprint 3+
- **Reminder emails** (cohort starts in 7 days) — Sprint 2
- **Instructor email notifications** — Sprint 2
- **Cohort merge UI** (FLOW-11) — Sprint 2

## Critical files (создание / правка)

```
migrations/0009_apply_flow.sql                       создать
db/types.ts                                          + 3 interface
src/lib/server/applications.ts                       создать
src/lib/server/cohorts.ts                            создать
src/lib/server/stripe.ts                             создать (init client, helpers)
src/lib/server/email-templates.ts                    создать (Resend templates)
scripts/seed-slots.mjs                               создать
scripts/publish-cohorts.mjs                          создать
src/pages/[locale]/apply/index.astro                 создать
src/pages/[locale]/apply/contact.astro               создать
src/pages/[locale]/checkout.astro                    создать
src/pages/[locale]/checkout/success.astro            создать
src/pages/[locale]/dashboard/index.astro             правка (pre-payment view)
src/pages/[locale]/login.astro                       правка (magic-link button)
src/pages/api/apply.ts                               создать
src/pages/api/checkout/initiate.ts                   создать
src/pages/api/stripe/webhook.ts                      создать
src/pages/api/auth/magic-link/request.ts             создать
src/pages/api/auth/magic-link/confirm.ts             создать
src/pages/admin/applications.astro                   создать (фаза F)
src/components/admin/ApplicationRow.astro            создать
src/components/admin/ApplicationDrawer.astro         создать
src/components/public/SlotCard.astro                 создать
src/components/public/SlotFilters.astro              создать
src/components/public/CountdownBadge.astro           создать
src/components/dashboard/PrePaymentView.astro        создать
src/components/instructor/MyCohortsSection.astro     создать (фаза F)
wrangler.toml                                        + STRIPE_* secrets refs
.dev.vars                                            + STRIPE_SECRET_KEY (gitignored)
```

## Reference

- `docs/apply-flow-spec.md` — спека (источник истины для всех решений)
- `src/lib/server/session.ts` — auth pattern для magic-link reuse
- `src/pages/api/auth/password-reset/request.ts` — template для magic-link
- `src/lib/server/audit.ts` — logAuth для apply-events
- https://stripe.com/docs/payments/checkout — Stripe Checkout integration
- https://stripe.com/docs/webhooks — webhook signature verification
- https://resend.com/docs — Resend API для email templates
