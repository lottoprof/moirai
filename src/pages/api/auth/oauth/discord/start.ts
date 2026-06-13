/*
 * GET /api/auth/oauth/discord/start
 *
 * Стартует Discord OAuth flow (mirror google/start.ts):
 *   1. Generate state + PKCE verifier
 *   2. Сохранить в KV_OAUTH_STATE (TTL 10 min)
 *   3. 302 redirect на Discord authorization URL
 *
 * Query params:
 *   - `return_to` (optional) — куда вернуть user после login
 *   - `locale` (optional) — fallback для редиректа
 */

import type { APIRoute } from "astro";
import {
  generateState,
  generatePKCEVerifier,
  pkceChallengeFromVerifier,
  storeOAuthState,
  buildRedirectUri,
  validateReturnTo,
} from "../../../../../lib/server/oauth";
import { buildDiscordAuthUrl } from "../../../../../lib/server/oauth/discord";
import { checkRateLimit, RATE_LIMITS } from "../../../../../lib/server/ratelimit";
import { extractRequestInfo } from "../../../../../lib/server/hash";
import type { Locale } from "../../../../../../db/types";

export const prerender = false;

function htmlError(message: string): Response {
  return new Response(message, {
    status: 400,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export const GET: APIRoute = async ({ request, url, locals }) => {
  const env = locals.runtime.env;
  const { ip } = extractRequestInfo(request);

  const rl = await checkRateLimit(env, `oauth:discord:ip:${ip}`, RATE_LIMITS.oauthByIp);
  if (!rl.allowed) {
    return htmlError("Too many OAuth attempts. Try again in an hour.");
  }

  if (!env.DISCORD_CLIENT_ID) {
    return htmlError("Discord OAuth not configured on server.");
  }

  const returnTo = validateReturnTo(url.searchParams.get("return_to"));
  const rawLocale = url.searchParams.get("locale");
  const locale: Locale = rawLocale === "ru" ? "ru" : "en";

  const state = generateState();
  const verifier = generatePKCEVerifier();
  const challenge = await pkceChallengeFromVerifier(verifier);
  const redirectUri = buildRedirectUri(url, "discord");

  await storeOAuthState(env, "discord", state, {
    verifier,
    redirect_uri: redirectUri,
    return_to: returnTo,
    locale,
  });

  const authUrl = buildDiscordAuthUrl(env, {
    state,
    codeChallenge: challenge,
    redirectUri,
  });

  return new Response(null, {
    status: 302,
    headers: { Location: authUrl },
  });
};
