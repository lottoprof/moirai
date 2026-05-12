# Sprint 0 Stage 14 — Apply form + AI waitlist form

> **⏸ DEFERRED (2026-05-12).** После решения "Auth-first": клиент
> сначала проходит регистрацию (Stage 19) перед любым CTA. "Apply"
> может либо стать post-login flow (короткая форма выбора программы +
> тира на стороне already-authenticated user), либо быть полностью
> заменена баннером с переходом на отдельный сайт со своей D1
> (отдельный leadgen-pipeline). Решение по этому stage откладывается
> до завершения Stages 11/18/19. AI waitlist аналогично — может стать
> баннером с редиректом, либо post-login subscription. Текст плана
> ниже описывает ОРИГИНАЛЬНЫЙ план (D1 applications table) — его
> части могут быть переиспользованы, либо план перепишется полностью.

## Context

Главная и programme pages имеют 3 CTA-точки, ведущие на формы:

- **Apply** — `/{locale}/apply` (Hero CTA, Nav CTA, FinalCta CTA,
  TierCard CTA на programme pages с query params `?programme=...&tier=...`)
- **AI waitlist** — `/{locale}/ai-module-waitlist` (AiModule CTA)

Все эти URL сейчас отдают 404. Stage 14 создаёт обе формы + back-end
для сохранения заявок.

## Архитектурное решение про backend

Три варианта обработки submitted form:

| | Storage | Pros | Cons |
|---|---|---|---|
| **A** | **D1 таблица `applications`** | Структурированные данные, фильтр/экспорт, скейлится | Требует setup D1 миграции, биндинга, секрета для admin reader |
| **B** | **KV** (`KV_APPLICATIONS`) | Простейшее, mostly write-only | Не подходит для админ-таблицы, плохой query |
| **C** | **Email-only** (через transactional service: Resend / Postmark / CF Email Workers) | Нулевой storage setup | Зависимость от внешнего сервиса, нет аудита, lost-if-bounce |

**Рекомендация: A (D1).** Согласуется с Architecture v0.8.1 (D1 как
основное хранилище), даёт админу admin-панель в будущем, бесплатный
до 100k writes/day. Один секрет (CF API token уже есть для тулинга).

Альтернатива на сейчас: **A + C** — пишем в D1 + дополнительно
отправляем notification email ownership через Resend (когда настроим).

## Этапы

### 14a — D1 setup (one-time)

```bash
# Создаём БД (один раз)
corepack pnpm exec wrangler d1 create moirai-prod

# Wrangler покажет database_id; вставить в wrangler.toml:
# [[d1_databases]]
# binding = "DB"
# database_name = "moirai-prod"
# database_id = "<uuid>"
# migrations_dir = "migrations"

# Сгенерить типы биндингов
corepack pnpm exec wrangler types
```

### 14b — миграция `applications` таблицы

`migrations/0001_applications.sql`:

```sql
CREATE TABLE applications (
  id TEXT PRIMARY KEY,                          -- nanoid / ulid
  type TEXT NOT NULL CHECK(type IN ('apply', 'ai_waitlist')),
  locale TEXT NOT NULL CHECK(locale IN ('en','ru')),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  programme TEXT,                               -- beginner / intermediate, NULL для ai_waitlist
  tier TEXT,                                    -- self-paced / live / premium, NULL если не выбрано
  message TEXT,
  source_url TEXT,                              -- откуда пришёл submit (для аналитики воронки)
  user_agent TEXT,                              -- для debugging
  created_at INTEGER NOT NULL,                  -- unix seconds
  status TEXT NOT NULL DEFAULT 'new'
    CHECK(status IN ('new','contacted','accepted','rejected','duplicate'))
);
CREATE INDEX idx_applications_created ON applications(created_at DESC);
CREATE INDEX idx_applications_type ON applications(type, created_at DESC);
CREATE INDEX idx_applications_email ON applications(email);
```

Применить локально + remote:

```bash
corepack pnpm exec wrangler d1 migrations apply moirai-prod --local
corepack pnpm exec wrangler d1 migrations apply moirai-prod --remote   # требует подтверждения
```

### 14c — TS-типы D1 (manual, без ORM)

`db/types.ts` (top-level):

```ts
export interface ApplicationRow {
  id: string;
  type: "apply" | "ai_waitlist";
  locale: "en" | "ru";
  name: string;
  email: string;
  programme: string | null;
  tier: string | null;
  message: string | null;
  source_url: string | null;
  user_agent: string | null;
  created_at: number;
  status: "new" | "contacted" | "accepted" | "rejected" | "duplicate";
}
```

### 14d — server endpoint

`src/pages/api/applications.ts` (Astro SSR endpoint, no prerender):

```ts
import type { APIRoute } from "astro";
import type { ApplicationRow } from "../../../db/types";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const ct = request.headers.get("content-type") || "";

  // Принимаем как form-urlencoded (no-JS submit) так и JSON (JS-enhanced)
  let data: Record<string, string>;
  if (ct.includes("application/json")) {
    data = await request.json();
  } else {
    const fd = await request.formData();
    data = Object.fromEntries(fd) as Record<string, string>;
  }

  // Валидация (zod на сервере)
  const parsed = applicationSchema.safeParse(data);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "invalid", issues: parsed.error.issues }), {
      status: 400, headers: { "Content-Type": "application/json" }
    });
  }

  const row: ApplicationRow = {
    id: crypto.randomUUID(),
    type: parsed.data.type,
    locale: parsed.data.locale,
    name: parsed.data.name,
    email: parsed.data.email,
    programme: parsed.data.programme ?? null,
    tier: parsed.data.tier ?? null,
    message: parsed.data.message ?? null,
    source_url: parsed.data.source_url ?? null,
    user_agent: request.headers.get("user-agent"),
    created_at: Math.floor(Date.now() / 1000),
    status: "new",
  };

  await env.DB.prepare(
    `INSERT INTO applications (id, type, locale, name, email, programme, tier, message, source_url, user_agent, created_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    row.id, row.type, row.locale, row.name, row.email,
    row.programme, row.tier, row.message, row.source_url, row.user_agent,
    row.created_at, row.status
  ).run();

  // Optionally: trigger email notification — Stage 14f
  // ctx.waitUntil(sendNotificationEmail(env, row));

  // Redirect to thank-you page для no-JS форм; JS-enhanced — return JSON
  if (ct.includes("application/json")) {
    return new Response(JSON.stringify({ ok: true, id: row.id }), { status: 200 });
  }
  return new Response(null, {
    status: 303,
    headers: { Location: `/${row.locale}/thanks?type=${row.type}` }
  });
};
```

### 14e — формы (apply + waitlist)

`src/pages/[locale]/apply.astro`:

```astro
---
import Layout from "../../layouts/public/Layout.astro";
import Btn from "../../components/public/Btn.astro";
export const prerender = true;
export function getStaticPaths() {
  return [{ params: { locale: "en" } }, { params: { locale: "ru" } }];
}
const { locale } = Astro.params;
const url = new URL(Astro.request.url);
const programmePrefill = url.searchParams.get("programme") ?? "";
const tierPrefill = url.searchParams.get("tier") ?? "";
// SEO + dictionary lookup ...
---

<Layout locale={locale} seo={{...}}>
  <section class="section center">
    <header class="section__head">
      <p class="eyebrow">{t.apply.eyebrow}</p>
      <h1 class="h1">{t.apply.title}</h1>
      <p class="text-muted">{t.apply.lede}</p>
    </header>

    <form method="POST" action="/api/applications" class="form">
      <input type="hidden" name="type" value="apply" />
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="source_url" value={url.pathname + url.search} />

      <label class="form__field">
        <span>{t.apply.fields.name}</span>
        <input type="text" name="name" required minlength="2" />
      </label>

      <label class="form__field">
        <span>{t.apply.fields.email}</span>
        <input type="email" name="email" required />
      </label>

      <label class="form__field">
        <span>{t.apply.fields.programme}</span>
        <select name="programme" required>
          <option value="">{t.apply.fields.programmePlaceholder}</option>
          <option value="beginner" selected={programmePrefill === "beginner"}>Beginner</option>
          <option value="intermediate" selected={programmePrefill === "intermediate"}>Intermediate</option>
          <option value="undecided">{t.apply.fields.programmeUndecided}</option>
        </select>
      </label>

      <label class="form__field">
        <span>{t.apply.fields.tier}</span>
        <select name="tier">
          <option value="">{t.apply.fields.tierPlaceholder}</option>
          <option value="self-paced" selected={tierPrefill === "self-paced"}>Self-Paced</option>
          <option value="live" selected={tierPrefill === "live"}>Live Cohort</option>
          <option value="premium" selected={tierPrefill === "premium"}>Premium</option>
        </select>
      </label>

      <label class="form__field">
        <span>{t.apply.fields.message} <em>({t.common.optional})</em></span>
        <textarea name="message" rows="4" maxlength="2000"></textarea>
      </label>

      <Btn type="submit" variant="primary" size="xl" arrow>{t.apply.submit}</Btn>
    </form>
  </section>
</Layout>
```

`/{locale}/ai-module-waitlist.astro` — аналогично, упрощённая
форма (name + email, без programme/tier select), `type=ai_waitlist`.

### 14f — thank-you страница

`src/pages/[locale]/thanks.astro` — простая страница "Заявка
принята, мы свяжемся в течение 48 часов". Static, prerender.

### 14g — email notification (опционально, не блокирует)

`src/lib/server/notify.ts` — отправка через Resend API (или
аналог; решение про сервис — отдельно):

```ts
export async function sendNotificationEmail(env: Env, row: ApplicationRow) {
  if (!env.RESEND_API_KEY) return; // graceful no-op
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "applications@moiraionline.pro",
      to: ["ops@moiraionline.pro"],
      subject: `New application: ${row.name} (${row.programme ?? row.type})`,
      text: `Locale: ${row.locale}\nEmail: ${row.email}\nProgramme: ${row.programme ?? "-"}\nTier: ${row.tier ?? "-"}\nMessage: ${row.message ?? "-"}\n\nAdmin: https://...`
    })
  });
}
```

Secret `RESEND_API_KEY` через `wrangler pages secret put RESEND_API_KEY --project-name moirai`.

Email от `applications@moiraionline.pro` — требует DNS verification
на Resend dashboard (TXT/MX/DKIM records в зоне). Setup — внутри
этапа.

### 14h — verification

```bash
pnpm build
pnpm exec wrangler pages dev ./dist
# 1. Без JS: открыть /en/apply → заполнить → submit → 303 на /en/thanks
# 2. Локальная D1: `wrangler d1 execute moirai-prod --local --command="SELECT * FROM applications"`
#    → видна запись
# 3. С JS (fetch API): POST на /api/applications с JSON body → 200 JSON
# 4. Rate limit / spam — пока без; добавим если будет abuse
```

Production:
- Submit на проде → запись в remote D1
- `wrangler d1 execute moirai-prod --remote --command="SELECT id, email, programme, created_at FROM applications ORDER BY created_at DESC LIMIT 5"`
- Email notification приходит на ops@

## Verification

- [ ] `/en/apply`, `/ru/apply`, `/en/ai-module-waitlist`,
      `/ru/ai-module-waitlist` отдают 200 (не 404)
- [ ] `/en/thanks`, `/ru/thanks` отдают 200
- [ ] No-JS форма: submit → 303 redirect → запись в D1
- [ ] JS-enhanced (fetch): submit → 200 JSON → запись в D1
- [ ] D1 миграция применена локально и на remote
- [ ] `wrangler.toml` содержит `[[d1_databases]] binding = "DB"`
- [ ] `worker-configuration.d.ts` содержит `interface Env { DB: D1Database; ... }`
- [ ] Если 14g сделан — email notification приходит
- [ ] `pnpm lint && pnpm typecheck && pnpm build` зелёные

## Out of scope

- **Capture & rate-limit (CF Turnstile или native bot detection)** —
  добавим если будет abuse. Пока без — risk-low (low-volume site).
- **Real-time validation** в форме (Astro client island, debounced
  email check) — отказ: vanilla HTML5 валидация + browser hints
  достаточны.
- **Admin-панель** для просмотра applications — Sprint 1+ (отдельный
  `/admin/applications` route с auth).
- **CSV экспорт** — отдельная задача в admin.
- **Two-factor для админа** — Sprint 1+.

## Critical files

- `wrangler.toml` (биндинг DB)
- `migrations/0001_applications.sql` (новый)
- `db/types.ts` (новый)
- `src/pages/api/applications.ts` (новый, SSR endpoint)
- `src/pages/[locale]/apply.astro` (новый)
- `src/pages/[locale]/ai-module-waitlist.astro` (новый)
- `src/pages/[locale]/thanks.astro` (новый)
- `src/lib/server/notify.ts` (новый, опц.)
- `src/styles/utilities.css` (новый `.form`, `.form__field` блоки)

## Dependencies

- **Stage 7** (рекомендуется) — UI-строки форм идут в `dict.{locale}.ts`
- Архитектурное решение по backend — рекомендация: A (D1)

## Reference

- `docs/Architecture.md` §12 — D1 workflow, миграции
- `.agent/skills/wrangler/SKILL.md` § D1 — миграции
- `.agent/agents/schema.md` — миграция-агент
- `.agent/rules/security.md` — секреты, validation
