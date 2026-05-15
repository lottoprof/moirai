/*
 * OAuth common utilities — state + PKCE management через KV_OAUTH_STATE.
 *
 * Используется обоими OAuth провайдерами (Google, Discord, future).
 * Provider-specific логика (auth URL / token exchange / userinfo) —
 * в `oauth/google.ts`, `oauth/discord.ts`.
 *
 * Flow:
 *   /start endpoint:
 *     - generateState() + generatePKCEVerifier()
 *     - PKCE challenge = sha256(verifier) base64url
 *     - storeOAuthState(state, { verifier, return_to, redirectUri })
 *     - redirect на provider auth URL с code_challenge=challenge
 *   /callback endpoint:
 *     - получает ?code=...&state=...
 *     - consumeOAuthState(state) → достаёт { verifier, return_to, redirectUri }
 *     - exchange code + verifier на провайдере → id_token / access_token
 *     - verify id_token (или fetch userinfo)
 *     - link / create user, выдать session
 *
 * Security:
 *   - state — защита от CSRF (атакующий не может предсказать)
 *   - PKCE — защита от auth code interception (verifier нужен для exchange,
 *     attacker который перехватил code не имеет verifier)
 *   - KV TTL 10 мин — окно для completion flow; expired state → reject
 */

import type { Locale } from "../../../db/types";

export type OAuthProvider = "google" | "discord";

export interface OAuthStateData {
  verifier: string;
  /** Full redirect URI which был передан provider'у — должен совпадать на /callback. */
  redirect_uri: string;
  /** Куда вернуть user после успешного login. Path-only, валидировать перед использованием. */
  return_to: string | null;
  /** Locale из start request — для редиректа на /{locale}/dashboard если return_to пуст. */
  locale: Locale;
  /** Когда создан, unix-seconds. Логирование, не валидация. */
  created_at: number;
}

const KV_PREFIX = "oauth:state:";
const STATE_TTL_SECONDS = 600;        // 10 min
const STATE_BYTES = 32;
const VERIFIER_BYTES = 32;            // > 32 bytes base64 = 43+ chars, max 128 в spec

// ============================================================
// Random state / verifier
// ============================================================

function bytesToBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateState(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(STATE_BYTES)));
}

export function generatePKCEVerifier(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(VERIFIER_BYTES)));
}

/** PKCE code_challenge = base64url(SHA-256(verifier)). */
export async function pkceChallengeFromVerifier(verifier: string): Promise<string> {
  const hashed = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return bytesToBase64Url(new Uint8Array(hashed));
}

// ============================================================
// State KV storage
// ============================================================

function stateKey(provider: OAuthProvider, state: string): string {
  return `${KV_PREFIX}${provider}:${state}`;
}

export async function storeOAuthState(
  env: Cloudflare.Env,
  provider: OAuthProvider,
  state: string,
  data: Omit<OAuthStateData, "created_at">,
): Promise<void> {
  const payload: OAuthStateData = {
    ...data,
    created_at: Math.floor(Date.now() / 1000),
  };
  await env.KV_OAUTH_STATE.put(stateKey(provider, state), JSON.stringify(payload), {
    expirationTtl: STATE_TTL_SECONDS,
  });
}

/**
 * Consume state — GET + DELETE атомарно (best-effort через KV).
 * Возвращает null если state не найден / expired / уже consumed.
 */
export async function consumeOAuthState(
  env: Cloudflare.Env,
  provider: OAuthProvider,
  state: string,
): Promise<OAuthStateData | null> {
  const key = stateKey(provider, state);
  const raw = await env.KV_OAUTH_STATE.get(key);
  if (!raw) return null;

  let payload: OAuthStateData;
  try {
    payload = JSON.parse(raw) as OAuthStateData;
  } catch {
    await env.KV_OAUTH_STATE.delete(key);
    return null;
  }
  await env.KV_OAUTH_STATE.delete(key);
  return payload;
}

// ============================================================
// Redirect URI builder
// ============================================================

/**
 * Построить redirect_uri для callback'a исходя из URL текущего запроса.
 * Origin берётся из request.url — это гарантирует match с тем что
 * настроено в Google Console (apex / pages.dev / localhost).
 */
export function buildRedirectUri(
  requestUrl: URL,
  provider: OAuthProvider,
): string {
  return `${requestUrl.origin}/api/auth/oauth/${provider}/callback`;
}

// ============================================================
// return_to safe-validate
// ============================================================

/**
 * return_to из query — может прийти от attacker'a. Принимаем только:
 *   - same-origin paths (starting with `/`)
 *   - не `//` (protocol-relative — может быть external)
 *   - max 256 chars
 * Если невалидно — возвращаем null, caller fallback на /{locale}/dashboard.
 */
export function validateReturnTo(returnTo: string | null | undefined): string | null {
  if (!returnTo) return null;
  if (typeof returnTo !== "string") return null;
  if (returnTo.length > 256) return null;
  if (!returnTo.startsWith("/")) return null;
  if (returnTo.startsWith("//")) return null;          // protocol-relative
  if (returnTo.startsWith("/\\")) return null;         // backslash trick
  return returnTo;
}
