/// <reference types="astro/client" />

// `Env` declared globally в worker-configuration.d.ts (включён в
// tsconfig.json -> include). Триggle-slash path reference не нужен.

type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

declare namespace App {
  // Сейчас Locals = Runtime; middleware будет дополнять
  // (user, session) через declaration merging — поэтому interface,
  // а не type alias.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Locals extends Runtime {}
}

// Augment auto-generated Cloudflare.Env с secrets — wrangler types
// подхватывает только bindings (D1/KV/R2/etc), но НЕ secrets из
// `wrangler pages secret put` / `.dev.vars`. Эти декларации
// мерджатся с worker-configuration.d.ts через namespace merging.
// Production secrets — wrangler pages secret list.
// Local mirror — .dev.vars (gitignored).
declare namespace Cloudflare {
  interface Env {
    // === Crypto / hashing — required для auth-libs ===
    MASTER_SECRET: string;    // AES-GCM key для шифрования jwt_keys.secret_encrypted
    IP_HASH_SALT: string;     // salt для sha256(ip) → auth_sessions.ip_hash + audit_log.ip_hash

    // === OAuth credentials — optional до завершения setup'a apps ===
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    DISCORD_CLIENT_ID?: string;
    DISCORD_CLIENT_SECRET?: string;

    // === Cloudflare Turnstile — anti-bot на login/register формах ===
    TURNSTILE_SITE_KEY?: string;   // public, рендерится в HTML <div data-sitekey>
    TURNSTILE_SECRET?: string;     // server-side siteverify

    // === Resend — transactional email (verify links, password reset) ===
    RESEND_API_KEY?: string;       // Bearer для api.resend.com/emails

    // === Payment provider (Stage 14) — Lemon Squeezy / Paddle / Mock ===
    PAYMENT_PROVIDER?: "mock" | "lemonsqueezy" | "paddle";  // default: 'mock'
    LEMONSQUEEZY_API_KEY?: string;       // Stage 14.5
    LEMONSQUEEZY_STORE_ID?: string;
    LEMONSQUEEZY_WEBHOOK_SECRET?: string;

    // === R2 S3-compatible API (Student LK v2 Stage C) — pre-signed URLs ===
    // Worker Free plan имеет 10ms CPU per request → upload через worker
    // proxy не работает. Pre-signed URL pattern: client → R2 напрямую.
    // Account ID + access keys через `wrangler pages secret put`. Локально
    // — .dev.vars (gitignored). R2_HOMEWORK_BUCKET — в [vars] (public).
    R2_ACCOUNT_ID?: string;
    R2_ACCESS_KEY_ID?: string;
    R2_SECRET_ACCESS_KEY?: string;
  }
}
