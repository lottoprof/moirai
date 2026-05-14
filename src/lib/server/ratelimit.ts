/*
 * Rate-limit через KV counter с fixed-window TTL.
 *
 * Использование (Stage 19 endpoints):
 *   const ok = await checkRateLimit(env, `auth:register:ip:${ip}`,
 *     { max: 5, windowSec: 3600 });
 *   if (!ok.allowed) return new Response("Too Many Requests", { status: 429 });
 *
 * Замечание о точности:
 *   KV — eventually consistent. Параллельные запросы внутри секунды
 *   могут все прочитать одинаковый count и увеличиться сверх max.
 *   Это допустимый overshoot для anti-abuse (атакующий не получит
 *   преимущества); для строгого atomic counting — отдельный stage
 *   с D1 + UPDATE ... WHERE counter < max RETURNING.
 *
 * TTL стратегия: fixed-window — счётчик живёт `windowSec` от первого
 * вызова, потом сбрасывается. Sliding-window требует array-метки
 * времени, сложнее, не нужно для текущих лимитов.
 */

const KEY_PREFIX = "rl:";

export interface RateLimitConfig {
  max: number;
  windowSec: number;
}

export interface RateLimitResult {
  allowed: boolean;
  current: number;
  max: number;
  remaining: number;
  /** Сколько секунд до сброса окна. Approximate (TTL читается из KV). */
  resetInSec: number;
}

/**
 * Проверить и увеличить счётчик. Возвращает результат всегда —
 * даже когда лимит исчерпан (allowed=false), но `current` не увеличивается
 * за лимит (защита от перерасхода TTL renew).
 */
export async function checkRateLimit(
  env: Cloudflare.Env,
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const fullKey = `${KEY_PREFIX}${key}`;

  const raw = await env.KV_RATELIMIT.get(fullKey);
  const current = raw ? Number.parseInt(raw, 10) : 0;
  const safeCurrent = Number.isFinite(current) && current >= 0 ? current : 0;

  if (safeCurrent >= config.max) {
    return {
      allowed: false,
      current: safeCurrent,
      max: config.max,
      remaining: 0,
      resetInSec: config.windowSec,
    };
  }

  const next = safeCurrent + 1;
  // expirationTtl ставим только если это первая запись окна — иначе
  // продлевали бы окно бесконечно при активности. KV не даёт читать
  // оставшийся TTL, поэтому проверяем через raw=null.
  await env.KV_RATELIMIT.put(fullKey, next.toString(), {
    expirationTtl: raw === null ? config.windowSec : undefined,
  });

  return {
    allowed: true,
    current: next,
    max: config.max,
    remaining: config.max - next,
    resetInSec: config.windowSec,
  };
}

/**
 * Готовые preset'ы для auth endpoints. Используем в register.ts, login.ts
 * и т.п.
 */
export const RATE_LIMITS = {
  registerByIp:    { max: 5,  windowSec: 3600 },   // 5 register / IP / час
  registerByEmail: { max: 3,  windowSec: 3600 },   // 3 register / email / час
  loginByIp:       { max: 20, windowSec: 3600 },   // 20 login attempts / IP / час
  loginByEmail:    { max: 10, windowSec: 3600 },   // 10 login / email / час
  resetByEmail:    { max: 3,  windowSec: 3600 },   // 3 reset / email / час
  oauthByIp:       { max: 30, windowSec: 3600 },   // 30 OAuth flows / IP / час
} as const satisfies Record<string, RateLimitConfig>;
