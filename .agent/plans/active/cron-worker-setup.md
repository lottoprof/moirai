# Cron Worker setup

> Status: active. Не блокер production'а, но обязателен прежде
> чем instructor-digest начнёт реально отправляться.
>
> Контекст: batch2 (`instructor-lk-v2-batch2.md`) задеплоил
> instructor-digest код, но никакой trigger его не вызывает.
> CF Pages не поддерживает [triggers] cron нативно — нужен
> отдельный CF Worker.
>
> Free tier: 5 cron triggers per account. Используем 1 → 4 запас.

## Spec

**Структура:**

```
cron-worker/
  wrangler.toml
  src/index.ts
```

### wrangler.toml

```toml
name = "moirai-cron"
main = "src/index.ts"
compatibility_date = "2026-05-01"
workers_dev = false

[vars]
PAGES_BASE_URL = "https://moiraionline.pro"

[triggers]
crons = ["*/15 * * * *"]
```

### src/index.ts

```typescript
export interface Env {
  PAGES_BASE_URL: string;
  CRON_SECRET: string;
}

export default {
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const now = new Date(event.scheduledTime);
    const hr = now.getUTCHours();
    const min = now.getUTCMinutes();

    // Каждые 15 мин: auto-approve
    ctx.waitUntil(callJob(env, "auto-approve"));

    // Daily jobs на минуте 0 каждого нужного часа (UTC)
    if (min === 0) {
      if (hr === 3)  ctx.waitUntil(callJob(env, "retention"));
      if (hr === 4)  ctx.waitUntil(callJob(env, "pre-archive-email"));
      if (hr === 5)  ctx.waitUntil(callJob(env, "orphan-cleanup"));
      if (hr === 13) ctx.waitUntil(callJob(env, "instructor-digest"));
    }
  },
};

async function callJob(env: Env, job: string): Promise<void> {
  const url = `${env.PAGES_BASE_URL}/api/internal/cron/run?job=${encodeURIComponent(job)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
  });
  if (!res.ok) {
    console.error(`[cron-worker] job=${job} status=${res.status} body=${await res.text()}`);
  }
}
```

## Deploy

```bash
source ~/.nvm/nvm.sh && nvm use 22

# 1. Set secret (то же значение что Pages secret CRON_SECRET)
pnpm exec wrangler secret put CRON_SECRET --config cron-worker/wrangler.toml

# 2. Deploy worker
pnpm exec wrangler deploy --config cron-worker/wrangler.toml
```

## Verification

- `wrangler tail --config cron-worker/wrangler.toml` — следить логи
- Manual force одного job через `wrangler dev` или curl:
  ```bash
  curl -X POST "https://moiraionline.pro/api/internal/cron/run?job=auto-approve" \
    -H "Authorization: Bearer $CRON_SECRET"
  ```
- Через 15 мин после deploy — auto-approve должен показать
  тики в `wrangler pages deployment tail --project-name moirai`.

## CF Free tier sanity

- Cron triggers used: 1 / 5
- Worker invocations: ~96/day (4×24 = 96 ticks).
  Free tier: 100k/day → 0.1% — overspending не грозит.
- Outbound HTTP per tick: 1 (POST на Pages) → ~96/day.

## References

- https://developers.cloudflare.com/workers/platform/limits/ — 5 cron
  triggers per account на Free.
- https://developers.cloudflare.com/pages/functions/wrangler-configuration/
  — подтверждение что Pages Functions не поддерживают [triggers].
- `instructor-lk-v2-batch2.md` (done/) — батч который ввёл
  instructor-digest job но не настроил trigger.

## Lifecycle

После S1 (deploy worker + verify) — `git mv active/cron-worker-setup.md
done/`.
