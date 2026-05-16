/*
 * GET /api/auth/me
 *
 * Возвращает текущего user-а на основе access JWT в Authorization
 * header (`Authorization: Bearer <jwt>`).
 *
 * Response:
 *   200 { ok: true, user, methods: [{kind, providerEmail?, createdAt}] }
 *   401 { error: "unauthenticated" }
 */

import type { APIRoute } from "astro";
import { verifyJWT } from "../../../lib/server/jwt";
import { findUserById, getUserAuthMethods } from "../../../lib/server/user-ops";
import { extractRequestInfo } from "../../../lib/server/hash";

export const prerender = false;

interface JwtPayload extends Record<string, unknown> {
  sub?: string;
}

export const GET: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const { ip, ua } = extractRequestInfo(request);

  const auth = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/.exec(auth);
  if (!match) {
    return new Response(JSON.stringify({ error: "unauthenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const token = match[1];

  const payload = await verifyJWT<JwtPayload>(token, env, {
    fingerprint: { ip, ua },
  });
  if (!payload?.sub) {
    return new Response(JSON.stringify({ error: "unauthenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const user = await findUserById(env, payload.sub);
  if (!user) {
    return new Response(JSON.stringify({ error: "unauthenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const methods = await getUserAuthMethods(env, user.id);

  // roles из user_roles (migration 0003 multi-role).
  const rolesRows = await env.DB.prepare(
    `SELECT role FROM user_roles WHERE user_id = ?`,
  ).bind(user.id).all<{ role: string }>();
  const roles = rolesRows.results.map((r) => r.role);

  return new Response(
    JSON.stringify({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        locale: user.locale,
        roles,
        deactivated: user.deactivated_at !== null,
        email_verified: user.email_verified_at !== null,
        referral_code: user.referral_code,
      },
      methods: methods.map((m) => ({
        kind: m.kind,
        provider_email: m.provider_email,
        created_at: m.created_at,
        last_used_at: m.last_used_at,
      })),
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
};
