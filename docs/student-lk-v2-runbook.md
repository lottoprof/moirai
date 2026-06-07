# Student LK v2 — Production Rollout Runbook

> Spec: `docs/student-lk-v2-spec.md`.
> Status: код готов в локальной ветке (40+ коммитов). НЕ задеплоен в продакшен.
> Требуется explicit "go" от owner перед каждой стадией ниже.

## 0. Pre-deploy checklist

- [ ] Backup production D1: `pnpm wrangler d1 export moirai-prod --output=backup-pre-lk-v2-$(date +%F).sql --remote`
- [ ] Verify нет concurrent другой работы в репозитории.
- [ ] Owner authorized деплой (per CLAUDE.md auto-mode rules).

## 1. CF infrastructure setup

### R2 bucket для homework

```bash
pnpm wrangler r2 bucket create moirai-homework
```

### R2 access keys для pre-signed URLs

В CF dashboard → R2 → "Manage R2 API Tokens" → создать token с
read+write permissions на `moirai-homework` bucket.

```bash
pnpm wrangler pages secret put R2_ACCOUNT_ID
# value: ваш CF account ID
pnpm wrangler pages secret put R2_ACCESS_KEY_ID
# value: token access key
pnpm wrangler pages secret put R2_SECRET_ACCESS_KEY
# value: token secret
```

### Cron secret

```bash
# Generate
openssl rand -hex 32

# Set
pnpm wrangler pages secret put CRON_SECRET
# value: hex string выше
```

### Email Routing (опционально для reply-to handling)

В CF dashboard → Email → Email Routing → Add address:
- `feedback@moiraionline.pro` → forward на preпод inbox
- `noreply@moiraionline.pro` → blackhole

## 2. D1 migrations + data backfill

```bash
# 1. Apply migrations (в правильном порядке — 0013 НЕ в migrations dir,
#    runs через скрипт после M3)
pnpm wrangler d1 migrations apply moirai-prod --remote

# 2. Data migration: split body → presentation + workbook
node scripts/migrate-modules-bodies.mjs --remote

# 3. Cohort modules snapshot backfill
node scripts/backfill-cohort-modules-snapshot.mjs --remote

# 4. Sessions backfill для active cohorts
node scripts/backfill-sessions.mjs --remote

# 5. Cleanup old columns (DROP body_r2_key + homework_md ПОСЛЕ verify M3)
node scripts/apply-modules-cleanup.mjs --remote

# 6. Verify
pnpm wrangler d1 execute moirai-prod --remote --command \
  "SELECT COUNT(*) FROM modules WHERE workbook_r2_key IS NULL;"
# Должно быть 0
```

## 3. Deploy code

```bash
# Run release script (build + deploy via wrangler pages deploy)
pnpm release
```

Production preview URL появится в выводе.

## 4. Smoke test

- [ ] `/en/` home рендерится
- [ ] `/en/login` работает
- [ ] Test student login → `/dashboard` paid view → drawer работает
- [ ] Module page рендерится с workbook content
- [ ] Open `/dashboard/modules/[slug]/present` — presentation mode
- [ ] Upload homework (mock account)
- [ ] Instructor login → `/instructor` real data → `/instructor/homework/[id]` review
- [ ] `/account` → notifications toggle + Delete section (do NOT confirm)

## 5. Cron scheduler setup

Cron triggers вызывают `POST /api/internal/cron/run?job=<name>` с Bearer header.

Варианты:

### Option A: External worker
Отдельный worker с `[triggers]` cron config, делает fetch к нашему endpoint:

```js
// separate cron-worker
export default {
  async scheduled(event, env) {
    const job = pickJobByCron(event.cron);
    await fetch('https://moiraionline.pro/api/internal/cron/run?job=' + job, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
    });
  },
};
```

```toml
# wrangler.toml для cron-worker
[triggers]
crons = [
  "*/15 * * * *",   # auto-approve
  "0 3 * * *",      # retention
  "0 4 * * *",      # pre-archive-email
  "0 5 * * *",      # orphan-cleanup
]
```

### Option B: External service (cron-job.org, GitHub Actions schedule)
Без worker — внешний scheduler делает POST с Authorization header.

## 6. Post-deploy monitoring

- `wrangler tail moirai` — стримит logs в реальном времени.
- Resend dashboard — delivery rate для feedback emails.
- CF Pages analytics — request volume + errors.

## 7. Rollback procedure (если что-то сломалось)

```bash
# 1. Restore D1 from backup
pnpm wrangler d1 execute moirai-prod --remote --file=backup-pre-lk-v2-YYYY-MM-DD.sql

# 2. Revert deploy (CF Pages → Previous deployment → "Restore")
```

## 8. Known limitations

- E6 ModuleTabs (Presentation / Workbook / Homework split) отложен —
  workbook content рендерится single page на module page (с homework
  inline снизу). Запланирован в follow-up.
- Vimeo embeds, Browser push, Slide-by-slide presentation, Light theme —
  Future migrations (см. spec § 10).
- Cron triggers нужны external scheduler — CF Pages adapter не имеет
  native [triggers] support в current version.
