/*
 * Discord OAuth provider — auth URL builder + token exchange + user fetch.
 *
 * Flow:
 *   1. /start вызывает buildDiscordAuthUrl(env, state, codeChallenge, redirectUri).
 *      Возвращает URL вида:
 *      https://discord.com/oauth2/authorize?client_id=...&scope=identify+email
 *        &response_type=code&redirect_uri=...&state=...&code_challenge=...
 *        &code_challenge_method=S256
 *   2. /callback получает ?code=...&state=...
 *   3. exchangeDiscordCode(env, code, codeVerifier, redirectUri) — POST на token endpoint,
 *      возвращает { access_token, refresh_token, scope, ... }.
 *   4. fetchDiscordUser(accessToken) — GET /users/@me с Bearer token.
 *      Возвращает DiscordUserInfo.
 *
 * Особенности vs Google:
 *   - Discord не возвращает id_token (нет OpenID Connect для default scope).
 *   - User info берём через REST /users/@me, а не JWKS-verify.
 *   - Email может быть NULL если user не подтвердил email на Discord —
 *     caller (callback.ts) обрабатывает как `discord_no_email`.
 *
 * Spec: https://discord.com/developers/docs/topics/oauth2
 * Scopes: https://discord.com/developers/docs/topics/oauth2#shared-resources-oauth2-scopes
 */

const AUTH_ENDPOINT = "https://discord.com/oauth2/authorize";
const TOKEN_ENDPOINT = "https://discord.com/api/oauth2/token";
const USER_ENDPOINT = "https://discord.com/api/users/@me";

const SCOPES = ["identify", "email"];

export interface DiscordUserInfo {
  /** Snowflake user ID — stable across username changes. Используем как
   *  auth_methods.provider_user_id. */
  id: string;
  /** Discord username (без discriminator после Username 2.0 migration). */
  username: string;
  /** Display name (опциональный) — если задано в Discord-профиле. */
  global_name: string | null;
  /** Может быть null если user не подтвердил email на Discord. */
  email: string | null;
  /** True если Discord подтвердил email. NULL email → verified тоже null/false. */
  verified: boolean;
}

interface DiscordTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

/**
 * Построить Discord OAuth authorization URL с PKCE challenge.
 */
export function buildDiscordAuthUrl(
  env: Cloudflare.Env,
  params: {
    state: string;
    codeChallenge: string;
    redirectUri: string;
  },
): string {
  if (!env.DISCORD_CLIENT_ID) {
    throw new Error("DISCORD_CLIENT_ID not configured");
  }
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("client_id", env.DISCORD_CLIENT_ID);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

/**
 * Обмен code на access_token через Discord token endpoint.
 * Throws при network error / non-2xx / invalid response.
 */
export async function exchangeDiscordCode(
  env: Cloudflare.Env,
  params: { code: string; codeVerifier: string; redirectUri: string },
): Promise<DiscordTokenResponse> {
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET) {
    throw new Error("DISCORD_CLIENT_ID / SECRET not configured");
  }

  const body = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    client_secret: env.DISCORD_CLIENT_SECRET,
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
    throw new Error(`discord token exchange failed: ${res.status.toString()} ${text}`);
  }

  return await res.json<DiscordTokenResponse>();
}

/**
 * Fetch user info через Discord REST /users/@me с Bearer access_token.
 * Throws при non-2xx или missing required field.
 */
export async function fetchDiscordUser(
  accessToken: string,
): Promise<DiscordUserInfo> {
  const res = await fetch(USER_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`discord /users/@me failed: ${res.status.toString()} ${text}`);
  }

  const data = await res.json<{
    id?: string;
    username?: string;
    global_name?: string | null;
    email?: string | null;
    verified?: boolean;
  }>();

  if (!data.id) throw new Error("discord user missing id");
  if (!data.username) throw new Error("discord user missing username");

  return {
    id: data.id,
    username: data.username,
    global_name: data.global_name ?? null,
    email: typeof data.email === "string" ? data.email.toLowerCase() : null,
    verified: data.verified === true,
  };
}
