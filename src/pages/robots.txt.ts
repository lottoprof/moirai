/*
 * GET /robots.txt — SSR-route чтобы обойти CF Pages "Managed Robots.txt"
 * (AI Audit / Crawl Control feature, которая prepend'ит свой блок с
 * нестандартной директивой `Content-Signal:` → Google Search Console
 * валит это как "Unknown directive").
 *
 * Static `public/robots.txt` процессится CF и получает managed prefix.
 * SSR endpoint возвращает text/plain напрямую, обходя transformation.
 *
 * Source-of-truth — этот файл. Менять disallow paths здесь.
 *
 * Stage 8.
 */

import type { APIRoute } from "astro";

export const prerender = false;

const BODY = `# Moirai — robots.txt
# Stage 8: разрешаем индексацию публичного сайта; protected zones
# (admin / dashboard / instructor / checkout / apply) исключены —
# их страницы возвращают noindex meta + 404/redirect для unauthenticated,
# layered defense.

User-agent: *
Allow: /

# Protected / non-marketing zones
Disallow: /admin/
Disallow: /api/
Disallow: /en/dashboard/
Disallow: /ru/dashboard/
Disallow: /en/instructor/
Disallow: /ru/instructor/
Disallow: /en/account
Disallow: /ru/account
Disallow: /en/checkout
Disallow: /ru/checkout
Disallow: /en/apply/contact
Disallow: /ru/apply/contact
Disallow: /en/login
Disallow: /ru/login
Disallow: /en/register
Disallow: /ru/register
Disallow: /en/password-reset
Disallow: /ru/password-reset
Disallow: /en/verify-email
Disallow: /ru/verify-email
Disallow: /en/verify-email-pending
Disallow: /ru/verify-email-pending
Disallow: /en/inactive
Disallow: /ru/inactive

# AI scrapers — контент Moirai open для индексации (продаём курс,
# не текст). Если когда-то понадобится opt-out — добавим конкретных
# user-agent'ов (GPTBot, ClaudeBot, Google-Extended) с Disallow: /.

Sitemap: https://moiraionline.pro/sitemap-index.xml
`;

export const GET: APIRoute = () => {
  return new Response(BODY, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
