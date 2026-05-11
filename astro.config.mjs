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
    }),
  ],
});
