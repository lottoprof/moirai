// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://moiraionline.pro",
  output: "server",
  adapter: cloudflare({
    platformProxy: { enabled: true },
  }),
  // Stage 8: inline весь CSS как <style> в HTML — устраняет render-blocking
  // CSS request'ы на mobile throttle (3×~10KB → ~300-900ms до first paint).
  // Trade-off: HTML +30KB / gzip +6KB; CSS не кешируется отдельно, но CF edge
  // cache HTML это покрывает.
  build: {
    inlineStylesheets: "always",
  },
  i18n: {
    defaultLocale: "en",
    locales: ["en", "ru"],
    routing: {
      prefixDefaultLocale: true,
      redirectToDefaultLocale: false,
    },
  },
  integrations: [
    mdx(),
    sitemap({
      i18n: {
        defaultLocale: "en",
        locales: { en: "en", ru: "ru" },
      },
      // Исключаем auth-walled, transactional и admin страницы из sitemap.
      // Sitemap = только публичные SEO-страницы. См. docs/seo-markup-rules.md §3.
      filter: (page) =>
        !page.includes("/admin/") &&
        !page.includes("/dashboard/") &&
        !page.includes("/checkout/") &&
        !page.includes("/verify-email-pending/") &&
        !page.includes("/inactive/") &&
        !page.includes("/account/") &&
        !page.includes("/login") &&
        !page.includes("/register"),
    }),
  ],
});
