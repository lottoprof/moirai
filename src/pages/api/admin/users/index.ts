/*
 * POST /api/admin/users — admin создаёт нового user'a.
 *
 * Body:
 *   { email, name?, locale: 'en'|'ru', roles: ('student'|'instructor'|'admin')[], programme_slug? }
 *
 * Actions:
 *   1. requireRoleApi('admin')
 *   2. Validate (email unique, roles non-empty)
 *   3. INSERT users + user_roles (batch)
 *   4. (Optional) INSERT enrollment if programme_slug passed
 *   5. Generate password-reset token + send email "Set your password"
 *   6. audit_log: user_created_by_admin
 *
 * Returns: 200 { user_id, password_setup_url } — admin может скопировать
 *          URL если email не дойдёт.
 */

import type { APIRoute } from "astro";
import { z } from "zod";
import { requireRoleApi } from "../../../../lib/server/guards";
import { findUserByEmail } from "../../../../lib/server/user-ops";
import { createVerifyToken, TTL_PASSWORD_RESET } from "../../../../lib/server/verify-tokens";
import { sendEmail } from "../../../../lib/server/email";
import { logAuth } from "../../../../lib/server/audit";

export const prerender = false;

const Schema = z.object({
  email: z.string().email().max(254),
  name: z.string().max(120).optional(),
  locale: z.enum(["en", "ru"]),
  roles: z.array(z.enum(["student", "instructor", "admin"])).min(1),
  programme_slug: z.string().max(64).optional(),
});

function jsonError(code: string, status: number): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async (ctx) => {
  const guard = await requireRoleApi(ctx, "admin");
  if (guard instanceof Response) return guard;
  const admin = guard;
  const env = ctx.locals.runtime.env;

  let raw: unknown;
  try { raw = await ctx.request.json(); }
  catch { return jsonError("invalid_json", 400); }
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) return jsonError("invalid_input", 400);
  const { email, name, locale, roles, programme_slug } = parsed.data;

  // 1. Email unique?
  const existing = await findUserByEmail(env, email.toLowerCase());
  if (existing) return jsonError("email_exists", 409);

  // 2. INSERT user + user_roles + (optional) enrollment в одной batch'и
  const id = crypto.randomUUID();
  const referralCode = Math.random().toString(36).slice(2, 10).toUpperCase();
  const now = Math.floor(Date.now() / 1000);

  const statements = [
    env.DB.prepare(
      `INSERT INTO users
         (id, email, email_verified_at, name, locale, referral_code, created_at, updated_at)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`,
    ).bind(id, email.toLowerCase(), name ?? null, locale, referralCode, now, now),
    ...roles.map((r) =>
      env.DB.prepare(
        `INSERT INTO user_roles (user_id, role, granted_by, granted_at)
         VALUES (?, ?, ?, ?)`,
      ).bind(id, r, admin.id, now),
    ),
  ];
  await env.DB.batch(statements);

  // 3. (Optional) create enrollment
  if (programme_slug) {
    // Заглушка — без real programme.default_modules + price (Sprint 2 интегрируется
    // с Content Collection). Создаём пустой enrollment с status='active', price=0.
    await env.DB.prepare(
      `INSERT INTO enrollments
         (id, user_id, programme_slug, status,
          price_paid_amount, price_paid_currency, features_json,
          lead_instructor_id, enrolled_at, created_at, updated_at)
       VALUES (?, ?, ?, 'active', 0, 'USD', '{}', NULL, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), id, programme_slug, now, now, now).run();
  }

  // 4. Generate password-setup token + send email (reuse password-reset infra)
  const token = await createVerifyToken(env, {
    kind: "password_reset",
    userId: id,
    email: email.toLowerCase(),
    locale,
  }, TTL_PASSWORD_RESET);

  const setupUrl = `${ctx.url.origin}/${locale}/password-reset?token=${token}`;
  await sendEmail(env, {
    to: email.toLowerCase(),
    locale,
    kind: "password_reset",
    actionUrl: setupUrl,
    recipientName: name ?? null,
  });

  // 5. Audit
  await logAuth(env, "user_created_by_admin", id, null, ctx.request, {
    invited_by: admin.id,
    roles,
    programme_slug: programme_slug ?? null,
  });

  return new Response(
    JSON.stringify({ ok: true, user_id: id, password_setup_url: setupUrl }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
