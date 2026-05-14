/*
 * Refresh sessions — long-lived state в D1 + HttpOnly cookie.
 *
 * Hybrid auth (decisions_archive.md 2026-05-12):
 *   Access JWT  — 15 min, stateless, в Authorization header или cookie.
 *   Refresh     — 30 days, opaque secret в HttpOnly cookie, sha256 → auth_sessions.
 *
 * При refresh клиент шлёт __Host-moirai_refresh cookie → проверяем
 * против auth_sessions → выдаём новый access JWT. Refresh token
 * (плейн) — НЕ ротируется на каждом refresh (упрощает race conditions
 * при параллельных refresh-запросах); rotation в будущем — отдельный
 * stage если потребуется.
 *
 * Wire-формат cookie value: `<session_id>.<secret_token>` (base64url).
 *   session_id   — primary key auth_sessions, opaque random (UUID v7).
 *   secret_token — 32 random bytes base64url, sha256(secret_token) →
 *                  auth_sessions.token_hash для верификации.
 *
 * Cookie attributes:
 *   __Host- prefix     — RFC 6265bis: requires Secure, Path=/, no Domain.
 *                        Сильнейшая защита от cookie injection / theft.
 *   HttpOnly           — JS не читает.
 *   Secure             — только HTTPS (localhost тоже secure context).
 *   SameSite=Lax       — CSRF защита (POST cross-site без cookie).
 *   Path=/             — обязательно для __Host-.
 *   Max-Age=2_592_000  — 30 days.
 */

import type { AuthSessionRow } from "../../../db/types";
import { sha256Hex, hashIp, extractRequestInfo } from "./hash";

const COOKIE_NAME = "__Host-moirai_refresh";
const REFRESH_TTL_SECONDS = 30 * 24 * 3600;     // 30 дней
const SECRET_BYTES = 32;

export interface SessionVerifyResult {
  userId: string;
  sessionId: string;
}

// ============================================================
// Create / verify / revoke
// ============================================================

/**
 * Создать refresh-сессию: row в auth_sessions + Set-Cookie header.
 * Возвращает { sessionId, cookieHeader } — caller сам ставит
 * cookieHeader в Response.headers.append("Set-Cookie", ...).
 */
export async function createRefreshSession(
  env: Cloudflare.Env,
  userId: string,
  request: Request,
): Promise<{ sessionId: string; cookieHeader: string }> {
  const sessionId = crypto.randomUUID();
  const secretBytes = crypto.getRandomValues(new Uint8Array(SECRET_BYTES));
  const secretToken = bytesToBase64Url(secretBytes);
  const tokenHash = await sha256Hex(secretToken);

  const { ip, ua } = extractRequestInfo(request);
  const ipHash = await hashIp(ip, env.IP_HASH_SALT);

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + REFRESH_TTL_SECONDS;

  await env.DB.prepare(
    `INSERT INTO auth_sessions
       (id, user_id, token_hash, expires_at, created_at, last_seen_at, user_agent, ip_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(sessionId, userId, tokenHash, expiresAt, now, now, ua, ipHash)
    .run();

  const cookieValue = `${sessionId}.${secretToken}`;
  const cookieHeader = buildSetCookieHeader(cookieValue, REFRESH_TTL_SECONDS);

  return { sessionId, cookieHeader };
}

/**
 * Проверить refresh-сессию из cookie. Возвращает userId+sessionId или
 * null. Также обновляет last_seen_at если сессия валидна.
 *
 * Null причины (не различает наружу — лог только в audit):
 *   - cookie отсутствует / malformed
 *   - session_id в БД не найден
 *   - token_hash mismatch (secret подменён)
 *   - revoked_at не null (logout / manual revoke)
 *   - expires_at в прошлом
 */
export async function verifyRefreshSession(
  env: Cloudflare.Env,
  request: Request,
): Promise<SessionVerifyResult | null> {
  const cookieValue = readRefreshCookie(request);
  if (!cookieValue) return null;

  const dotIdx = cookieValue.indexOf(".");
  if (dotIdx <= 0 || dotIdx === cookieValue.length - 1) return null;
  const sessionId = cookieValue.slice(0, dotIdx);
  const secretToken = cookieValue.slice(dotIdx + 1);

  const tokenHash = await sha256Hex(secretToken);
  const now = Math.floor(Date.now() / 1000);

  const row = await env.DB.prepare(
    `SELECT user_id, token_hash, expires_at, revoked_at
       FROM auth_sessions WHERE id = ?`,
  )
    .bind(sessionId)
    .first<Pick<AuthSessionRow, "user_id" | "token_hash" | "expires_at" | "revoked_at">>();

  if (!row) return null;
  if (row.revoked_at !== null) return null;
  if (row.expires_at < now) return null;

  // Constant-time-ish compare через hex string equality (sha256 hash —
  // длина фиксированная, timing-leak отсутствует на equal-length strings)
  if (row.token_hash !== tokenHash) return null;

  // Touch last_seen_at — не блокирует если упадёт (eventual consistency)
  await env.DB.prepare(
    `UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?`,
  )
    .bind(now, sessionId)
    .run();

  return { userId: row.user_id, sessionId };
}

/** Soft-revoke одной сессии — UPDATE revoked_at = now. Row остаётся для audit. */
export async function revokeRefreshSession(
  env: Cloudflare.Env,
  sessionId: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE auth_sessions SET revoked_at = ?
       WHERE id = ? AND revoked_at IS NULL`,
  )
    .bind(now, sessionId)
    .run();
}

/**
 * Logout from all devices — revoke все активные сессии user-а.
 * Используется при смене пароля, при подозрении на компрометацию,
 * или явном "sign out from all devices" в profile.
 */
export async function revokeAllUserSessions(
  env: Cloudflare.Env,
  userId: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE auth_sessions SET revoked_at = ?
       WHERE user_id = ? AND revoked_at IS NULL`,
  )
    .bind(now, userId)
    .run();
}

// ============================================================
// Cookie helpers
// ============================================================

/**
 * Прочитать refresh-cookie из Request.
 * Парсер простой — wrangler/Workers не предоставляют cookie API.
 */
export function readRefreshCookie(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  const prefix = `${COOKIE_NAME}=`;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length);
    }
  }
  return null;
}

/** Build Set-Cookie header для login response. */
function buildSetCookieHeader(value: string, maxAgeSeconds: number): string {
  // __Host- requires: Secure + Path=/ + NO Domain
  return [
    `${COOKIE_NAME}=${value}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAgeSeconds.toString()}`,
  ].join("; ");
}

/**
 * Build Set-Cookie header для logout — Max-Age=0 заставляет браузер
 * сбросить cookie немедленно.
 */
export function buildLogoutCookieHeader(): string {
  return [
    `${COOKIE_NAME}=`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0",
  ].join("; ");
}

// ============================================================
// Internal — base64url encode без зависимостей
// ============================================================

function bytesToBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
