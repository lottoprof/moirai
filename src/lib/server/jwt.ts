/*
 * JWT sign/verify с rotation-ready key management.
 *
 * Иерархия (Architecture v0.8.3 §9, decisions_archive.md 2026-05-14):
 *
 *   env.MASTER_SECRET (wrangler secret)
 *     │
 *     │  AES-GCM encrypt/decrypt (crypto.ts)
 *     ▼
 *   jwt_keys.secret_encrypted (D1 row)
 *     │
 *     │  AES-GCM decrypt → 256-bit HS256 signing key
 *     ▼
 *   JWT (header: { alg: HS256, kid: "v1-YYYY-MM-DD-<uuid8>" })
 *
 * Состояния ключа:
 *   active     — единственный одновременно (БД enforce'ит UNIQUE WHERE
 *                status='active'). Подписывает новые JWT.
 *   deprecated — только verify (grace period для уже выданных токенов
 *                до их exp). Sign отвергает.
 *   revoked    — verify тоже отвергает. Все JWT с этим kid инвалидны.
 *
 * Auto-init: при первом запросе если active row нет — генерим, шифруем
 * MASTER_SECRET'ом, INSERT'им. Race condition — через KV-lock в
 * KV_CACHE. UNIQUE WHERE status='active' является backstop'ом если
 * lock не сработал.
 *
 * Cache: active key row кэшируется в KV_CACHE (TTL 5 мин) для
 * избегания D1 SELECT на каждый sign.
 *
 * Fingerprint: при подписи можем добавить fp claim (sha256(ip+ua))
 * для защиты от token theft — verifier проверит fp с текущим request'ом.
 */

import { SignJWT, jwtVerify } from "jose";
import { encrypt, decrypt, type Encrypted } from "./crypto";
import { createFingerprint, verifyFingerprint } from "./hash";
import type { JwtKeyRow, JwtKeyStatus } from "../../../db/types";

const DEFAULT_ACCESS_TTL = "15m";              // короткий, refresh — отдельно

const KEY_CACHE_KEY = "cache:jwt:active_key";
const KEY_CACHE_TTL_SECONDS = 300;             // 5 мин
const KEY_LOCK_KEY = "lock:jwt:key:creation";
const KEY_LOCK_TTL_SECONDS = 60;

const KEY_LIFETIME_SECONDS = 365 * 24 * 3600;  // 1 год от created_at до expires_at

/** Подписать access JWT активным ключом. Опционально включает fp claim. */
export async function signJWT(
  payload: Record<string, unknown>,
  env: Cloudflare.Env,
  options: {
    expiresIn?: string;
    fingerprint?: { ip: string; ua: string };
  } = {},
): Promise<string> {
  const keyRow = await ensureActiveKey(env);
  if (!keyRow) throw new Error("jwt: failed to obtain active signing key");

  const encryptedBlob = JSON.parse(keyRow.secret_encrypted) as Encrypted;
  const signingSecret = await decrypt<string>(encryptedBlob, env.MASTER_SECRET);
  const signingKey = new TextEncoder().encode(signingSecret);

  const claims = { ...payload };
  if (options.fingerprint) {
    claims.fp = await createFingerprint(
      options.fingerprint.ip,
      options.fingerprint.ua,
    );
  }

  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256", kid: keyRow.kid })
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? DEFAULT_ACCESS_TTL)
    .sign(signingKey);
}

/** Verify access JWT. Возвращает payload или null если invalid. */
export async function verifyJWT<T extends Record<string, unknown> = Record<string, unknown>>(
  token: string,
  env: Cloudflare.Env,
  options: {
    fingerprint?: { ip: string; ua: string };
  } = {},
): Promise<T | null> {
  // Распарсить header чтобы извлечь kid (jose требует key до verify)
  const dotIndex = token.indexOf(".");
  if (dotIndex <= 0) return null;
  let header: { alg?: string; kid?: string };
  try {
    header = JSON.parse(atob(token.slice(0, dotIndex))) as { alg?: string; kid?: string };
  } catch {
    return null;
  }
  if (header.alg !== "HS256" || !header.kid) return null;

  const keyRow = await getKeyByKid(header.kid, env);
  if (!keyRow) return null;
  if (keyRow.status === "revoked") return null;
  // status здесь — 'active' | 'deprecated', оба валидны для verify

  const encryptedBlob = JSON.parse(keyRow.secret_encrypted) as Encrypted;
  const signingSecret = await decrypt<string>(encryptedBlob, env.MASTER_SECRET);
  const signingKey = new TextEncoder().encode(signingSecret);

  let payload: Record<string, unknown>;
  try {
    const result = await jwtVerify(token, signingKey);
    payload = result.payload;
  } catch {
    return null;
  }

  if (options.fingerprint && typeof payload.fp === "string") {
    const ok = await verifyFingerprint(
      payload.fp,
      options.fingerprint.ip,
      options.fingerprint.ua,
    );
    if (!ok) return null;
  }

  return payload as T;
}

/**
 * Получить активный ключ — KV cache → D1 → (auto-init если нет).
 */
async function ensureActiveKey(env: Cloudflare.Env): Promise<JwtKeyRow | null> {
  // 1. KV cache hit
  const cached = await env.KV_CACHE.get(KEY_CACHE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached) as JwtKeyRow;
    } catch {
      // Stale/corrupted cache — пробуем БД
    }
  }

  // 2. D1 SELECT active
  let row = await selectActiveKey(env);
  if (row) {
    await cacheKey(env, row);
    return row;
  }

  // 3. Auto-init с lock
  const lockHeld = await env.KV_CACHE.get(KEY_LOCK_KEY);
  if (lockHeld) {
    // Другой воркер делает init. Ждём секунду и пробуем SELECT снова.
    await new Promise((r) => setTimeout(r, 1000));
    row = await selectActiveKey(env);
    if (row) {
      await cacheKey(env, row);
      return row;
    }
  }

  await env.KV_CACHE.put(KEY_LOCK_KEY, "1", {
    expirationTtl: KEY_LOCK_TTL_SECONDS,
  });

  try {
    row = await createNewActiveKey(env);
    await cacheKey(env, row);
    return row;
  } catch (err: unknown) {
    // UNIQUE WHERE status='active' violation — кто-то опередил
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("UNIQUE")) {
      row = await selectActiveKey(env);
      if (row) {
        await cacheKey(env, row);
        return row;
      }
    }
    throw new Error(`jwt: key auto-init failed: ${msg}`);
  } finally {
    await env.KV_CACHE.delete(KEY_LOCK_KEY);
  }
}

async function selectActiveKey(env: Cloudflare.Env): Promise<JwtKeyRow | null> {
  const row = await env.DB.prepare(
    "SELECT kid, secret_encrypted, status, created_at, expires_at, rotated_at, revoked_at FROM jwt_keys WHERE status='active' LIMIT 1",
  ).first<JwtKeyRow>();
  return row ?? null;
}

async function getKeyByKid(
  kid: string,
  env: Cloudflare.Env,
): Promise<JwtKeyRow | null> {
  const row = await env.DB.prepare(
    "SELECT kid, secret_encrypted, status, created_at, expires_at, rotated_at, revoked_at FROM jwt_keys WHERE kid=?",
  )
    .bind(kid)
    .first<JwtKeyRow>();
  return row ?? null;
}

async function cacheKey(env: Cloudflare.Env, row: JwtKeyRow): Promise<void> {
  await env.KV_CACHE.put(KEY_CACHE_KEY, JSON.stringify(row), {
    expirationTtl: KEY_CACHE_TTL_SECONDS,
  });
}

async function createNewActiveKey(env: Cloudflare.Env): Promise<JwtKeyRow> {
  // 1. 32 случайных байта → base64 → строка для HMAC
  const signingBytes = crypto.getRandomValues(new Uint8Array(32));
  let signingSecret = "";
  for (let i = 0; i < signingBytes.length; i++) {
    signingSecret += String.fromCharCode(signingBytes[i]);
  }
  signingSecret = btoa(signingSecret);

  // 2. Шифруем MASTER_SECRET'ом
  const encrypted = await encrypt(signingSecret, env.MASTER_SECRET);

  // 3. kid — версия + дата + uuid-prefix
  const date = new Date().toISOString().slice(0, 10);
  const uuidShort = crypto.randomUUID().slice(0, 8);
  const kid = `v1-${date}-${uuidShort}`;

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + KEY_LIFETIME_SECONDS;

  // 4. INSERT
  await env.DB.prepare(
    "INSERT INTO jwt_keys (kid, secret_encrypted, status, created_at, expires_at) VALUES (?, ?, 'active', ?, ?)",
  )
    .bind(kid, JSON.stringify(encrypted), now, expiresAt)
    .run();

  // 5. Читаем обратно (защита от случая когда default value подставился, не из bind)
  const row = await getKeyByKid(kid, env);
  if (!row) throw new Error(`jwt: failed to read back newly created key ${kid}`);
  return row;
}

/**
 * Admin/rotation helper — список всех валидных ключей (active + deprecated).
 * Используется для JWKS-style endpoint в будущем (если выдадим JWT внешним).
 */
export async function listValidKeys(env: Cloudflare.Env): Promise<JwtKeyRow[]> {
  const result = await env.DB.prepare(
    "SELECT kid, secret_encrypted, status, created_at, expires_at, rotated_at, revoked_at FROM jwt_keys WHERE status IN ('active','deprecated') ORDER BY created_at DESC",
  ).all<JwtKeyRow>();
  return result.results;
}

/** Узкий type-guard для status (TS friendly). */
export function isJwtKeyStatus(v: unknown): v is JwtKeyStatus {
  return v === "active" || v === "deprecated" || v === "revoked";
}
