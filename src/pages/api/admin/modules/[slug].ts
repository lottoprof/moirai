/*
 * POST /api/admin/modules/{slug}
 *
 * Body: { en?: { title, status }, ru?: { title, status } }
 *
 * Update title + status per locale. Body content / R2 keys не трогаем —
 * это управляется через methodist repo.
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireRoleApi } from '../../../../lib/server/guards';

export const prerender = false;

const LangPayload = z.object({
  title: z.string().min(1),
  status: z.enum(['draft', 'published', 'archived']),
});
const BodySchema = z.object({
  en: LangPayload.optional(),
  ru: LangPayload.optional(),
});

function jsonError(code: string, status: number): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async (ctx) => {
  const adminOrRes = await requireRoleApi(ctx, 'admin');
  if (adminOrRes instanceof Response) return adminOrRes;

  const slug = ctx.params.slug;
  if (typeof slug !== 'string' || slug.length === 0) return jsonError('missing_slug', 400);

  let raw: unknown;
  try { raw = await ctx.request.json(); } catch { return jsonError('invalid_json', 400); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return jsonError('invalid_input', 400);

  const env = ctx.locals.runtime.env;
  const now = Math.floor(Date.now() / 1000);

  const ops = [];
  if (parsed.data.en) {
    ops.push(env.DB.prepare(
      `UPDATE modules SET title = ?, status = ?, updated_at = ?
        WHERE slug = ? AND locale = 'en'`,
    ).bind(parsed.data.en.title, parsed.data.en.status, now, slug));
  }
  if (parsed.data.ru) {
    ops.push(env.DB.prepare(
      `UPDATE modules SET title = ?, status = ?, updated_at = ?
        WHERE slug = ? AND locale = 'ru'`,
    ).bind(parsed.data.ru.title, parsed.data.ru.status, now, slug));
  }
  if (ops.length > 0) await env.DB.batch(ops);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
