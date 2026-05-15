/*
 * GET /api/auth/oauth/google/start
 *
 * Стартует OAuth flow:
 *   1. Generate state + PKCE verifier
 *   2. Сохранить в KV_OAUTH_STATE (TTL 10 min)
 *   3. 302 redirect на Google authorization URL
 *
 * Query params:
 *   - `return_to` (optional) — куда вернуть user после login (валидируется
 *     как same-origin path, не сторонний URL)
 *   - `locale` (optional) — для fallback redirect в /{locale}/dashboard
 *     если return_to пуст
 *
 * После callback'a user будет залогинен — даже если зарегистрирован
 * до этого с password method (мерджится в auth_methods).
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
import { buildGoogleAuthUrl } from "../../../../../lib/server/oauth/google";
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

  // Rate limit — anti-abuse defense
  const rl = await checkRateLimit(env, `oauth:google:ip:${ip}`, RATE_LIMITS.oauthByIp);
  if (!rl.allowed) {
    return htmlError("Too many OAuth attempts. Try again in an hour.");
  }

  // Не запустимся без credentials — fail-fast
  if (!env.GOOGLE_CLIENT_ID) {
    return htmlError("Google OAuth not configured on server.");
  }

  // Parse + validate query
  const returnTo = validateReturnTo(url.searchParams.get("return_to"));
  const rawLocale = url.searchParams.get("locale");
  const locale: Locale = rawLocale === "ru" ? "ru" : "en";

  // Generate state + PKCE
  const state = generateState();
  const verifier = generatePKCEVerifier();
  const challenge = await pkceChallengeFromVerifier(verifier);
  const redirectUri = buildRedirectUri(url, "google");

  // Store in KV
  await storeOAuthState(env, "google", state, {
    verifier,
    redirect_uri: redirectUri,
    return_to: returnTo,
    locale,
  });

  // Build provider auth URL и redirect
  const authUrl = buildGoogleAuthUrl(env, {
    state,
    codeChallenge: challenge,
    redirectUri,
  });

  return new Response(null, {
    status: 302,
    headers: { Location: authUrl },
  });
};
