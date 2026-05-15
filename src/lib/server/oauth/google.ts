/*
 * Google OAuth provider — auth URL builder + token exchange + JWKS verify.
 *
 * Flow:
 *   1. /start вызывает buildGoogleAuthUrl(env, state, codeChallenge, redirectUri).
 *      Возвращает URL вида:
 *      https://accounts.google.com/o/oauth2/v2/auth?client_id=...&scope=openid+email+profile
 *        &response_type=code&redirect_uri=...&state=...&code_challenge=...
 *        &code_challenge_method=S256
 *   2. /callback получает ?code=...&state=...
 *   3. exchangeGoogleCode(env, code, codeVerifier, redirectUri) — POST на token endpoint,
 *      возвращает { id_token, access_token }.
 *   4. verifyGoogleIdToken(env, idToken) — JWKS-верификация подписи через
 *      Google PEM-keys + проверка iss/aud. Возвращает GoogleUserInfo.
 *
 * Security:
 *   - id_token верифицируется криптографически (НЕ trust на основании
 *     получения от Google — для PKCE flow это и так гарантировано, но
 *     double-check не повредит)
 *   - aud == GOOGLE_CLIENT_ID — защита от token confusion attack
 *   - iss == https://accounts.google.com или accounts.google.com
 *   - exp/iat проверяются jose автоматически
 */

import { createRemoteJWKSet, jwtVerify } from "jose";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ALLOWED_ISSUERS = new Set([
  "https://accounts.google.com",
  "accounts.google.com",
]);

const SCOPES = ["openid", "email", "profile"];

export interface GoogleUserInfo {
  /** Stable Google account ID (sub claim). Использовать как auth_methods.provider_user_id. */
  sub: string;
  email: string;
  email_verified: boolean;
  name: string | null;
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  id_token: string;
  scope: string;
  refresh_token?: string;
}

/**
 * Построить Google OAuth authorization URL.
 * Client'у нужен только state + codeChallenge (verifier хранится server-side в KV).
 */
export function buildGoogleAuthUrl(
  env: Cloudflare.Env,
  params: {
    state: string;
    codeChallenge: string;
    redirectUri: string;
    /** login_hint email для pre-fill (опционально) */
    loginHint?: string;
  },
): string {
  if (!env.GOOGLE_CLIENT_ID) {
    throw new Error("GOOGLE_CLIENT_ID not configured");
  }
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("access_type", "online");
  url.searchParams.set("prompt", "select_account");
  if (params.loginHint) {
    url.searchParams.set("login_hint", params.loginHint);
  }
  return url.toString();
}

/**
 * Обмен code на tokens через Google token endpoint.
 * Throws при network error / non-2xx / invalid response.
 */
export async function exchangeGoogleCode(
  env: Cloudflare.Env,
  params: { code: string; codeVerifier: string; redirectUri: string },
): Promise<GoogleTokenResponse> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error("GOOGLE_CLIENT_ID / SECRET not configured");
  }

  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    code: params.code,
    code_verifier: params.codeVerifier,
    redirect_uri: params.redirectUri,
    grant_type: "authorization_code",
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`google token exchange failed: ${res.status.toString()} ${text}`);
  }

  return await res.json<GoogleTokenResponse>();
}

// JWKS client cached в module scope — переиспользуется между запросами в worker.
// jose сама кеширует ключи + поддерживает rotation.
const jwks = createRemoteJWKSet(new URL(JWKS_URL));

/**
 * Cryptographically verify id_token via Google JWKS + проверка iss / aud.
 * Возвращает GoogleUserInfo или throw при invalid token.
 */
export async function verifyGoogleIdToken(
  env: Cloudflare.Env,
  idToken: string,
): Promise<GoogleUserInfo> {
  if (!env.GOOGLE_CLIENT_ID) {
    throw new Error("GOOGLE_CLIENT_ID not configured");
  }

  const { payload } = await jwtVerify(idToken, jwks, {
    audience: env.GOOGLE_CLIENT_ID,
    // Google использует две вариации issuer — jose проверяет точное совпадение,
    // поэтому проверим вручную ниже
  });

  // Manual iss check (jose не поддерживает array of allowed issuers нативно)
  const iss = typeof payload.iss === "string" ? payload.iss : "";
  if (!ALLOWED_ISSUERS.has(iss)) {
    throw new Error(`google id_token invalid issuer: ${iss}`);
  }

  const sub = typeof payload.sub === "string" ? payload.sub : "";
  const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
  const emailVerified = payload.email_verified === true;
  const name = typeof payload.name === "string" ? payload.name : null;

  if (!sub) throw new Error("google id_token missing sub");
  if (!email) throw new Error("google id_token missing email");

  return { sub, email, email_verified: emailVerified, name };
}
